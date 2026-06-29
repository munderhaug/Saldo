import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import { buildUblXml, validateEhf } from '@saldo/domain';
import { type LedgerDb, ledgerDbAvailable, startLedgerDb } from './db-harness.js';
import * as schema from '../../app/db/schema.js';
import { withOrgTx } from '../../app/auth/middleware.js';
import { createDraft, issueInvoice } from '../../app/db/invoices.server.js';
import {
  readInvoiceDocument,
  recordEmailSend,
  toEhfModel,
} from '../../app/db/invoice-document.server.js';
import { STANDARD_ACCOUNTS, STANDARD_VAT_CODES } from '../../app/db/provisioning.server.js';
import type { InvoiceInput } from '../../app/contracts/invoice.js';

// Needs a real Postgres (Docker/Testcontainers, or SALDO_TEST_PG_URI). Skips cleanly otherwise.

/**
 * Issued-document pipeline (feat-invoice-pdf-email) end-to-end against real Postgres: drive the REAL
 * helpers (`createDraft` → `issueInvoice`) through the non-owner `saldo_app` role under FORCE-RLS, then
 * assemble the presentation model (`readInvoiceDocument`), map it to EHF and validate the generated
 * BIS Billing 3.0 XML — proving the frozen money flows untouched from the ledger to the document and
 * that the e-invoice is well-formed + rule-clean from REAL persisted data, plus that a send attempt is
 * recorded to the append-only log.
 */
describe.skipIf(!ledgerDbAvailable)(
  'Issued-document pipeline (PDF model + EHF) — app role + RLS',
  () => {
    let db: LedgerDb;
    let appDb: ReturnType<typeof drizzle<typeof schema>>;

    beforeAll(async () => {
      db = await startLedgerDb();
      appDb = drizzle(db.appSql, { schema });
    });

    afterAll(async () => {
      await db.stop();
    });

    let orgSeq = 0;

    async function provisionOrg(): Promise<string> {
      orgSeq += 1;
      const [org] = await db.sql<{ id: string }[]>`
      INSERT INTO organization (org_nr, name, mva_status)
      VALUES (${String(941000000 + orgSeq)}, ${'Dokument ENK ' + String(orgSeq)}, 'registered_standard')
      RETURNING id`;
      const orgId = org!.id;
      await db.sql`INSERT INTO account ${db.sql(
        STANDARD_ACCOUNTS.map((a) => ({ organization_id: orgId, ...a })),
      )}`;
      await db.sql`INSERT INTO vat_code ${db.sql(
        STANDARD_VAT_CODES.map((c) => ({ organization_id: orgId, ...c })),
      )}`;
      return orgId;
    }

    async function idBy(table: 'account' | 'vat_code', orgId: string, col: string, value: string) {
      const [row] = await db.sql<{ id: string }[]>`
      SELECT id FROM ${db.sql(table)} WHERE organization_id = ${orgId} AND ${db.sql(col)} = ${value}`;
      return row!.id;
    }

    async function issuedInvoice(orgId: string): Promise<string> {
      const input: InvoiceInput = {
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
        notes: 'Takk for oppdraget.',
        lines: [
          {
            productId: '',
            description: 'Konsulenttime',
            quantity: '10',
            unit: 'time',
            unitPriceKr: '1000', // 1 000,00 → 100 000 øre net, 25 000 VAT
            accountId: await idBy('account', orgId, 'number', '3000'),
            vatCodeId: await idBy('vat_code', orgId, 'code', '3'),
          },
          {
            productId: '',
            description: 'Utlegg (fritatt)',
            quantity: '1',
            unit: 'stk',
            unitPriceKr: '500', // 500,00 → 50 000 øre net, 0 VAT (fritatt)
            accountId: await idBy('account', orgId, 'number', '3100'),
            vatCodeId: await idBy('vat_code', orgId, 'code', '5'),
          },
        ],
      };
      const created = await withOrgTx(appDb, orgId, (tx) => createDraft(tx, orgId, input));
      if (!created.ok) throw new Error(`createDraft failed: ${created.error}`);
      await withOrgTx(appDb, orgId, (tx) =>
        issueInvoice(tx, orgId, created.id, { issueDate: '2026-06-25', dueDate: '2026-07-09' }),
      );
      return created.id;
    }

    it('assembles the frozen presentation model with the per-rate MVA-grunnlag (no recompute)', async () => {
      const orgId = await provisionOrg();
      const invoiceId = await issuedInvoice(orgId);

      const doc = await withOrgTx(appDb, orgId, (tx) => readInvoiceDocument(tx, invoiceId));
      expect(doc).not.toBeNull();
      expect(doc!.invoiceNumber).not.toBeNull();
      expect(doc!.kid).not.toBeNull();
      expect(doc!.customer.email).toBe('kunde@example.no');
      expect(doc!.lines).toHaveLength(2);
      // Frozen header: line 1 = 1 000,00 × 10 = 10 000,00 net (1 000 000 øre), VAT 250 000; line 2 =
      // 500,00 fritatt (50 000 øre, 0 VAT). Totals: 1 050 000 net, 250 000 VAT, 1 300 000 gross.
      expect(doc!.netOre).toBe(1_050_000);
      expect(doc!.vatOre).toBe(250_000);
      expect(doc!.grossOre).toBe(1_300_000);
      const buckets = doc!.vatBuckets.map((b) => ({
        cat: b.rateCategory,
        base: b.base,
        vat: b.vat,
      }));
      expect(buckets).toEqual([
        { cat: 'regular', base: 1_000_000, vat: 250_000 },
        { cat: 'zero', base: 50_000, vat: 0 },
      ]);
    });

    it('generates a well-formed, rule-clean EHF (BIS Billing 3.0 subset) from the persisted document', async () => {
      const orgId = await provisionOrg();
      const invoiceId = await issuedInvoice(orgId);
      const doc = await withOrgTx(appDb, orgId, (tx) => readInvoiceDocument(tx, invoiceId));

      const model = toEhfModel(doc!);
      expect(model).not.toBeNull();
      const validation = validateEhf(model!);
      expect(validation).toEqual({ ok: true, violations: [] });

      const xml = buildUblXml(model!);
      expect(xml).toContain('<cbc:CustomizationID>');
      expect(xml).toContain('<cbc:CompanyID schemeID="0192">');
      expect(xml).toContain(
        '<cbc:TaxInclusiveAmount currencyID="NOK">13000.00</cbc:TaxInclusiveAmount>',
      );
    });

    it('emits cac:PayeeFinancialAccount when the org has a payout account configured (review §5)', async () => {
      const orgId = await provisionOrg();
      // Set a payout account + a known-valid mod-11 org nr (the seed helper's sequential numbers are
      // not all valid org-nrs, and toEhfModel runs them through the mod-11 check).
      await db.sql`UPDATE organization
                      SET org_nr = ${'974760673'},
                          invoice_payment_account = ${'NO9386011117947'},
                          invoice_payment_account_name = ${'Dokument ENK'}
                    WHERE id = ${orgId}`;
      const invoiceId = await issuedInvoice(orgId);
      const doc = await withOrgTx(appDb, orgId, (tx) => readInvoiceDocument(tx, invoiceId));
      expect(doc!.seller.paymentAccount).toEqual({ id: 'NO9386011117947', name: 'Dokument ENK' });

      const model = toEhfModel(doc!);
      expect(validateEhf(model!).ok).toBe(true); // still rule-clean with the account present
      const xml = buildUblXml(model!);
      expect(xml).toContain(
        '<cac:PayeeFinancialAccount><cbc:ID>NO9386011117947</cbc:ID><cbc:Name>Dokument ENK</cbc:Name></cac:PayeeFinancialAccount>',
      );
    });

    it('records a send attempt to the append-only invoice_email log (RLS-scoped)', async () => {
      const orgId = await provisionOrg();
      const invoiceId = await issuedInvoice(orgId);

      await withOrgTx(appDb, orgId, (tx) =>
        recordEmailSend(tx, orgId, invoiceId, {
          recipient: 'kunde@example.no',
          status: 'sent',
          providerMessageId: 'pm-test-1',
        }),
      );

      const [row] = await db.sql<{ recipient: string; status: string; provider: string }[]>`
      SELECT recipient, status, provider FROM invoice_email WHERE invoice_id = ${invoiceId}`;
      expect(row).toEqual({ recipient: 'kunde@example.no', status: 'sent', provider: 'postmark' });
    });
  },
);
