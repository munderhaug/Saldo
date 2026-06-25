import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import { type LedgerDb, ledgerDbAvailable, startLedgerDb } from './db-harness.js';
import * as schema from '../../app/db/schema.js';
import { withOrgTx } from '../../app/auth/middleware.js';
import { createCreditNoteDraft, createDraft, issueInvoice } from '../../app/db/invoices.server.js';
import { SALES_INVOICE_ACCOUNTS } from '../../app/db/posting.server.js';
import { STANDARD_ACCOUNTS, STANDARD_VAT_CODES } from '../../app/db/provisioning.server.js';
import type { InvoiceInput } from '../../app/contracts/invoice.js';

// Needs a real Postgres (Docker/Testcontainers, or SALDO_TEST_PG_URI). Skips cleanly otherwise.

/**
 * Invoice → ledger posting path (feat-invoice-ledger-posting, ADR 0043). Drives the REAL route helpers
 * (`createDraft` → `issueInvoice` → `createCreditNoteDraft`) through the non-owner `saldo_app` role
 * under FORCE-RLS, exactly as the action runs them, against a fully-provisioned org. It proves that
 * issuing a sales invoice posts a BALANCED, POSTED AR voucher into the correct UNLOCKED period, linked
 * back to the document, with the legs the domain derives and a VAT total that ties out to the document;
 * that a credit note posts the balanced REVERSING motbilag linked to the original voucher; that an
 * unregistered org books a plain net sale (no VAT leg); and that a locked issue period blocks the post
 * atomically (nothing — number, document, voucher — is left behind).
 */
describe.skipIf(!ledgerDbAvailable)('invoice → ledger posting (app role + RLS)', () => {
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

  /** Seed (owner connection — RLS-free) a fully-provisioned org with the whole committed kontoplan. */
  async function provisionOrg(mvaStatus: string): Promise<string> {
    orgSeq += 1;
    const orgNr = String(940000000 + orgSeq);
    const [org] = await db.sql<{ id: string }[]>`
      INSERT INTO organization (org_nr, name, mva_status)
      VALUES (${orgNr}, ${'Faktura ENK ' + String(orgSeq)}, ${mvaStatus})
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

  /** Resolve a provisioned account's row id by SAF-T number (owner read). */
  async function accountId(orgId: string, number: string): Promise<string> {
    const [row] = await db.sql<{ id: string }[]>`
      SELECT id FROM account WHERE organization_id = ${orgId} AND number = ${number}`;
    return row!.id;
  }

  /** Resolve a provisioned VAT code's row id by SAF-T code (owner read). */
  async function vatCodeId(orgId: string, code: string): Promise<string> {
    const [row] = await db.sql<{ id: string }[]>`
      SELECT id FROM vat_code WHERE organization_id = ${orgId} AND code = ${code}`;
    return row!.id;
  }

  /** One-line draft input: a single revenue line at the given account / VAT code / kroner price. */
  function oneLineInput(line: {
    accountId: string;
    vatCodeId: string;
    unitPriceKr: string;
  }): InvoiceInput {
    return {
      kind: 'invoice',
      customerId: '',
      customerName: 'Kunde AS',
      customerEmail: '',
      customerOrgNr: '',
      customerAddress: '',
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
          quantity: '1',
          unit: 'time',
          unitPriceKr: line.unitPriceKr,
          accountId: line.accountId,
          vatCodeId: line.vatCodeId,
        },
      ],
    };
  }

  /** The posted voucher booked for an invoice, with its period (owner read; RLS-free for assertions). */
  async function voucherFor(invoiceId: string) {
    const [v] = await db.sql<
      {
        id: string;
        type: string;
        posted: string | null;
        reverses: string | null;
        year: number;
        locked: string | null;
      }[]
    >`
      SELECT v.id, v.type, v.posted_at AS posted, v.reverses_voucher_id AS reverses,
             fp.year, fp.locked_at AS locked
        FROM voucher v JOIN fiscal_period fp ON fp.id = v.period_id
       WHERE v.invoice_id = ${invoiceId}`;
    return v;
  }

  /** The voucher's legs as raw øre, ordered by account number (owner read). */
  async function legsOf(voucherId: string) {
    return db.sql<{ number: string; debit: number; credit: number; coded: boolean }[]>`
      SELECT a.number, p.debit_ore::int AS debit, p.credit_ore::int AS credit,
             (p.vat_code_id IS NOT NULL) AS coded
        FROM posting p JOIN account a ON a.id = p.account_id
       WHERE p.voucher_id = ${voucherId}
       ORDER BY a.number`;
  }

  it('issuing a registered sale posts a balanced AR voucher into the unlocked issue period', async () => {
    const orgId = await provisionOrg('registered_standard');
    const input = oneLineInput({
      accountId: await accountId(orgId, '3000'),
      vatCodeId: await vatCodeId(orgId, '3'),
      unitPriceKr: '1000', // 1 000,00 kr net → 100 000 øre
    });
    const created = await withOrgTx(appDb, orgId, (tx) => createDraft(tx, orgId, input));
    expect(created.ok).toBe(true);
    const invoiceId = created.ok ? created.id : '';

    const issued = await withOrgTx(appDb, orgId, (tx) =>
      issueInvoice(tx, orgId, invoiceId, { issueDate: '2026-06-25', dueDate: '2026-07-09' }),
    );
    expect(issued.ok).toBe(true);

    const v = await voucherFor(invoiceId);
    expect(v?.type).toBe('sales');
    expect(v?.posted).not.toBeNull();
    expect(v?.year).toBe(2026); // the ISSUE date's period
    expect(v?.locked).toBeNull(); // and it is unlocked

    // 1500 receivable (gross 125 000 dr) / 2700 output VAT (25 000 cr, coded) / 3000 revenue (100 000 cr, coded).
    const legs = await legsOf(v!.id);
    expect(legs).toEqual([
      { number: SALES_INVOICE_ACCOUNTS.receivable, debit: 125_000, credit: 0, coded: false },
      {
        number: SALES_INVOICE_ACCOUNTS.outputVatByRate.regular,
        debit: 0,
        credit: 25_000,
        coded: true,
      },
      { number: '3000', debit: 0, credit: 100_000, coded: true },
    ]);

    // The voucher ties out to the document: Σ debit = gross, output VAT leg = the document's vat_ore.
    const [doc] = await db.sql<{ vat: number; gross: number }[]>`
      SELECT vat_ore::int AS vat, gross_ore::int AS gross FROM invoice WHERE id = ${invoiceId}`;
    const debit = legs.reduce((s, l) => s + l.debit, 0);
    const credit = legs.reduce((s, l) => s + l.credit, 0);
    expect(debit).toBe(credit); // balanced
    expect(debit).toBe(doc!.gross);
    const vatLeg = legs.find((l) => l.number === SALES_INVOICE_ACCOUNTS.outputVatByRate.regular);
    expect(vatLeg?.credit).toBe(doc!.vat);
  });

  it('an unregistered org books a plain net sale — no output-VAT leg', async () => {
    const orgId = await provisionOrg('under_threshold');
    const input = oneLineInput({
      accountId: await accountId(orgId, '3000'),
      vatCodeId: await vatCodeId(orgId, '6'), // outside the VAT Act — no output VAT
      unitPriceKr: '500',
    });
    const created = await withOrgTx(appDb, orgId, (tx) => createDraft(tx, orgId, input));
    const invoiceId = created.ok ? created.id : '';
    await withOrgTx(appDb, orgId, (tx) =>
      issueInvoice(tx, orgId, invoiceId, { issueDate: '2026-03-01', dueDate: '2026-03-15' }),
    );

    const v = await voucherFor(invoiceId);
    const legs = await legsOf(v!.id);
    expect(legs).toHaveLength(2); // receivable + revenue only — no output-VAT leg
    expect(legs.some((l) => l.number.startsWith('27'))).toBe(false); // no output-VAT account touched
    // Receivable is uncoded; the revenue leg carries the line's outside-the-VAT-Act code (informative,
    // direction 'none' — never counted as VAT by the honest-number aggregation).
    expect(legs.find((l) => l.number === SALES_INVOICE_ACCOUNTS.receivable)?.coded).toBe(false);
    expect(legs.find((l) => l.number === SALES_INVOICE_ACCOUNTS.receivable)?.debit).toBe(50_000);
    expect(legs.find((l) => l.number === '3000')?.credit).toBe(50_000);
  });

  it('a reverse-charge line (advisory, non-zero rate) posts NO output-VAT leg and ties out', async () => {
    // SAF-T '81' (Regular rate, reverse charge) passes the sales gate as a non-blocking advisory, so it
    // is issuable — but `computeLine` charges NO VAT on it (treatment ≠ output-vat). The voucher must
    // mirror that: a 25 % rate category must NOT silently become an ordinary output-VAT leg (.claude/
    // rules/vat.md), and the document's vat_ore is 0.
    const orgId = await provisionOrg('registered_standard');
    const input = oneLineInput({
      accountId: await accountId(orgId, '3000'),
      vatCodeId: await vatCodeId(orgId, '81'),
      unitPriceKr: '1000',
    });
    const created = await withOrgTx(appDb, orgId, (tx) => createDraft(tx, orgId, input));
    const invoiceId = created.ok ? created.id : '';
    await withOrgTx(appDb, orgId, (tx) =>
      issueInvoice(tx, orgId, invoiceId, { issueDate: '2026-06-25', dueDate: '2026-07-09' }),
    );

    const [doc] = await db.sql<{ vat: number; gross: number }[]>`
      SELECT vat_ore::int AS vat, gross_ore::int AS gross FROM invoice WHERE id = ${invoiceId}`;
    expect(doc?.vat).toBe(0); // no VAT charged on the document

    const v = await voucherFor(invoiceId);
    const legs = await legsOf(v!.id);
    expect(legs).toHaveLength(2); // receivable + revenue only — no phantom 25 % VAT leg
    expect(legs.some((l) => l.number.startsWith('27'))).toBe(false);
    expect(legs.find((l) => l.number === SALES_INVOICE_ACCOUNTS.receivable)?.debit).toBe(100_000);
    expect(legs.reduce((s, l) => s + l.debit, 0)).toBe(doc!.gross); // ties out to the document gross
  });

  it('issuing a credit note posts the balanced reversing motbilag, linked to the original voucher', async () => {
    const orgId = await provisionOrg('registered_standard');
    const input = oneLineInput({
      accountId: await accountId(orgId, '3000'),
      vatCodeId: await vatCodeId(orgId, '3'),
      unitPriceKr: '1000',
    });
    const created = await withOrgTx(appDb, orgId, (tx) => createDraft(tx, orgId, input));
    const invoiceId = created.ok ? created.id : '';
    await withOrgTx(appDb, orgId, (tx) =>
      issueInvoice(tx, orgId, invoiceId, { issueDate: '2026-06-25', dueDate: '2026-07-09' }),
    );
    const original = await voucherFor(invoiceId);

    // Create + issue a credit note that corrects the issued invoice (copies its lines).
    const creditNoteId = await withOrgTx(appDb, orgId, (tx) =>
      createCreditNoteDraft(tx, orgId, invoiceId),
    );
    expect(creditNoteId).not.toBeNull();
    await withOrgTx(appDb, orgId, (tx) =>
      issueInvoice(tx, orgId, creditNoteId!, { issueDate: '2026-06-26', dueDate: '2026-07-10' }),
    );

    const motbilag = await voucherFor(creditNoteId!);
    expect(motbilag?.type).toBe('reversal');
    expect(motbilag?.reverses).toBe(original!.id); // links to the original invoice's voucher

    // Mirror of the sale: receivable CREDITED gross, revenue + output VAT DEBITED — and it balances.
    const legs = await legsOf(motbilag!.id);
    expect(legs).toEqual([
      { number: SALES_INVOICE_ACCOUNTS.receivable, debit: 0, credit: 125_000, coded: false },
      {
        number: SALES_INVOICE_ACCOUNTS.outputVatByRate.regular,
        debit: 25_000,
        credit: 0,
        coded: true,
      },
      { number: '3000', debit: 100_000, credit: 0, coded: true },
    ]);
    const debit = legs.reduce((s, l) => s + l.debit, 0);
    const credit = legs.reduce((s, l) => s + l.credit, 0);
    expect(debit).toBe(credit);
  });

  it('refuses to post (and to issue) into a LOCKED period, atomically — nothing left behind', async () => {
    const orgId = await provisionOrg('registered_standard');
    // Pre-create the 2026 period LOCKED; ensureFiscalPeriod finds it and the trigger blocks the voucher.
    await db.sql`
      INSERT INTO fiscal_period (organization_id, year, starts_on, ends_on, locked_at)
      VALUES (${orgId}, 2026, '2026-01-01', '2026-12-31', now())`;
    const input = oneLineInput({
      accountId: await accountId(orgId, '3000'),
      vatCodeId: await vatCodeId(orgId, '3'),
      unitPriceKr: '1000',
    });
    const created = await withOrgTx(appDb, orgId, (tx) => createDraft(tx, orgId, input));
    const invoiceId = created.ok ? created.id : '';

    await expect(
      withOrgTx(appDb, orgId, (tx) =>
        issueInvoice(tx, orgId, invoiceId, { issueDate: '2026-06-25', dueDate: '2026-07-09' }),
      ),
    ).rejects.toThrow();

    // The issuing tx rolled back wholesale: the document is still a draft with no number, no voucher,
    // and the gapless counter never advanced.
    const [inv] = await db.sql<{ status: string; number: number | null }[]>`
      SELECT status, invoice_number AS number FROM invoice WHERE id = ${invoiceId}`;
    expect(inv?.status).toBe('draft');
    expect(inv?.number).toBeNull();
    const vouchers = await db.sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM voucher WHERE organization_id = ${orgId}`;
    expect(vouchers[0]?.count).toBe(0);
    const [counter] = await db.sql<{ next: number }[]>`
      SELECT next::int AS next FROM invoice_counter WHERE organization_id = ${orgId}`;
    expect(counter?.next ?? 0).toBe(0);
  });
});
