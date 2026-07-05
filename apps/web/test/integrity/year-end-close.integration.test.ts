import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import { type LedgerDb, ledgerDbAvailable, startLedgerDb } from './db-harness.js';
import * as schema from '../../app/db/schema.js';
import { withOrgTx } from '../../app/auth/middleware.js';
import { recordManualVoucher, recordOwnerEvent } from '../../app/db/posting.server.js';
import { closeYear, isYearClosed } from '../../app/db/year-end.server.js';
import { aggregateAccountBalances } from '../../app/db/reporting.server.js';
import { STANDARD_ACCOUNTS, STANDARD_VAT_CODES } from '../../app/db/provisioning.server.js';

// Needs a real Postgres (Docker/Testcontainers, or SALDO_TEST_PG_URI). Skips cleanly otherwise.

/**
 * Year-end close (feat-year-end-close, ADR 0064). Closing a year posts ONE `year_end` voucher that
 * empties every result-side account into equity (2050) and LOCKS the fiscal period — after which the
 * period-lock triggers (ADR 0018) refuse any further posting into the year.
 *
 * Proven against the running invariants — the non-owner `saldo_app` role under FORCE-RLS, inside
 * `withOrgTx`, exactly as the year-end action runs it:
 *  - the closing voucher balances and empties the result side (real activity carried to 2050);
 *  - the resultat read (`excludeYearEnd`) still shows the year's true P&L after the close;
 *  - the period locks atomically with the close: a later posting into the year is BLOCKED in SQL,
 *    and a second close answers `already-closed`;
 *  - tenant isolation: closing org A's year never touches org B.
 */
describe.skipIf(!ledgerDbAvailable)(
  'year-end close — carry-forward + period lock (ADR 0064)',
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

    let seq = 0;
    /** Seed a fully-provisioned org (owner connection bypasses RLS), as real onboarding does. */
    async function provisionOrg(): Promise<string> {
      seq += 1;
      const ownerDb = drizzle(db.sql, { schema });
      const [org] = await db.sql<{ id: string }[]>`
      INSERT INTO organization (org_nr, name, mva_status)
      VALUES (${String(980000000 + seq)}, ${'Avslutning ENK ' + String(seq)}, 'registered_standard')
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

    /** A year of activity: income 50 000, expense 20 000, privatuttak 10 000 (all in øre ×100). */
    async function postYear(orgId: string, year: number): Promise<void> {
      await withOrgTx(appDb, orgId, async (tx) => {
        const income = await recordManualVoucher(tx, {
          organizationId: orgId,
          kind: 'income',
          net: 50_000_00,
          year,
        });
        const expense = await recordManualVoucher(tx, {
          organizationId: orgId,
          kind: 'expense',
          net: 20_000_00,
          year,
        });
        const drawing = await recordOwnerEvent(tx, {
          organizationId: orgId,
          kind: 'drawing',
          net: 10_000_00,
          year,
        });
        if (!income.ok || !expense.ok || !drawing.ok) throw new Error('seed posting failed');
      });
    }

    it('closes the year: the year_end voucher balances, empties the result side, and locks the period', async () => {
      const orgId = await provisionOrg();
      await postYear(orgId, 2025);

      const closed = await withOrgTx(appDb, orgId, (tx) => closeYear(tx, orgId, 2025));
      expect(closed.ok).toBe(true);
      if (!closed.ok) throw new Error('close failed');

      // The voucher is a posted, balanced year_end voucher (balance trigger would have refused else).
      const [v] = await db.sql<{ type: string; posted: string | null }[]>`
      SELECT type, posted_at AS posted FROM voucher WHERE id = ${closed.voucherId}`;
      expect(v).toMatchObject({ type: 'year_end' });
      expect(v!.posted).not.toBeNull();

      // FULL sums (closing included): every result-side account nets zero; 2050 carries the net.
      const full = await withOrgTx(appDb, orgId, (tx) => aggregateAccountBalances(tx, 2025));
      for (const b of full) {
        const klasse = b.number.charAt(0);
        if (klasse >= '3') {
          expect((b.debitØre as number) - (b.creditØre as number), b.number).toBe(0);
        }
      }
      const equity = full.find((b) => b.number === '2050');
      // income 50 000 − expense 20 000 = 30 000 kr credited to equity (the drawing sits on 2060,
      // already klasse 2 — the close moves only the result side).
      expect((equity!.creditØre as number) - (equity!.debitØre as number)).toBe(30_000_00);

      // The resultat read still shows the year's REAL activity after the close.
      const real = await withOrgTx(appDb, orgId, (tx) =>
        aggregateAccountBalances(tx, 2025, { excludeYearEnd: true }),
      );
      const revenue = real.find((b) => b.number.startsWith('3'));
      expect((revenue!.creditØre as number) - (revenue!.debitØre as number)).toBe(50_000_00);

      expect(await withOrgTx(appDb, orgId, (tx) => isYearClosed(tx, 2025))).toBe(true);

      // Carry-forward across years: the NEXT year's cumulative POSITION view (what the balanse
      // reads) shows the carried bank and the closed result on equity, and zero on the result side.
      const nextYear = await withOrgTx(appDb, orgId, (tx) =>
        aggregateAccountBalances(tx, 2026, { cumulative: true }),
      );
      const bank = nextYear.find((b) => b.number === '1920');
      const carriedEquity = nextYear.find((b) => b.number === '2050');
      expect(bank).toBeDefined(); // the position carries, even with no 2026 activity
      expect((carriedEquity!.creditØre as number) - (carriedEquity!.debitØre as number)).toBe(
        30_000_00,
      );
      for (const b of nextYear) {
        if (b.number.charAt(0) >= '3') {
          expect((b.debitØre as number) - (b.creditØre as number), b.number).toBe(0);
        }
      }
    });

    it('the closed year is immutable: a later posting is blocked in SQL; a re-close answers already-closed', async () => {
      const orgId = await provisionOrg();
      await postYear(orgId, 2025);
      const closed = await withOrgTx(appDb, orgId, (tx) => closeYear(tx, orgId, 2025));
      expect(closed.ok).toBe(true);

      // The period-lock trigger (ADR 0018) refuses new postings into the locked year — through the
      // app path (Drizzle wraps the trigger message, so assert the raw SQL surface for the wording).
      await expect(
        withOrgTx(appDb, orgId, (tx) =>
          recordManualVoucher(tx, {
            organizationId: orgId,
            kind: 'income',
            net: 1_000_00,
            year: 2025,
          }),
        ),
      ).rejects.toThrow();
      const [period] = await db.sql<{ id: string }[]>`
      SELECT fp.id FROM fiscal_period fp
       WHERE fp.organization_id = ${orgId} AND fp.year = 2025`;
      await expect(
        db.sql`INSERT INTO voucher (organization_id, type, period_id, posted_at)
             VALUES (${orgId}, 'manual', ${period!.id}, now())`,
      ).rejects.toThrow(/locked/i);

      expect(await withOrgTx(appDb, orgId, (tx) => closeYear(tx, orgId, 2025))).toEqual({
        ok: false,
        reason: 'already-closed',
      });
    });

    it('is nothing-to-close for an empty year, and never touches another tenant', async () => {
      const a = await provisionOrg();
      const b = await provisionOrg();
      await postYear(b, 2025);

      expect(await withOrgTx(appDb, a, (tx) => closeYear(tx, a, 2025))).toEqual({
        ok: false,
        reason: 'nothing-to-close',
      });

      // Org B's year stays open and untouched by A's attempt.
      expect(await withOrgTx(appDb, b, (tx) => isYearClosed(tx, 2025))).toBe(false);
      const bBalances = await withOrgTx(appDb, b, (tx) => aggregateAccountBalances(tx, 2025));
      expect(bBalances.length).toBeGreaterThan(0);
    });
  },
);
