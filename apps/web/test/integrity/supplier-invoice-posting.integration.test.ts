import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import { type LedgerDb, ledgerDbAvailable, startLedgerDb } from './db-harness.js';
import * as schema from '../../app/db/schema.js';
import { withOrgTx } from '../../app/auth/middleware.js';
import {
  createDraft,
  postSupplierInvoice,
  readSupplierInvoice,
} from '../../app/db/supplier-invoices.server.js';
import { SUPPLIER_INVOICE_ACCOUNTS } from '../../app/db/posting.server.js';
import { STANDARD_ACCOUNTS, STANDARD_VAT_CODES } from '../../app/db/provisioning.server.js';
import type { SupplierInvoiceInput } from '../../app/contracts/supplier-invoice.js';

// Needs a real Postgres (Docker/Testcontainers, or SALDO_TEST_PG_URI). Skips cleanly otherwise.

/**
 * Supplier-invoice → ledger posting path (feat-supplier-invoices, ADR 0056). Drives the REAL route
 * helpers (`createDraft` → `postSupplierInvoice`) through the non-owner `saldo_app` role under
 * FORCE-RLS, exactly as the action runs them, against a fully-provisioned org. It proves: a registered
 * org's deductible line posts a BALANCED, POSTED AP voucher (cost net + input VAT split + supplier
 * payable gross) linked back to the document, in the right period; the non-deductible-even-when-
 * registered fork books the gross to cost; an unregistered org books the gross with no deduction; a
 * reverse-charge purchase line self-accounts BOTH legs (the supplier payable is only the net); the
 * output-code gate refuses a sale code on a purchase; and a posted document is immutable + posts once.
 */
describe.skipIf(!ledgerDbAvailable)('supplier invoice → ledger posting (app role + RLS)', () => {
  let db: LedgerDb;
  let appDb: ReturnType<typeof drizzle<typeof schema>>;
  let ownerDb: ReturnType<typeof drizzle<typeof schema>>;

  beforeAll(async () => {
    db = await startLedgerDb();
    appDb = drizzle(db.appSql, { schema });
    ownerDb = drizzle(db.sql, { schema });
  });

  afterAll(async () => {
    await db.stop();
  });

  let orgSeq = 0;

  async function provisionOrg(mvaStatus: string): Promise<string> {
    orgSeq += 1;
    const orgNr = String(960000000 + orgSeq);
    const [org] = await db.sql<{ id: string }[]>`
      INSERT INTO organization (org_nr, name, mva_status)
      VALUES (${orgNr}, ${'Kjøp ENK ' + String(orgSeq)}, ${mvaStatus})
      RETURNING id`;
    const orgId = org!.id;
    await ownerDb
      .insert(schema.account)
      .values(STANDARD_ACCOUNTS.map((a) => ({ organizationId: orgId, ...a })));
    await ownerDb
      .insert(schema.vatCode)
      .values(STANDARD_VAT_CODES.map((c) => ({ organizationId: orgId, ...c })));
    return orgId;
  }

  async function accountId(orgId: string, number: string): Promise<string> {
    const [row] = await db.sql<{ id: string }[]>`
      SELECT id FROM account WHERE organization_id = ${orgId} AND number = ${number}`;
    return row!.id;
  }

  async function vatCodeId(orgId: string, code: string): Promise<string> {
    const [row] = await db.sql<{ id: string }[]>`
      SELECT id FROM vat_code WHERE organization_id = ${orgId} AND code = ${code}`;
    return row!.id;
  }

  /** One-line supplier-invoice input at the given cost account / VAT code / kroner price + reason. */
  function oneLineInput(line: {
    accountId: string;
    vatCodeId: string;
    unitPriceKr: string;
    nonDeductibleReason?: string;
    invoiceDate?: string;
  }): SupplierInvoiceInput {
    return {
      supplierId: '',
      supplierName: 'Leverandør AS',
      supplierOrgNr: '',
      supplierInvoiceNumber: 'INV-100',
      kid: '',
      currency: 'NOK',
      invoiceDate: line.invoiceDate ?? '2026-06-25',
      dueDate: '',
      notes: '',
      lines: [
        {
          description: 'Innkjøp',
          quantity: '1',
          unit: 'stk',
          unitPriceKr: line.unitPriceKr,
          accountId: line.accountId,
          vatCodeId: line.vatCodeId,
          nonDeductibleReason: line.nonDeductibleReason ?? '',
        },
      ],
    };
  }

  async function voucherFor(supplierInvoiceId: string) {
    const [v] = await db.sql<
      { id: string; type: string; posted: string | null; year: number; locked: string | null }[]
    >`
      SELECT v.id, v.type, v.posted_at AS posted, fp.year, fp.locked_at AS locked
        FROM voucher v JOIN fiscal_period fp ON fp.id = v.period_id
       WHERE v.supplier_invoice_id = ${supplierInvoiceId}`;
    return v;
  }

  async function legsOf(voucherId: string) {
    return db.sql<{ number: string; debit: number; credit: number; coded: boolean }[]>`
      SELECT a.number, p.debit_ore::int AS debit, p.credit_ore::int AS credit,
             (p.vat_code_id IS NOT NULL) AS coded
        FROM posting p JOIN account a ON a.id = p.account_id
       WHERE p.voucher_id = ${voucherId}
       ORDER BY a.number`;
  }

  it('posts a balanced AP voucher: registered + deductible splits input VAT, books net to cost', async () => {
    const orgId = await provisionOrg('registered_standard');
    const input = oneLineInput({
      accountId: await accountId(orgId, '6790'),
      vatCodeId: await vatCodeId(orgId, '1'), // ordinary deductible input, 25 %
      unitPriceKr: '1000', // 1 000,00 kr net → 100 000 øre
    });
    const created = await withOrgTx(appDb, orgId, (tx) => createDraft(tx, orgId, input));
    expect(created.ok).toBe(true);
    const id = created.ok ? created.id : '';

    const posted = await withOrgTx(appDb, orgId, (tx) => postSupplierInvoice(tx, orgId, id));
    expect(posted.ok).toBe(true);

    const v = await voucherFor(id);
    expect(v?.type).toBe('purchase');
    expect(v?.posted).not.toBeNull();
    expect(v?.year).toBe(2026);
    expect(v?.locked).toBeNull();

    // Ordered by account number: 2400 payable 125 000 cr / 2710 input VAT 25 000 dr (coded) /
    // 6790 cost net 100 000 dr (coded).
    const legs = await legsOf(v!.id);
    expect(legs).toEqual([
      { number: SUPPLIER_INVOICE_ACCOUNTS.payable, debit: 0, credit: 125_000, coded: false },
      { number: SUPPLIER_INVOICE_ACCOUNTS.inputVat, debit: 25_000, credit: 0, coded: true },
      { number: '6790', debit: 100_000, credit: 0, coded: true },
    ]);
    const debit = legs.reduce((s, l) => s + l.debit, 0);
    const credit = legs.reduce((s, l) => s + l.credit, 0);
    expect(debit).toBe(credit); // balanced

    const [doc] = await db.sql<{ status: string; vat: number; gross: number }[]>`
      SELECT status, vat_ore::int AS vat, gross_ore::int AS gross FROM supplier_invoice WHERE id = ${id}`;
    expect(doc?.status).toBe('posted');
    expect(doc?.gross).toBe(125_000);
    expect(debit).toBe(doc!.gross);
  });

  it('non-deductible (representasjon) books the gross to cost — no input-VAT split', async () => {
    const orgId = await provisionOrg('registered_standard');
    const input = oneLineInput({
      accountId: await accountId(orgId, '7350'), // representasjon
      vatCodeId: await vatCodeId(orgId, '1'),
      unitPriceKr: '1000',
      nonDeductibleReason: 'representasjon',
    });
    const created = await withOrgTx(appDb, orgId, (tx) => createDraft(tx, orgId, input));
    const id = created.ok ? created.id : '';
    const posted = await withOrgTx(appDb, orgId, (tx) => postSupplierInvoice(tx, orgId, id));
    expect(posted.ok).toBe(true);

    const v = await voucherFor(id);
    const legs = await legsOf(v!.id);
    expect(legs).toHaveLength(2); // cost (gross) + payable — no input-VAT leg
    expect(legs.some((l) => l.number === SUPPLIER_INVOICE_ACCOUNTS.inputVat)).toBe(false);
    expect(legs.find((l) => l.number === '7350')?.debit).toBe(125_000); // gross
    expect(legs.find((l) => l.number === SUPPLIER_INVOICE_ACCOUNTS.payable)?.credit).toBe(125_000);
  });

  it('an unregistered org books the gross to cost — no deduction', async () => {
    const orgId = await provisionOrg('under_threshold');
    const input = oneLineInput({
      accountId: await accountId(orgId, '6790'),
      vatCodeId: await vatCodeId(orgId, '1'),
      unitPriceKr: '1000',
    });
    const created = await withOrgTx(appDb, orgId, (tx) => createDraft(tx, orgId, input));
    const id = created.ok ? created.id : '';
    const posted = await withOrgTx(appDb, orgId, (tx) => postSupplierInvoice(tx, orgId, id));
    expect(posted.ok).toBe(true);

    const v = await voucherFor(id);
    const legs = await legsOf(v!.id);
    expect(legs).toHaveLength(2);
    expect(legs.some((l) => l.number === SUPPLIER_INVOICE_ACCOUNTS.inputVat)).toBe(false);
    expect(legs.find((l) => l.number === '6790')?.debit).toBe(125_000); // gross to cost
  });

  it('a reverse-charge purchase line self-accounts both legs; payable is only the net', async () => {
    const orgId = await provisionOrg('registered_standard');
    const input = oneLineInput({
      accountId: await accountId(orgId, '6790'),
      vatCodeId: await vatCodeId(orgId, '86'), // foreign service, med fradragsrett (deductible)
      unitPriceKr: '1000',
    });
    const created = await withOrgTx(appDb, orgId, (tx) => createDraft(tx, orgId, input));
    expect(created.ok).toBe(true);
    const id = created.ok ? created.id : '';

    // The supplier charged no VAT on a reverse-charge purchase: the document VAT is 0, gross = net.
    const detail = await withOrgTx(appDb, orgId, (tx) => readSupplierInvoice(tx, id));
    expect(detail?.vatOre).toBe(0);
    expect(detail?.grossOre).toBe(100_000);

    const posted = await withOrgTx(appDb, orgId, (tx) => postSupplierInvoice(tx, orgId, id));
    expect(posted.ok).toBe(true);

    const v = await voucherFor(id);
    const legs = await legsOf(v!.id);
    // 2704 output VAT 25 000 cr / 2714 input VAT 25 000 dr / 2400 payable 100 000 cr / 6790 cost 100 000 dr.
    expect(legs.find((l) => l.number === '2704')?.credit).toBe(25_000);
    expect(legs.find((l) => l.number === '2714')?.debit).toBe(25_000);
    expect(legs.find((l) => l.number === SUPPLIER_INVOICE_ACCOUNTS.payable)?.credit).toBe(100_000);
    expect(legs.find((l) => l.number === '6790')?.debit).toBe(100_000);
    const debit = legs.reduce((s, l) => s + l.debit, 0);
    const credit = legs.reduce((s, l) => s + l.credit, 0);
    expect(debit).toBe(credit); // both VAT legs on the melding even though net cash is the net
  });

  it('refuses an output VAT code on a purchase line — typed, nothing persisted', async () => {
    const orgId = await provisionOrg('registered_standard');
    const input = oneLineInput({
      accountId: await accountId(orgId, '6790'),
      vatCodeId: await vatCodeId(orgId, '3'), // output 25 % — a sale code
      unitPriceKr: '1000',
    });
    const created = await withOrgTx(appDb, orgId, (tx) => createDraft(tx, orgId, input));
    expect(created.ok).toBe(false);
    if (!created.ok) expect(created.error).toBe('output-code-not-a-purchase');
  });

  it('a posted document is immutable and cannot be posted twice', async () => {
    const orgId = await provisionOrg('registered_standard');
    const input = oneLineInput({
      accountId: await accountId(orgId, '6790'),
      vatCodeId: await vatCodeId(orgId, '1'),
      unitPriceKr: '1000',
    });
    const created = await withOrgTx(appDb, orgId, (tx) => createDraft(tx, orgId, input));
    const id = created.ok ? created.id : '';
    await withOrgTx(appDb, orgId, (tx) => postSupplierInvoice(tx, orgId, id));

    // A second post is a typed no-op (the document is no longer a draft).
    const again = await withOrgTx(appDb, orgId, (tx) => postSupplierInvoice(tx, orgId, id));
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error).toBe('not-a-draft');

    // The SQL immutability trigger blocks a financial mutation of the posted document.
    await expect(
      db.sql`UPDATE supplier_invoice SET gross_ore = 1 WHERE id = ${id}`,
    ).rejects.toThrow(/immutable/i);
  });

  it('refuses to post a draft with no invoice date — typed', async () => {
    const orgId = await provisionOrg('registered_standard');
    const input = oneLineInput({
      accountId: await accountId(orgId, '6790'),
      vatCodeId: await vatCodeId(orgId, '1'),
      unitPriceKr: '1000',
      invoiceDate: '',
    });
    const created = await withOrgTx(appDb, orgId, (tx) => createDraft(tx, orgId, input));
    const id = created.ok ? created.id : '';
    const posted = await withOrgTx(appDb, orgId, (tx) => postSupplierInvoice(tx, orgId, id));
    expect(posted.ok).toBe(false);
    if (!posted.ok) expect(posted.error).toBe('missing-invoice-date');
  });
});
