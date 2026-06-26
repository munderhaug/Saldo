import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import { type LedgerDb, ledgerDbAvailable, startLedgerDb } from './db-harness.js';
import * as schema from '../../app/db/schema.js';
import { withOrgTx } from '../../app/auth/middleware.js';
import { createDraft, issueInvoice } from '../../app/db/invoices.server.js';
import { reconcileMatch } from '../../app/db/reconciliation.server.js';
import { STANDARD_ACCOUNTS, STANDARD_VAT_CODES } from '../../app/db/provisioning.server.js';
import type { InvoiceInput } from '../../app/contracts/invoice.js';

// Needs a real Postgres (Docker/Testcontainers, or SALDO_TEST_PG_URI). Skips cleanly otherwise.

/**
 * Bank reconciliation → settlement posting (feat-reconciliation, §8.7). Drives the REAL helpers
 * (`createDraft` → `issueInvoice` → `reconcileMatch`) through the non-owner `saldo_app` role under
 * FORCE-RLS, exactly as the action runs them, against a fully-provisioned org. It proves that confirming
 * a match against an issued invoice:
 *   * posts a BALANCED, POSTED `bank` settlement voucher (debit 1920 / credit 1500 the document gross),
 *     in the booking-date period;
 *   * links the imported bank transaction to that voucher via `matched_voucher_id` and stamps the
 *     matched KID — the ONLY mutations the append-only trigger permits (every imported column frozen);
 *   * marks the invoice `paid`;
 *   * REFUSES a non-equal amount atomically (no voucher, transaction stays unmatched, invoice stays
 *     open) and refuses a second settlement of an already-matched transaction (no double-post).
 */
describe.skipIf(!ledgerDbAvailable)('bank reconciliation → settlement (app role + RLS)', () => {
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
  async function provisionOrg(): Promise<string> {
    orgSeq += 1;
    const orgNr = String(950000000 + orgSeq);
    const [org] = await db.sql<{ id: string }[]>`
      INSERT INTO organization (org_nr, name, mva_status)
      VALUES (${orgNr}, ${'Avstem ENK ' + String(orgSeq)}, ${'registered_standard'})
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

  /** Issue a one-line registered invoice; return its id + allocated KID + gross øre. */
  async function issueOneLineInvoice(orgId: string, unitPriceKr: string) {
    const input = oneLineInput({
      accountId: await accountId(orgId, '3000'),
      vatCodeId: await vatCodeId(orgId, '3'),
      unitPriceKr,
    });
    const created = await withOrgTx(appDb, orgId, (tx) => createDraft(tx, orgId, input));
    const invoiceId = created.ok ? created.id : '';
    await withOrgTx(appDb, orgId, (tx) =>
      issueInvoice(tx, orgId, invoiceId, { issueDate: '2026-06-01', dueDate: '2026-06-15' }),
    );
    const [doc] = await db.sql<{ kid: string | null; gross: number; status: string }[]>`
      SELECT kid, gross_ore::int AS gross, status FROM invoice WHERE id = ${invoiceId}`;
    return { invoiceId, kid: doc!.kid, gross: doc!.gross };
  }

  /** Seed a bank account + an incoming transaction (owner connection). */
  async function seedIncoming(
    orgId: string,
    amountOre: number,
    remittance: string,
    externalRef: string,
    bookingDate: string | null = '2026-06-10',
  ): Promise<{ accountId: string; txId: string }> {
    const [acc] = await db.sql<{ id: string }[]>`
      INSERT INTO bank_account (organization_id, label, currency)
      VALUES (${orgId}, 'Driftskonto', 'NOK') RETURNING id`;
    const acctId = acc!.id;
    const [tx] = await db.sql<{ id: string }[]>`
      INSERT INTO bank_transaction
        (organization_id, bank_account_id, source, external_ref, amount_ore, currency,
         booking_date, remittance_info)
      VALUES (${orgId}, ${acctId}, 'camt054', ${externalRef}, ${amountOre}, 'NOK',
         ${bookingDate}, ${remittance})
      RETURNING id`;
    return { accountId: acctId, txId: tx!.id };
  }

  it('settles a KID-matched payment: balanced bank voucher, linked tx, invoice paid', async () => {
    const orgId = await provisionOrg();
    const { invoiceId, kid, gross } = await issueOneLineInvoice(orgId, '1000'); // 125 000 øre gross
    expect(kid).not.toBeNull();
    const { txId } = await seedIncoming(orgId, gross, `Betaling KID ${kid}`, 'pay-1');

    const result = await withOrgTx(appDb, orgId, (tx) =>
      reconcileMatch(tx, orgId, { bankTransactionId: txId, invoiceId }),
    );
    expect(result.ok).toBe(true);
    const voucherId = result.ok ? result.voucherId : '';

    // The settlement voucher is a posted `bank` voucher in the booking-date period (2026), balanced.
    const [v] = await db.sql<{ type: string; posted: string | null; year: number }[]>`
      SELECT v.type, v.posted_at AS posted, fp.year
        FROM voucher v JOIN fiscal_period fp ON fp.id = v.period_id
       WHERE v.id = ${voucherId}`;
    expect(v?.type).toBe('bank');
    expect(v?.posted).not.toBeNull();
    expect(v?.year).toBe(2026);

    // Debit bank 1920 gross / credit receivable 1500 gross — and it balances.
    const legs = await db.sql<{ number: string; debit: number; credit: number }[]>`
      SELECT a.number, p.debit_ore::int AS debit, p.credit_ore::int AS credit
        FROM posting p JOIN account a ON a.id = p.account_id
       WHERE p.voucher_id = ${voucherId}
       ORDER BY a.number`;
    expect(legs).toEqual([
      { number: '1500', debit: 0, credit: gross },
      { number: '1920', debit: gross, credit: 0 },
    ]);

    // The imported transaction is linked to the settlement voucher and stamped with the matched KID;
    // its imported facts (amount) are unchanged.
    const [tx] = await db.sql<{ matched: string | null; kid: string | null; amount: number }[]>`
      SELECT matched_voucher_id AS matched, kid, amount_ore::int AS amount
        FROM bank_transaction WHERE id = ${txId}`;
    expect(tx?.matched).toBe(voucherId);
    expect(tx?.kid).toBe(kid);
    expect(tx?.amount).toBe(gross);

    // The invoice is marked paid.
    const [inv] = await db.sql<{ status: string; paid: string | null }[]>`
      SELECT status, paid_at AS paid FROM invoice WHERE id = ${invoiceId}`;
    expect(inv?.status).toBe('paid');
    expect(inv?.paid).not.toBeNull();
  });

  it('refuses a non-equal amount atomically — no voucher, tx unmatched, invoice still open', async () => {
    const orgId = await provisionOrg();
    const { invoiceId, gross } = await issueOneLineInvoice(orgId, '1000');
    const { txId } = await seedIncoming(orgId, gross - 1, 'Delbetaling', 'pay-2'); // 1 øre short

    const result = await withOrgTx(appDb, orgId, (tx) =>
      reconcileMatch(tx, orgId, { bankTransactionId: txId, invoiceId }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('amount-mismatch');

    // Only the AR voucher from issuing exists — no `bank` settlement was posted.
    const [bankVouchers] = await db.sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM voucher WHERE organization_id = ${orgId} AND type = 'bank'`;
    expect(bankVouchers?.count).toBe(0);
    const [tx] = await db.sql<{ matched: string | null }[]>`
      SELECT matched_voucher_id AS matched FROM bank_transaction WHERE id = ${txId}`;
    expect(tx?.matched).toBeNull();
    const [inv] = await db.sql<{ status: string }[]>`
      SELECT status FROM invoice WHERE id = ${invoiceId}`;
    expect(inv?.status).not.toBe('paid');
  });

  it('refuses to settle an already-matched transaction twice (no double-post)', async () => {
    const orgId = await provisionOrg();
    const first = await issueOneLineInvoice(orgId, '1000');
    const { txId } = await seedIncoming(orgId, first.gross, `KID ${first.kid}`, 'pay-3');
    const ok = await withOrgTx(appDb, orgId, (tx) =>
      reconcileMatch(tx, orgId, { bankTransactionId: txId, invoiceId: first.invoiceId }),
    );
    expect(ok.ok).toBe(true);

    // A second invoice of the same amount; trying to reuse the (now matched) transaction must fail.
    const second = await issueOneLineInvoice(orgId, '1000');
    const again = await withOrgTx(appDb, orgId, (tx) =>
      reconcileMatch(tx, orgId, { bankTransactionId: txId, invoiceId: second.invoiceId }),
    );
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.reason).toBe('tx-already-matched');

    const [bankVouchers] = await db.sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM voucher WHERE organization_id = ${orgId} AND type = 'bank'`;
    expect(bankVouchers?.count).toBe(1); // exactly one settlement, not two
  });

  it('falls back to the invoice issue-year period when the payment has no booking date', async () => {
    const orgId = await provisionOrg();
    const { invoiceId, kid, gross } = await issueOneLineInvoice(orgId, '1000'); // issued 2026
    const { txId } = await seedIncoming(orgId, gross, `KID ${kid}`, 'pay-4', null); // no booking date

    const result = await withOrgTx(appDb, orgId, (tx) =>
      reconcileMatch(tx, orgId, { bankTransactionId: txId, invoiceId }),
    );
    expect(result.ok).toBe(true);
    const voucherId = result.ok ? result.voucherId : '';
    const [v] = await db.sql<{ year: number }[]>`
      SELECT fp.year FROM voucher v JOIN fiscal_period fp ON fp.id = v.period_id
       WHERE v.id = ${voucherId}`;
    expect(v?.year).toBe(2026); // the invoice's issue year, since the payment had no date
  });
});
