import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import { mapExtractionToProposal, øre } from '@saldo/domain';
import { type LedgerDb, ledgerDbAvailable, startLedgerDb } from './db-harness.js';
import * as schema from '../../app/db/schema.js';
import { withOrgTx } from '../../app/auth/middleware.js';
import { recordManualVoucher, POSTING_ACCOUNTS } from '../../app/db/posting.server.js';
import { aggregateLedger } from '../../app/db/ledger.server.js';
import { STANDARD_ACCOUNTS, STANDARD_VAT_CODES } from '../../app/db/provisioning.server.js';
import {
  receiptExtraction,
  type ReceiptExtraction,
} from '../../app/contracts/receipt-extraction.js';

// Needs a real Postgres (Docker/Testcontainers, or SALDO_TEST_PG_URI). Skips cleanly otherwise.

/**
 * The receipt-extraction propose → validate → confirm path (feat-receipt-extraction, ADR 0035), end to
 * end with the LLM **mocked** (a deterministic, already-validated extraction stands in for the vision
 * model — the network is not the unit under test). It proves the AI surface posts through EXACTLY the
 * manual truth: a validated extraction → `mapExtractionToProposal` (@saldo/domain) → `recordManualVoucher`
 * under the non-owner `saldo_app` role inside `withOrgTx`, yielding a balanced, posted voucher the SQL
 * integrity layer accepts. It also proves the validate gate REJECTS a bad extraction before the ledger
 * (AI never writes the ledger — ADR 0002), and that every proposal carries AI provenance (Art. 50(2)).
 */
describe.skipIf(!ledgerDbAvailable)(
  'receipt-extraction path (propose → validate → confirm)',
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
    /** Seed a fully-provisioned org (owner connection bypasses RLS), as real onboarding does. */
    async function provisionOrg(mvaStatus: string): Promise<string> {
      orgSeq += 1;
      const ownerDb = drizzle(db.sql, { schema });
      const [org] = await db.sql<{ id: string }[]>`
      INSERT INTO organization (org_nr, name, mva_status)
      VALUES (${String(940000000 + orgSeq)}, ${'Kvittering ENK ' + String(orgSeq)}, ${mvaStatus})
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

    async function legsOf(voucherId: string) {
      return db.sql<{ number: string; debit: number; credit: number; coded: boolean }[]>`
      SELECT a.number, p.debit_ore::int AS debit, p.credit_ore::int AS credit,
             (p.vat_code_id IS NOT NULL) AS coded
        FROM posting p JOIN account a ON a.id = p.account_id
       WHERE p.voucher_id = ${voucherId}
       ORDER BY a.number`;
    }

    /** A deterministic, boundary-validated extraction — what the LLM client returns on success. */
    function extraction(over: Partial<ReceiptExtraction> = {}): ReceiptExtraction {
      return receiptExtraction.parse({
        supplier: 'Rema 1000',
        documentDate: '2026-06-20',
        direction: 'purchase',
        currency: 'NOK',
        net: øre(40_000),
        vat: øre(10_000),
        provenance: {
          aiAssisted: true,
          model: 'qwen2.5-vl',
          modelVersion: 'qwen2.5-vl:7b',
          confidence: 0.9,
        },
        ...over,
      });
    }

    it('confirms a purchase extraction into a balanced, posted voucher with deductible input VAT', async () => {
      const orgId = await provisionOrg('registered_standard');
      const ex = extraction();
      // Every proposal is disclosed as AI-assisted (Art. 50(2)).
      expect(ex.provenance.aiAssisted).toBe(true);

      const mapped = mapExtractionToProposal({
        direction: ex.direction,
        net: ex.net,
        vat: ex.vat,
        currency: ex.currency,
      });
      expect(mapped.ok).toBe(true);
      if (!mapped.ok) return;
      expect(mapped.proposal.kind).toBe('expense');
      expect(mapped.proposal.vatLooksStandard).toBe(true); // 10000 == 25 % of 40000

      // The human confirms; the proposal posts through the EXISTING manual path.
      const result = await withOrgTx(appDb, orgId, (tx) =>
        recordManualVoucher(tx, {
          organizationId: orgId,
          kind: mapped.proposal.kind,
          net: mapped.proposal.net,
          year: 2026,
        }),
      );
      expect(result.ok).toBe(true);
      const voucherId = result.ok ? result.voucherId : '';

      const [v] = await db.sql<{ type: string; posted: string | null }[]>`
      SELECT type, posted_at AS posted FROM voucher WHERE id = ${voucherId}`;
      expect(v?.type).toBe('purchase');
      expect(v?.posted).not.toBeNull();

      // 2400 payable (gross 50000 cr) / 2710 input VAT (10000 dr) / 7798 cost (net 40000 dr).
      expect(await legsOf(voucherId)).toEqual([
        { number: POSTING_ACCOUNTS.expense.payable, debit: 0, credit: 50_000, coded: false },
        { number: POSTING_ACCOUNTS.expense.inputVat, debit: 10_000, credit: 0, coded: true },
        { number: POSTING_ACCOUNTS.expense.cost, debit: 40_000, credit: 0, coded: true },
      ]);

      const totals = await withOrgTx(appDb, orgId, (tx) => aggregateLedger(tx, 2026));
      expect(totals.expenseNet).toBe(40_000);
      expect(totals.deductibleInputVat).toBe(10_000);
    });

    it('confirms a sale extraction as income with output VAT', async () => {
      const orgId = await provisionOrg('registered_standard');
      const ex = extraction({ direction: 'sale', net: øre(100_000), vat: øre(25_000) });
      const mapped = mapExtractionToProposal({
        direction: ex.direction,
        net: ex.net,
        vat: ex.vat,
        currency: ex.currency,
      });
      expect(mapped.ok && mapped.proposal.kind).toBe('income');
      if (!mapped.ok) return;

      const result = await withOrgTx(appDb, orgId, (tx) =>
        recordManualVoucher(tx, {
          organizationId: orgId,
          kind: mapped.proposal.kind,
          net: mapped.proposal.net,
          year: 2026,
        }),
      );
      expect(result.ok).toBe(true);
      const totals = await withOrgTx(appDb, orgId, (tx) => aggregateLedger(tx, 2026));
      expect(totals).toEqual({
        revenueNet: 100_000,
        expenseNet: 0,
        outputVatCollected: 25_000,
        deductibleInputVat: 0,
      });
    });

    it('the validate gate REJECTS a foreign-currency extraction — nothing reaches the ledger', async () => {
      const orgId = await provisionOrg('registered_standard');
      const ex = extraction({ currency: 'EUR' });
      const mapped = mapExtractionToProposal({
        direction: ex.direction,
        net: ex.net,
        vat: ex.vat,
        currency: ex.currency,
      });
      // The proposal is blocked at the domain gate, so confirm never runs — the AI never writes the ledger.
      expect(mapped).toEqual({ ok: false, reason: 'unsupported-currency' });

      const totals = await withOrgTx(appDb, orgId, (tx) => aggregateLedger(tx, 2026));
      expect(totals).toEqual({
        revenueNet: 0,
        expenseNet: 0,
        outputVatCollected: 0,
        deductibleInputVat: 0,
      });
    });
  },
);
