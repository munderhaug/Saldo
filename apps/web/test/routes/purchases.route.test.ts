import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ledgerDbAvailable, startRouteHarness, type RouteHarness } from './route-harness.js';
import { provisionOrg } from './provision.js';

// Needs a real Postgres (Docker/Testcontainers, or SALDO_TEST_PG_URI). Skips cleanly otherwise.

/**
 * Route-level tests for the supplier-invoice + owner-economy actions (build-spec §8.5, ADR 0054). Both
 * run through the real withUserOrg auth/tenancy chain and the assertSameOrigin CSRF guard.
 * purchases/new creates a draft and redirects to its detail; purchases/:id posts the AP voucher; the
 * output-code gate is surfaced as a typed {error}; owner/new posts a balanced equity voucher.
 */
type Handler = (a: { request: Request; params: Record<string, string> }) => Promise<unknown>;

describe.skipIf(!ledgerDbAvailable)('purchases + owner — loader + action contracts', () => {
  let h: RouteHarness;
  let purchasesNew: { action: Handler };
  let purchaseDetail: { action: Handler };
  let ownerNew: { action: Handler };

  beforeAll(async () => {
    h = await startRouteHarness();
    const pn = await import('../../app/routes/orgs.$orgId.purchases.new.js');
    const pd = await import('../../app/routes/orgs.$orgId.purchases.$purchaseId.js');
    const on = await import('../../app/routes/orgs.$orgId.owner.new.js');
    purchasesNew = { action: pn.action as unknown as Handler };
    purchaseDetail = { action: pd.action as unknown as Handler };
    ownerNew = { action: on.action as unknown as Handler };
  });

  afterAll(async () => {
    await h.stop();
  });

  async function ids(orgId: string) {
    const [acc] = await h.ledger.sql<{ id: string }[]>`
      SELECT id FROM account WHERE organization_id = ${orgId} AND number = '6790'`;
    const [input] = await h.ledger.sql<{ id: string }[]>`
      SELECT id FROM vat_code WHERE organization_id = ${orgId} AND code = '1'`;
    const [output] = await h.ledger.sql<{ id: string }[]>`
      SELECT id FROM vat_code WHERE organization_id = ${orgId} AND code = '3'`;
    return { accountId: acc!.id, inputVatId: input!.id, outputVatId: output!.id };
  }

  function purchaseForm(
    over: Record<string, string> = {},
    line: Record<string, string> = {},
  ): FormData {
    const fd = new FormData();
    const header: Record<string, string> = {
      supplierId: '',
      supplierName: 'Leverandør AS',
      supplierOrgNr: '',
      supplierInvoiceNumber: 'INV-1',
      kid: '',
      currency: 'NOK',
      invoiceDate: '2026-06-25',
      dueDate: '',
      notes: '',
      ...over,
    };
    for (const [k, value] of Object.entries(header)) fd.set(k, value);
    const lineFields: Record<string, string> = {
      description: 'Innkjøp',
      quantity: '1',
      unit: 'stk',
      unitPriceKr: '1000',
      accountId: '',
      vatCodeId: '',
      nonDeductibleReason: '',
      ...line,
    };
    for (const [k, value] of Object.entries(lineFields)) fd.set(`lines.0.${k}`, value);
    return fd;
  }

  async function voucherRows(orgId: string) {
    return h.ledger.sql<{ id: string; type: string; postedAt: string | null }[]>`
      SELECT id, type, posted_at AS "postedAt" FROM voucher WHERE organization_id = ${orgId}`;
  }

  describe('purchases/new', () => {
    it('action: happy path persists a draft and redirects to its detail', async () => {
      const orgId = await provisionOrg(h.ledger.sql);
      const { accountId, inputVatId } = await ids(orgId);
      const cookie = await h.sessionCookie(await h.createMember(orgId));
      const res = await h.invoke(() =>
        purchasesNew.action({
          request: h.request(`/orgs/${orgId}/purchases/new`, {
            method: 'POST',
            cookie,
            body: purchaseForm({}, { accountId, vatCodeId: inputVatId }),
          }),
          params: { orgId },
        }),
      );
      expect((res as Response).status).toBe(302);
      const location = (res as Response).headers.get('location') ?? '';
      expect(location).toMatch(new RegExp(`^/orgs/${orgId}/purchases/[0-9a-f-]+$`));
      const [row] = await h.ledger.sql<{ status: string }[]>`
        SELECT status FROM supplier_invoice WHERE organization_id = ${orgId}`;
      expect(row?.status).toBe('draft');
    });

    it('action: an output VAT code on a line is a typed {error}, nothing written', async () => {
      const orgId = await provisionOrg(h.ledger.sql);
      const { accountId, outputVatId } = await ids(orgId);
      const cookie = await h.sessionCookie(await h.createMember(orgId));
      const res = await h.invoke(() =>
        purchasesNew.action({
          request: h.request(`/orgs/${orgId}/purchases/new`, {
            method: 'POST',
            cookie,
            body: purchaseForm({}, { accountId, vatCodeId: outputVatId }),
          }),
          params: { orgId },
        }),
      );
      expect(res).toHaveProperty('error');
      expect(res).not.toBeInstanceOf(Response);
      const [count] = await h.ledger.sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM supplier_invoice WHERE organization_id = ${orgId}`;
      expect(count?.n).toBe(0);
    });

    it('action: 403 (CSRF) on a non-GET with no matching Origin', async () => {
      const orgId = await provisionOrg(h.ledger.sql);
      const { accountId, inputVatId } = await ids(orgId);
      const cookie = await h.sessionCookie(await h.createMember(orgId));
      const res = await h.invoke(() =>
        purchasesNew.action({
          request: h.request(`/orgs/${orgId}/purchases/new`, {
            method: 'POST',
            cookie,
            body: purchaseForm({}, { accountId, vatCodeId: inputVatId }),
            sameOrigin: false,
          }),
          params: { orgId },
        }),
      );
      expect((res as Response).status).toBe(403);
    });
  });

  describe('purchases/:id post', () => {
    it('action: posting a draft books a balanced AP voucher and redirects', async () => {
      const orgId = await provisionOrg(h.ledger.sql);
      const { accountId, inputVatId } = await ids(orgId);
      const cookie = await h.sessionCookie(await h.createMember(orgId));

      const created = (await h.invoke(() =>
        purchasesNew.action({
          request: h.request(`/orgs/${orgId}/purchases/new`, {
            method: 'POST',
            cookie,
            body: purchaseForm({}, { accountId, vatCodeId: inputVatId }),
          }),
          params: { orgId },
        }),
      )) as Response;
      const purchaseId = (created.headers.get('location') ?? '').split('/').pop()!;

      const posted = await h.invoke(() =>
        purchaseDetail.action({
          request: h.request(`/orgs/${orgId}/purchases/${purchaseId}`, {
            method: 'POST',
            cookie,
            body: (() => {
              const fd = new FormData();
              fd.set('intent', 'post');
              return fd;
            })(),
          }),
          params: { orgId, purchaseId },
        }),
      );
      expect((posted as Response).status).toBe(302);

      const rows = await voucherRows(orgId);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.type).toBe('purchase');
      expect(rows[0]!.postedAt).not.toBeNull();
      const [legs] = await h.ledger.sql<{ n: number; debit: number; credit: number }[]>`
        SELECT count(*)::int AS n, sum(debit_ore)::int AS debit, sum(credit_ore)::int AS credit
          FROM posting WHERE voucher_id = ${rows[0]!.id}`;
      expect(legs!.n).toBeGreaterThanOrEqual(2);
      expect(legs!.debit).toBe(legs!.credit);
    });
  });

  describe('owner/new', () => {
    function ownerForm(over: Record<string, string> = {}): FormData {
      const fd = new FormData();
      const fields: Record<string, string> = { kind: 'drawing', amount: '1000', ...over };
      for (const [k, value] of Object.entries(fields)) fd.set(k, value);
      return fd;
    }

    it('action: a drawing posts a balanced equity voucher and redirects to the reveal', async () => {
      const orgId = await provisionOrg(h.ledger.sql);
      const cookie = await h.sessionCookie(await h.createMember(orgId));
      const res = await h.invoke(() =>
        ownerNew.action({
          request: h.request(`/orgs/${orgId}/owner/new`, {
            method: 'POST',
            cookie,
            body: ownerForm({ kind: 'drawing', amount: '5000' }),
          }),
          params: { orgId },
        }),
      );
      expect((res as Response).status).toBe(302);
      expect((res as Response).headers.get('location')).toBe('/');
      const rows = await voucherRows(orgId);
      expect(rows).toHaveLength(1);
      const [legs] = await h.ledger.sql<{ n: number; debit: number; credit: number }[]>`
        SELECT count(*)::int AS n, sum(debit_ore)::int AS debit, sum(credit_ore)::int AS credit
          FROM posting WHERE voucher_id = ${rows[0]!.id}`;
      expect(legs!.n).toBe(2);
      expect(legs!.debit).toBe(legs!.credit);
    });

    it('action: invalid amount returns a typed {error}, posts nothing', async () => {
      const orgId = await provisionOrg(h.ledger.sql);
      const cookie = await h.sessionCookie(await h.createMember(orgId));
      const res = await h.invoke(() =>
        ownerNew.action({
          request: h.request(`/orgs/${orgId}/owner/new`, {
            method: 'POST',
            cookie,
            body: ownerForm({ amount: '' }),
          }),
          params: { orgId },
        }),
      );
      expect(res).toHaveProperty('error');
      expect(res).not.toBeInstanceOf(Response);
      expect(await voucherRows(orgId)).toHaveLength(0);
    });
  });
});
