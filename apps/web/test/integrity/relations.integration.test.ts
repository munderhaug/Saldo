import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as relations from '../../app/db/relations.js';
import * as schema from '../../app/db/schema.js';
import { ledgerDbAvailable, seedOrg, startLedgerDb, type LedgerDb } from './db-harness.js';

// Needs a real Postgres (Docker/Testcontainers, or SALDO_TEST_PG_URI). Skips cleanly otherwise.

/**
 * Per-relation smoke test for the hand-maintained `app/db/relations.ts`. The generated relations
 * keyed every composite same-org FK on `organization_id` instead of the real reference column, so a
 * `db.query.<table>.findFirst({ with: { … } })` resolved the join to nothing. This locks the fix:
 * we seed ONE fully-connected graph and assert that every relation resolves to the EXPECTED parent
 * row (a wrong join column — `organization_id -> parent.id` — finds no row, so `?.id` is undefined
 * and the assertion fails). If a `drizzle-kit introspect` regenerate clobbers relations.ts and
 * reintroduces the bug, this suite goes red.
 */

type OwnerDb = ReturnType<typeof makeOwnerDb>;
function makeOwnerDb(ledger: LedgerDb) {
  // Owner connection: RLS is bypassed, so the relational query API sees the whole seeded graph
  // without a per-statement `SET LOCAL app.current_org`. We test FK-join correctness, not tenancy.
  return drizzle(ledger.sql, { schema: { ...schema, ...relations } });
}

interface Graph {
  orgId: string;
  debitAccountId: string;
  creditAccountId: string;
  openPeriodId: string;
  vatCodeId: string;
  contactId: string;
  productId: string;
  invoiceId: string;
  invoiceLineId: string;
  creditNoteId: string;
  voucherId: string;
  reversalVoucherId: string;
  posting1Id: string;
  posting2Id: string;
  aiProvenanceId: string;
  bankAccountId: string;
  bankTransactionId: string;
  invoiceEmailId: string;
  supplierInvoiceId: string;
  supplierInvoiceLineId: string;
  supplierVoucherId: string;
}

/** Build one fully-connected graph touching every table that has a relation, satisfying all CHECKs. */
async function seedGraph(ledger: LedgerDb): Promise<Graph> {
  const sql = ledger.sql;
  const base = await seedOrg(sql); // org + 2 accounts (6000 debit / 3000 credit) + open + locked period
  const { orgId, debitAccountId, creditAccountId, openPeriodId } = base;

  const [vat] = await sql<{ id: string }[]>`
    INSERT INTO vat_code (organization_id, code, rate, direction)
    VALUES (${orgId}, '3', 0.2500, 'output') RETURNING id`;
  const vatCodeId = vat!.id;

  const [contact] = await sql<{ id: string }[]>`
    INSERT INTO contact (organization_id, is_customer, name, mva_status, default_account_id, default_vat_code_id)
    VALUES (${orgId}, true, 'Kunde AS', 'registered_standard', ${creditAccountId}, ${vatCodeId})
    RETURNING id`;
  const contactId = contact!.id;

  const [product] = await sql<{ id: string }[]>`
    INSERT INTO product (organization_id, kind, name, unit_price_ore, default_account_id, default_vat_code_id)
    VALUES (${orgId}, 'service', 'Konsulenttime', 100000, ${creditAccountId}, ${vatCodeId})
    RETURNING id`;
  const productId = product!.id;

  const [invoice] = await sql<{ id: string }[]>`
    INSERT INTO invoice (organization_id, kind, status, customer_id, customer_name, net_ore, vat_ore, gross_ore)
    VALUES (${orgId}, 'invoice', 'draft', ${contactId}, 'Kunde AS', 100000, 25000, 125000)
    RETURNING id`;
  const invoiceId = invoice!.id;

  const [line] = await sql<{ id: string }[]>`
    INSERT INTO invoice_line (organization_id, invoice_id, line_no, product_id, description, quantity, account_id, vat_code_id, unit_price_ore, net_ore, vat_ore)
    VALUES (${orgId}, ${invoiceId}, 1, ${productId}, 'Konsulenttime', 1, ${creditAccountId}, ${vatCodeId}, 100000, 100000, 25000)
    RETURNING id`;
  const invoiceLineId = line!.id;

  // Credit note crediting the invoice — exercises the invoice -> invoice self relation (credits).
  const [creditNote] = await sql<{ id: string }[]>`
    INSERT INTO invoice (organization_id, kind, status, customer_id, customer_name, credits_invoice_id, net_ore, vat_ore, gross_ore)
    VALUES (${orgId}, 'credit_note', 'draft', ${contactId}, 'Kunde AS', ${invoiceId}, 0, 0, 0)
    RETURNING id`;
  const creditNoteId = creditNote!.id;

  // Unposted voucher linked to the invoice + the open period (drafts may be incomplete — no balance gate).
  const [voucher] = await sql<{ id: string }[]>`
    INSERT INTO voucher (organization_id, type, period_id, invoice_id)
    VALUES (${orgId}, 'sales', ${openPeriodId}, ${invoiceId})
    RETURNING id`;
  const voucherId = voucher!.id;

  const [reversal] = await sql<{ id: string }[]>`
    INSERT INTO voucher (organization_id, type, period_id, reverses_voucher_id)
    VALUES (${orgId}, 'reversal', ${openPeriodId}, ${voucherId})
    RETURNING id`;
  const reversalVoucherId = reversal!.id;

  // Both postings in ONE transaction: the balance trigger is DEFERRABLE INITIALLY DEFERRED, so it
  // checks Σdebit = Σcredit at COMMIT — a single insert would trip it transiently.
  const [p1, p2] = await sql.begin(async (tx) => {
    const [a] = await tx<{ id: string }[]>`
      INSERT INTO posting (organization_id, voucher_id, account_id, debit_ore, credit_ore)
      VALUES (${orgId}, ${voucherId}, ${debitAccountId}, 125000, 0) RETURNING id`;
    const [b] = await tx<{ id: string }[]>`
      INSERT INTO posting (organization_id, voucher_id, account_id, vat_code_id, debit_ore, credit_ore)
      VALUES (${orgId}, ${voucherId}, ${creditAccountId}, ${vatCodeId}, 0, 125000) RETURNING id`;
    return [a, b];
  });

  const [prov] = await sql<{ id: string }[]>`
    INSERT INTO ai_provenance (organization_id, voucher_id, model, model_version, confidence)
    VALUES (${orgId}, ${voucherId}, 'claude', 'test', 0.950) RETURNING id`;

  const [bankAccount] = await sql<{ id: string }[]>`
    INSERT INTO bank_account (organization_id, label, account_number)
    VALUES (${orgId}, 'Drift', '15032300000') RETURNING id`;
  const bankAccountId = bankAccount!.id;

  const [bankTx] = await sql<{ id: string }[]>`
    INSERT INTO bank_transaction (organization_id, bank_account_id, source, external_ref, amount_ore, currency, matched_voucher_id)
    VALUES (${orgId}, ${bankAccountId}, 'csv', 'ext-1', 125000, 'NOK', ${voucherId}) RETURNING id`;

  const [email] = await sql<{ id: string }[]>`
    INSERT INTO invoice_email (organization_id, invoice_id, recipient, status)
    VALUES (${orgId}, ${invoiceId}, 'kunde@example.no', 'sent') RETURNING id`;

  // A supplier invoice + line + the voucher that books it — exercises the AP-side relations.
  const [supplierInvoice] = await sql<{ id: string }[]>`
    INSERT INTO supplier_invoice (organization_id, status, supplier_id, supplier_name, net_ore, vat_ore, gross_ore)
    VALUES (${orgId}, 'draft', ${contactId}, 'Leverandør AS', 100000, 25000, 125000)
    RETURNING id`;
  const supplierInvoiceId = supplierInvoice!.id;

  const [supplierLine] = await sql<{ id: string }[]>`
    INSERT INTO supplier_invoice_line (organization_id, supplier_invoice_id, line_no, description, quantity, account_id, vat_code_id, unit_price_ore, net_ore, vat_ore)
    VALUES (${orgId}, ${supplierInvoiceId}, 1, 'Innkjøp', 1, ${debitAccountId}, ${vatCodeId}, 100000, 100000, 25000)
    RETURNING id`;
  const supplierInvoiceLineId = supplierLine!.id;

  const [supplierVoucher] = await sql<{ id: string }[]>`
    INSERT INTO voucher (organization_id, type, period_id, supplier_invoice_id)
    VALUES (${orgId}, 'purchase', ${openPeriodId}, ${supplierInvoiceId})
    RETURNING id`;
  const supplierVoucherId = supplierVoucher!.id;

  return {
    orgId,
    debitAccountId,
    creditAccountId,
    openPeriodId,
    vatCodeId,
    contactId,
    productId,
    invoiceId,
    invoiceLineId,
    creditNoteId,
    voucherId,
    reversalVoucherId,
    posting1Id: p1!.id,
    posting2Id: p2!.id,
    aiProvenanceId: prov!.id,
    bankAccountId,
    bankTransactionId: bankTx!.id,
    invoiceEmailId: email!.id,
    supplierInvoiceId,
    supplierInvoiceLineId,
    supplierVoucherId,
  };
}

describe.skipIf(!ledgerDbAvailable)(
  'db/relations — every relation resolves to its real FK target',
  () => {
    let ledger: LedgerDb;
    let db: OwnerDb;
    let g: Graph;

    beforeAll(async () => {
      ledger = await startLedgerDb();
      db = makeOwnerDb(ledger);
      g = await seedGraph(ledger);
    });

    afterAll(async () => {
      await ledger.stop();
    });

    it('invoiceLine: invoice / account / vatCode / product / organization', async () => {
      const row = await db.query.invoiceLine.findFirst({
        where: eq(schema.invoiceLine.id, g.invoiceLineId),
        with: { invoice: true, account: true, vatCode: true, product: true, organization: true },
      });
      expect(row?.invoice?.id).toBe(g.invoiceId);
      expect(row?.account?.id).toBe(g.creditAccountId);
      expect(row?.vatCode?.id).toBe(g.vatCodeId);
      expect(row?.product?.id).toBe(g.productId);
      expect(row?.organization?.id).toBe(g.orgId);
    });

    it('invoice: customer / organization + many (lines, emails, vouchers)', async () => {
      const row = await db.query.invoice.findFirst({
        where: eq(schema.invoice.id, g.invoiceId),
        with: {
          customer: true,
          organization: true,
          invoiceLines: true,
          invoiceEmails: true,
          vouchers: true,
        },
      });
      expect(row?.customer?.id).toBe(g.contactId);
      expect(row?.organization?.id).toBe(g.orgId);
      expect(row?.invoiceLines.map((l) => l.id)).toContain(g.invoiceLineId);
      expect(row?.invoiceEmails.map((e) => e.id)).toContain(g.invoiceEmailId);
      expect(row?.vouchers.map((v) => v.id)).toContain(g.voucherId);
    });

    it('invoice: self relation — a credit note resolves the invoice it credits', async () => {
      const note = await db.query.invoice.findFirst({
        where: eq(schema.invoice.id, g.creditNoteId),
        with: { creditsInvoice: true },
      });
      expect(note?.creditsInvoice?.id).toBe(g.invoiceId);

      const original = await db.query.invoice.findFirst({
        where: eq(schema.invoice.id, g.invoiceId),
        with: { creditedByInvoices: true },
      });
      expect(original?.creditedByInvoices.map((i) => i.id)).toContain(g.creditNoteId);
    });

    it('invoiceEmail: invoice / organization', async () => {
      const row = await db.query.invoiceEmail.findFirst({
        where: eq(schema.invoiceEmail.id, g.invoiceEmailId),
        with: { invoice: true, organization: true },
      });
      expect(row?.invoice?.id).toBe(g.invoiceId);
      expect(row?.organization?.id).toBe(g.orgId);
    });

    it('contact: defaultAccount / defaultVatCode / organization + many invoices', async () => {
      const row = await db.query.contact.findFirst({
        where: eq(schema.contact.id, g.contactId),
        with: { defaultAccount: true, defaultVatCode: true, organization: true, invoices: true },
      });
      expect(row?.defaultAccount?.id).toBe(g.creditAccountId);
      expect(row?.defaultVatCode?.id).toBe(g.vatCodeId);
      expect(row?.organization?.id).toBe(g.orgId);
      expect(row?.invoices.map((i) => i.id)).toContain(g.invoiceId);
    });

    it('product: defaultAccount / defaultVatCode / organization', async () => {
      const row = await db.query.product.findFirst({
        where: eq(schema.product.id, g.productId),
        with: { defaultAccount: true, defaultVatCode: true, organization: true },
      });
      expect(row?.defaultAccount?.id).toBe(g.creditAccountId);
      expect(row?.defaultVatCode?.id).toBe(g.vatCodeId);
      expect(row?.organization?.id).toBe(g.orgId);
    });

    it('posting: voucher / account / vatCode / organization', async () => {
      const withVat = await db.query.posting.findFirst({
        where: eq(schema.posting.id, g.posting2Id),
        with: { voucher: true, account: true, vatCode: true, organization: true },
      });
      expect(withVat?.voucher?.id).toBe(g.voucherId);
      expect(withVat?.account?.id).toBe(g.creditAccountId);
      expect(withVat?.vatCode?.id).toBe(g.vatCodeId);
      expect(withVat?.organization?.id).toBe(g.orgId);
    });

    it('voucher: fiscalPeriod / invoice / organization + many postings / self reversal', async () => {
      const row = await db.query.voucher.findFirst({
        where: eq(schema.voucher.id, g.voucherId),
        with: {
          fiscalPeriod: true,
          invoice: true,
          organization: true,
          postings: true,
          aiProvenances: true,
          bankTransactions: true,
          reversedByVouchers: true,
        },
      });
      expect(row?.fiscalPeriod?.id).toBe(g.openPeriodId);
      expect(row?.invoice?.id).toBe(g.invoiceId);
      expect(row?.organization?.id).toBe(g.orgId);
      expect(row?.postings.map((p) => p.id).sort()).toEqual([g.posting1Id, g.posting2Id].sort());
      expect(row?.aiProvenances.map((a) => a.id)).toContain(g.aiProvenanceId);
      expect(row?.bankTransactions.map((b) => b.id)).toContain(g.bankTransactionId);
      expect(row?.reversedByVouchers.map((v) => v.id)).toContain(g.reversalVoucherId);

      const reversal = await db.query.voucher.findFirst({
        where: eq(schema.voucher.id, g.reversalVoucherId),
        with: { reversesVoucher: true },
      });
      expect(reversal?.reversesVoucher?.id).toBe(g.voucherId);
    });

    it('supplierInvoiceLine: supplierInvoice / account / vatCode / organization', async () => {
      const row = await db.query.supplierInvoiceLine.findFirst({
        where: eq(schema.supplierInvoiceLine.id, g.supplierInvoiceLineId),
        with: { supplierInvoice: true, account: true, vatCode: true, organization: true },
      });
      expect(row?.supplierInvoice?.id).toBe(g.supplierInvoiceId);
      expect(row?.account?.id).toBe(g.debitAccountId);
      expect(row?.vatCode?.id).toBe(g.vatCodeId);
      expect(row?.organization?.id).toBe(g.orgId);
    });

    it('supplierInvoice: supplier / organization + many (lines, vouchers)', async () => {
      const row = await db.query.supplierInvoice.findFirst({
        where: eq(schema.supplierInvoice.id, g.supplierInvoiceId),
        with: {
          supplier: true,
          organization: true,
          supplierInvoiceLines: true,
          vouchers: true,
        },
      });
      expect(row?.supplier?.id).toBe(g.contactId);
      expect(row?.organization?.id).toBe(g.orgId);
      expect(row?.supplierInvoiceLines.map((l) => l.id)).toContain(g.supplierInvoiceLineId);
      expect(row?.vouchers.map((v) => v.id)).toContain(g.supplierVoucherId);
    });

    it('voucher: supplierInvoice back-reference resolves', async () => {
      const row = await db.query.voucher.findFirst({
        where: eq(schema.voucher.id, g.supplierVoucherId),
        with: { supplierInvoice: true },
      });
      expect(row?.supplierInvoice?.id).toBe(g.supplierInvoiceId);
    });

    it('aiProvenance: voucher / organization', async () => {
      const row = await db.query.aiProvenance.findFirst({
        where: eq(schema.aiProvenance.id, g.aiProvenanceId),
        with: { voucher: true, organization: true },
      });
      expect(row?.voucher?.id).toBe(g.voucherId);
      expect(row?.organization?.id).toBe(g.orgId);
    });

    it('bankTransaction: bankAccount / matchedVoucher / organization', async () => {
      const row = await db.query.bankTransaction.findFirst({
        where: eq(schema.bankTransaction.id, g.bankTransactionId),
        with: { bankAccount: true, matchedVoucher: true, organization: true },
      });
      expect(row?.bankAccount?.id).toBe(g.bankAccountId);
      expect(row?.matchedVoucher?.id).toBe(g.voucherId);
      expect(row?.organization?.id).toBe(g.orgId);
    });

    it('fiscalPeriod / account / vatCode / bankAccount: organization back-reference', async () => {
      const period = await db.query.fiscalPeriod.findFirst({
        where: eq(schema.fiscalPeriod.id, g.openPeriodId),
        with: { organization: true, vouchers: true },
      });
      expect(period?.organization?.id).toBe(g.orgId);
      expect(period?.vouchers.map((v) => v.id)).toContain(g.voucherId);

      const bankAccount = await db.query.bankAccount.findFirst({
        where: eq(schema.bankAccount.id, g.bankAccountId),
        with: { organization: true, bankTransactions: true },
      });
      expect(bankAccount?.organization?.id).toBe(g.orgId);
      expect(bankAccount?.bankTransactions.map((b) => b.id)).toContain(g.bankTransactionId);
    });
  },
);
