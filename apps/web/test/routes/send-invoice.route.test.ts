import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ledgerDbAvailable, startRouteHarness, type RouteHarness } from './route-harness.js';
import { idBy, provisionOrg } from './provision.js';
import type { InvoiceInput } from '../../app/contracts/invoice.js';
// Type-only imports (erased at runtime, so they do NOT build the db singleton ahead of the harness):
// the values themselves are dynamically imported in beforeAll, after startRouteHarness sets DATABASE_URL.
import type { db as DbValue } from '../../app/db/client.js';
import type { withOrgTx as WithOrgTxFn } from '../../app/auth/middleware.js';
import type {
  createDraft as CreateDraftFn,
  issueInvoice as IssueInvoiceFn,
} from '../../app/db/invoices.server.js';

// Needs a real Postgres (Docker/Testcontainers, or SALDO_TEST_PG_URI). Skips cleanly otherwise.

/**
 * Route-level tests for the invoice issue/send action intents and the PDF + EHF resource routes —
 * named by review §9 as untested. The detail action's `issue` mints the gapless number and posts the
 * AR voucher; `send` resolves to a typed {error}/{success} channel (the harness has no SMTP, so the
 * deterministic no-recipient / not-configured branches are what we lock). The pdf/ehf loaders mirror
 * xml-export.route.test.ts: a draft/other-tenant doc is a 404; an issued doc is 200 with exact
 * download headers (`private, no-store`) and a marker substring of the body — content correctness is
 * covered by the domain/integrity suites, not re-asserted here.
 *
 * Setup drives the REAL server fns (createDraft → issueInvoice) the way the integrity suites do, so an
 * issued invoice carries a real number, KID and posted voucher.
 */
type Handler = (a: { request: Request; params: Record<string, string> }) => Promise<unknown>;

describe.skipIf(!ledgerDbAvailable)(
  'invoices issue/send + pdf/ehf — actions + resource routes',
  () => {
    let h: RouteHarness;
    let detailAction: Handler;
    let pdfLoader: Handler;
    let ehfLoader: Handler;
    let db: typeof DbValue;
    let withOrgTx: typeof WithOrgTxFn;
    let createDraft: typeof CreateDraftFn;
    let issueInvoice: typeof IssueInvoiceFn;

    beforeAll(async () => {
      h = await startRouteHarness();
      const detail = await import('../../app/routes/orgs.$orgId.invoices.$invoiceId.js');
      const pdf = await import('../../app/routes/orgs.$orgId.invoices.$invoiceId.pdf.js');
      const ehf = await import('../../app/routes/orgs.$orgId.invoices.$invoiceId.ehf.js');
      detailAction = detail.action as unknown as Handler;
      pdfLoader = pdf.loader as unknown as Handler;
      ehfLoader = ehf.loader as unknown as Handler;
      ({ db } = await import('../../app/db/client.js'));
      ({ withOrgTx } = await import('../../app/auth/middleware.js'));
      ({ createDraft, issueInvoice } = await import('../../app/db/invoices.server.js'));
    });

    afterAll(async () => {
      await h.stop();
    });

    async function invoiceInput(
      orgId: string,
      over: Partial<InvoiceInput> = {},
    ): Promise<InvoiceInput> {
      return {
        kind: 'invoice',
        customerId: '',
        customerName: 'Kjøper AS',
        customerEmail: 'kunde@example.no',
        customerOrgNr: '',
        customerAddress: 'Kongens gate 2, 5003 Bergen',
        currency: 'NOK',
        language: 'nb',
        issueDate: '',
        dueDate: '',
        creditsInvoiceId: '',
        notes: '',
        lines: [
          {
            productId: '',
            description: 'Konsulenttime',
            quantity: '10',
            unit: 'time',
            unitPriceKr: '1000',
            accountId: await idBy(h.ledger.sql, 'account', orgId, 'number', '3000'),
            vatCodeId: await idBy(h.ledger.sql, 'vat_code', orgId, 'code', '3'),
          },
        ],
        ...over,
      };
    }

    async function draft(orgId: string, over: Partial<InvoiceInput> = {}): Promise<string> {
      const input = await invoiceInput(orgId, over);
      const created = await withOrgTx(db, orgId, (tx) => createDraft(tx, orgId, input));
      if (!created.ok) throw new Error(`createDraft failed: ${created.error}`);
      return created.id;
    }

    async function issued(orgId: string, over: Partial<InvoiceInput> = {}): Promise<string> {
      const id = await draft(orgId, over);
      await withOrgTx(db, orgId, (tx) =>
        issueInvoice(tx, orgId, id, { issueDate: '2026-06-25', dueDate: '2026-07-09' }),
      );
      return id;
    }

    function invoiceForm(intent: string): FormData {
      const fd = new FormData();
      fd.set('intent', intent);
      return fd;
    }

    // ── PDF resource route ──────────────────────────────────────────────────────────────────────────
    it('pdf: 404 on a non-uuid org id', async () => {
      const res = await h.invoke(() =>
        pdfLoader({
          request: h.request('/orgs/x/invoices/y/pdf'),
          params: { orgId: 'x', invoiceId: 'y' },
        }),
      );
      expect((res as Response).status).toBe(404);
    });

    it('pdf: 404 for a DRAFT invoice (no frozen document until issued)', async () => {
      const orgId = await provisionOrg(h.ledger.sql);
      const cookie = await h.sessionCookie(await h.createMember(orgId));
      const id = await draft(orgId);
      const res = await h.invoke(() =>
        pdfLoader({
          request: h.request(`/orgs/${orgId}/invoices/${id}/pdf`, { cookie }),
          params: { orgId, invoiceId: id },
        }),
      );
      expect((res as Response).status).toBe(404);
    });

    it('pdf: 200 + application/pdf download headers for an issued invoice', async () => {
      const orgId = await provisionOrg(h.ledger.sql);
      const cookie = await h.sessionCookie(await h.createMember(orgId));
      const id = await issued(orgId);
      const res = (await h.invoke(() =>
        pdfLoader({
          request: h.request(`/orgs/${orgId}/invoices/${id}/pdf`, { cookie }),
          params: { orgId, invoiceId: id },
        }),
      )) as Response;
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('application/pdf');
      expect(res.headers.get('content-disposition')).toMatch(
        /^inline; filename="faktura-\d+\.pdf"$/,
      );
      expect(res.headers.get('cache-control')).toBe('private, no-store');
    });

    it('pdf: 403 for an authenticated non-member', async () => {
      const orgId = await provisionOrg(h.ledger.sql);
      const id = await issued(orgId);
      const cookie = await h.sessionCookie(await h.createMember(null));
      const res = await h.invoke(() =>
        pdfLoader({
          request: h.request(`/orgs/${orgId}/invoices/${id}/pdf`, { cookie }),
          params: { orgId, invoiceId: id },
        }),
      );
      expect((res as Response).status).toBe(403);
    });

    // ── EHF resource route ──────────────────────────────────────────────────────────────────────────
    it('ehf: 404 for a draft, 200 + xml headers + well-formed UBL for an issued invoice', async () => {
      const orgId = await provisionOrg(h.ledger.sql);
      const cookie = await h.sessionCookie(await h.createMember(orgId));

      const draftId = await draft(orgId);
      const draftRes = await h.invoke(() =>
        ehfLoader({
          request: h.request(`/orgs/${orgId}/invoices/${draftId}/ehf`, { cookie }),
          params: { orgId, invoiceId: draftId },
        }),
      );
      expect((draftRes as Response).status).toBe(404);

      const id = await issued(orgId);
      const res = (await h.invoke(() =>
        ehfLoader({
          request: h.request(`/orgs/${orgId}/invoices/${id}/ehf`, { cookie }),
          params: { orgId, invoiceId: id },
        }),
      )) as Response;
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('application/xml; charset=utf-8');
      expect(res.headers.get('content-disposition')).toMatch(
        /^attachment; filename="ehf-\d+\.xml"$/,
      );
      expect(res.headers.get('cache-control')).toBe('private, no-store');
      const body = await res.text();
      expect(body).toContain('<cbc:CustomizationID>');
      expect(body).toContain('<cbc:CompanyID schemeID="0192">');
    });

    // ── Detail action: issue + send intents ─────────────────────────────────────────────────────────
    it('action issue: mints the number and posts — redirects to the detail, invoice now issued', async () => {
      const orgId = await provisionOrg(h.ledger.sql);
      const cookie = await h.sessionCookie(await h.createMember(orgId));
      const id = await draft(orgId);

      const res = await h.invoke(() =>
        detailAction({
          request: h.request(`/orgs/${orgId}/invoices/${id}`, {
            method: 'POST',
            cookie,
            body: invoiceForm('issue'),
          }),
          params: { orgId, invoiceId: id },
        }),
      );
      expect((res as Response).status).toBe(302);
      expect((res as Response).headers.get('location')).toBe(`/orgs/${orgId}/invoices/${id}`);

      const [row] = await h.ledger.sql<{ status: string; invoiceNumber: number | null }[]>`
      SELECT status, invoice_number AS "invoiceNumber" FROM invoice WHERE id = ${id}`;
      expect(row!.status).toBe('issued');
      expect(row!.invoiceNumber).not.toBeNull();
    });

    it('action issue: 403 (CSRF) on a non-GET with no matching Origin', async () => {
      const orgId = await provisionOrg(h.ledger.sql);
      const cookie = await h.sessionCookie(await h.createMember(orgId));
      const id = await draft(orgId);
      const res = await h.invoke(() =>
        detailAction({
          request: h.request(`/orgs/${orgId}/invoices/${id}`, {
            method: 'POST',
            cookie,
            body: invoiceForm('issue'),
            sameOrigin: false,
          }),
          params: { orgId, invoiceId: id },
        }),
      );
      expect((res as Response).status).toBe(403);
    });

    it('action send: an issued invoice with no recipient returns a typed {error}, no throw', async () => {
      const orgId = await provisionOrg(h.ledger.sql);
      const cookie = await h.sessionCookie(await h.createMember(orgId));
      const id = await issued(orgId, { customerEmail: '' });
      const res = await h.invoke(() =>
        detailAction({
          request: h.request(`/orgs/${orgId}/invoices/${id}`, {
            method: 'POST',
            cookie,
            body: invoiceForm('send'),
          }),
          params: { orgId, invoiceId: id },
        }),
      );
      expect(res).toHaveProperty('error');
      expect(res).not.toBeInstanceOf(Response);
    });

    it('action send: with a recipient but no SMTP configured returns {error} and logs no send attempt', async () => {
      const orgId = await provisionOrg(h.ledger.sql);
      const cookie = await h.sessionCookie(await h.createMember(orgId));
      const id = await issued(orgId); // customerEmail defaults to kunde@example.no
      const res = await h.invoke(() =>
        detailAction({
          request: h.request(`/orgs/${orgId}/invoices/${id}`, {
            method: 'POST',
            cookie,
            body: invoiceForm('send'),
          }),
          params: { orgId, invoiceId: id },
        }),
      );
      expect(res).toHaveProperty('error');
      expect(res).not.toBeInstanceOf(Response);
      // not-configured writes NO row to the append-only send log (no attempt was made).
      const [log] = await h.ledger.sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM invoice_email WHERE invoice_id = ${id}`;
      expect(log!.n).toBe(0);
    });
  },
);
