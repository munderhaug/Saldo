import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { type LedgerDb, ledgerDbAvailable, seedOrg, startLedgerDb } from './db-harness.js';

/**
 * Stateful, model-based property testing of the ledger (ADR 0039).
 *
 * The example suites (`ledger-integrity*.integration.test.ts`) prove single, hand-picked transitions;
 * the restore verifier (`db/dr/verify-restore.sql`) proves the integrity layer bites on a static
 * snapshot. NEITHER covers the dynamic dimension: that the hard invariants hold across *arbitrary
 * interleavings* of post / reverse / lock / allocate over time. This suite drives random command
 * sequences (fast-check `asyncModelRun`) through the **real Postgres** — the actual triggers,
 * constraints and `allocate_invoice_number` function, NOT a pure-domain re-implementation — because
 * the property under test is precisely that posting is server-authoritative and SQL-enforced.
 *
 * After every command a global sweep re-asserts the universal invariants against the live DB:
 *   • every voucher with postings balances (Σ debit = Σ credit, integer øre);
 *   • the committed posted-voucher set matches the model (append-only: nothing vanished/mutated);
 *   • the invoice counter equals the model's count of committed allocations (gapless, never a SEQUENCE).
 * Illegal operations (unbalanced post, mutate/delete a posted voucher, post into a locked period) are
 * rejected by SQL and leave state unchanged; correction stays on the legitimate motbilag path.
 */

// Needs a real Postgres (Docker/Testcontainers, or SALDO_TEST_PG_URI). Skips cleanly otherwise.
describe.skipIf(!ledgerDbAvailable)('SQL ledger — stateful property model (real Postgres)', () => {
  let db: LedgerDb;

  beforeAll(async () => {
    db = await startLedgerDb();
  });

  afterAll(async () => {
    await db.stop();
  });

  // ── The abstract model: the expected dynamic state of one tenant's ledger ──
  interface Model {
    /** Fiscal periods currently open (postable). */
    openPeriods: string[];
    /** Fiscal periods that have been locked. */
    lockedPeriods: string[];
    /** Vouchers that have been committed with `posted_at` set (originals + reversals). */
    postedVoucherIds: string[];
    /** The highest invoice number committed so far; the next allocation must return this + 1. */
    lastInvoice: number;
  }

  // ── The real system under test: stable handles for one freshly-seeded tenant ──
  interface Real {
    orgId: string;
    debitAccountId: string;
    creditAccountId: string;
    openPeriodIds: string[];
    lockedPeriodIds: string[];
  }

  /**
   * Seed one isolated tenant for a property run: `seedOrg` gives an open 2026 + a locked 2025 period
   * and two accounts; we add a few more non-overlapping open periods so a run can lock some while still
   * posting into others. Tenant isolation by `organization_id` keeps runs independent on one shared DB.
   */
  async function seedRun(): Promise<Real> {
    const base = await seedOrg(db.sql);
    const extra: string[] = [];
    for (const year of [2021, 2022, 2023, 2024]) {
      const [p] = await db.sql<{ id: string }[]>`
        INSERT INTO fiscal_period (organization_id, year, starts_on, ends_on)
        VALUES (${base.orgId}, ${year}, ${`${year}-01-01`}, ${`${year}-12-31`})
        RETURNING id`;
      extra.push(p!.id);
    }
    return {
      orgId: base.orgId,
      debitAccountId: base.debitAccountId,
      creditAccountId: base.creditAccountId,
      openPeriodIds: [base.openPeriodId, ...extra],
      lockedPeriodIds: [base.lockedPeriodId],
    };
  }

  function freshModel(r: Real): Model {
    return {
      openPeriods: [...r.openPeriodIds],
      lockedPeriods: [...r.lockedPeriodIds],
      postedVoucherIds: [],
      lastInvoice: 0,
    };
  }

  /** The universal invariants — re-checked against the live DB after every command. */
  async function assertInvariants(m: Model, r: Real): Promise<void> {
    // 1. Every voucher with postings balances (the deferred balance trigger holds across all history).
    const [unbalanced] = await db.sql<{ c: number }[]>`
      SELECT count(*)::int AS c FROM (
        SELECT voucher_id FROM posting WHERE organization_id = ${r.orgId}
        GROUP BY voucher_id HAVING sum(debit_ore) <> sum(credit_ore)
      ) AS x`;
    expect(unbalanced!.c).toBe(0);

    // 2. Append-only: the set of committed posted vouchers is exactly what the model expects — no
    //    rejected mutation slipped through and nothing was deleted.
    const [posted] = await db.sql<{ c: number }[]>`
      SELECT count(*)::int AS c
      FROM voucher WHERE organization_id = ${r.orgId} AND posted_at IS NOT NULL`;
    expect(posted!.c).toBe(m.postedVoucherIds.length);

    // 3. Gapless numbering: the counter row equals the count of committed allocations (so the committed
    //    numbers are exactly 1..lastInvoice — a rolled-back allocation never advanced it).
    const counter = await db.sql<{ next: string }[]>`
      SELECT next FROM invoice_counter WHERE organization_id = ${r.orgId}`;
    const next = counter.length ? Number(counter[0]!.next) : 0;
    expect(next).toBe(m.lastInvoice);
  }

  type Cmd = fc.AsyncCommand<Model, Real>;

  /** Post a balanced two-leg voucher into an open period and mark it posted (one tx). */
  class PostBalanced implements Cmd {
    constructor(
      readonly periodIdx: number,
      readonly amount: number,
    ) {}
    check(m: Model): boolean {
      return m.openPeriods.length > 0;
    }
    async run(m: Model, r: Real): Promise<void> {
      const period = m.openPeriods[this.periodIdx % m.openPeriods.length]!;
      let voucherId = '';
      await db.sql.begin(async (tx) => {
        const [v] = await tx<{ id: string }[]>`
          INSERT INTO voucher (organization_id, type, period_id)
          VALUES (${r.orgId}, 'manual', ${period}) RETURNING id`;
        voucherId = v!.id;
        await tx`INSERT INTO posting (organization_id, voucher_id, account_id, debit_ore, credit_ore)
                 VALUES (${r.orgId}, ${voucherId}, ${r.debitAccountId}, ${this.amount}, 0)`;
        await tx`INSERT INTO posting (organization_id, voucher_id, account_id, debit_ore, credit_ore)
                 VALUES (${r.orgId}, ${voucherId}, ${r.creditAccountId}, 0, ${this.amount})`;
        await tx`UPDATE voucher SET posted_at = now() WHERE id = ${voucherId}`;
      });
      m.postedVoucherIds.push(voucherId);
      await assertInvariants(m, r);
    }
    toString(): string {
      return `post(p${this.periodIdx},${this.amount})`;
    }
  }

  /** Correct a posted voucher the ONLY legal way: a balanced motbilag with swapped legs. */
  class ReverseVoucher implements Cmd {
    constructor(
      readonly voucherIdx: number,
      readonly periodIdx: number,
    ) {}
    check(m: Model): boolean {
      return m.postedVoucherIds.length > 0 && m.openPeriods.length > 0;
    }
    async run(m: Model, r: Real): Promise<void> {
      const original = m.postedVoucherIds[this.voucherIdx % m.postedVoucherIds.length]!;
      const period = m.openPeriods[this.periodIdx % m.openPeriods.length]!;
      let reversalId = '';
      await db.sql.begin(async (tx) => {
        const [v] = await tx<{ id: string }[]>`
          INSERT INTO voucher (organization_id, type, period_id, reverses_voucher_id)
          VALUES (${r.orgId}, 'reversal', ${period}, ${original}) RETURNING id`;
        reversalId = v!.id;
        const legs = await tx<{ account_id: string; debit_ore: string; credit_ore: string }[]>`
          SELECT account_id, debit_ore, credit_ore FROM posting WHERE voucher_id = ${original}`;
        for (const leg of legs) {
          // Swap debit ↔ credit: the reversal nets the original to zero and is itself balanced.
          await tx`INSERT INTO posting (organization_id, voucher_id, account_id, debit_ore, credit_ore)
                   VALUES (${r.orgId}, ${reversalId}, ${leg.account_id}, ${leg.credit_ore}, ${leg.debit_ore})`;
        }
        await tx`UPDATE voucher SET posted_at = now() WHERE id = ${reversalId}`;
      });
      m.postedVoucherIds.push(reversalId);
      await assertInvariants(m, r);
    }
    toString(): string {
      return `reverse(v${this.voucherIdx}->p${this.periodIdx})`;
    }
  }

  /** Attempt the forbidden direct mutation of a posted voucher — SQL must reject it. */
  class AttemptMutateVoucher implements Cmd {
    constructor(
      readonly voucherIdx: number,
      readonly del: boolean,
    ) {}
    check(m: Model): boolean {
      return m.postedVoucherIds.length > 0;
    }
    async run(m: Model, r: Real): Promise<void> {
      const v = m.postedVoucherIds[this.voucherIdx % m.postedVoucherIds.length]!;
      const attempt = this.del
        ? db.sql`DELETE FROM voucher WHERE id = ${v}`
        : db.sql`UPDATE voucher SET type = 'bank' WHERE id = ${v}`;
      await expect(attempt).rejects.toThrow(/posted|immutable|locked/i);
      await assertInvariants(m, r); // state unchanged
    }
    toString(): string {
      return `mutateVoucher(v${this.voucherIdx},${this.del ? 'del' : 'upd'})`;
    }
  }

  /** Attempt the forbidden direct mutation of a posted voucher's postings — SQL must reject it. */
  class AttemptMutatePosting implements Cmd {
    constructor(
      readonly voucherIdx: number,
      readonly del: boolean,
    ) {}
    check(m: Model): boolean {
      return m.postedVoucherIds.length > 0;
    }
    async run(m: Model, r: Real): Promise<void> {
      const v = m.postedVoucherIds[this.voucherIdx % m.postedVoucherIds.length]!;
      const attempt = this.del
        ? db.sql`DELETE FROM posting WHERE voucher_id = ${v}`
        : db.sql`UPDATE posting SET debit_ore = debit_ore + 1 WHERE voucher_id = ${v}`;
      await expect(attempt).rejects.toThrow(/immutable|locked/i);
      await assertInvariants(m, r); // state unchanged
    }
    toString(): string {
      return `mutatePosting(v${this.voucherIdx},${this.del ? 'del' : 'upd'})`;
    }
  }

  /** Attempt an unbalanced post (debit ≠ credit) — the deferred balance trigger must reject at commit. */
  class AttemptUnbalanced implements Cmd {
    constructor(
      readonly periodIdx: number,
      readonly debit: number,
      readonly credit: number,
    ) {}
    check(m: Model): boolean {
      return m.openPeriods.length > 0 && this.debit !== this.credit;
    }
    async run(m: Model, r: Real): Promise<void> {
      const period = m.openPeriods[this.periodIdx % m.openPeriods.length]!;
      await expect(
        db.sql.begin(async (tx) => {
          const [v] = await tx<{ id: string }[]>`
            INSERT INTO voucher (organization_id, type, period_id)
            VALUES (${r.orgId}, 'manual', ${period}) RETURNING id`;
          await tx`INSERT INTO posting (organization_id, voucher_id, account_id, debit_ore, credit_ore)
                   VALUES (${r.orgId}, ${v!.id}, ${r.debitAccountId}, ${this.debit}, 0)`;
          await tx`INSERT INTO posting (organization_id, voucher_id, account_id, debit_ore, credit_ore)
                   VALUES (${r.orgId}, ${v!.id}, ${r.creditAccountId}, 0, ${this.credit})`;
          await tx`UPDATE voucher SET posted_at = now() WHERE id = ${v!.id}`;
        }),
      ).rejects.toThrow(/unbalanced/i);
      await assertInvariants(m, r); // whole tx rolled back
    }
    toString(): string {
      return `unbalanced(p${this.periodIdx},${this.debit}/${this.credit})`;
    }
  }

  /** Lock an open period. Always permitted; afterwards posting into it must fail. */
  class LockPeriod implements Cmd {
    constructor(readonly periodIdx: number) {}
    check(m: Model): boolean {
      return m.openPeriods.length > 0;
    }
    async run(m: Model, r: Real): Promise<void> {
      const i = this.periodIdx % m.openPeriods.length;
      const period = m.openPeriods[i]!;
      await db.sql`UPDATE fiscal_period SET locked_at = now() WHERE id = ${period}`;
      m.openPeriods.splice(i, 1);
      m.lockedPeriods.push(period);
      await assertInvariants(m, r);
    }
    toString(): string {
      return `lock(p${this.periodIdx})`;
    }
  }

  /** Attempt to post into a locked period — the period-lock trigger must reject it. */
  class AttemptPostLocked implements Cmd {
    constructor(readonly periodIdx: number) {}
    check(m: Model): boolean {
      return m.lockedPeriods.length > 0;
    }
    async run(m: Model, r: Real): Promise<void> {
      const period = m.lockedPeriods[this.periodIdx % m.lockedPeriods.length]!;
      await expect(
        db.sql`INSERT INTO voucher (organization_id, type, period_id)
               VALUES (${r.orgId}, 'manual', ${period})`,
      ).rejects.toThrow(/locked/i);
      await assertInvariants(m, r);
    }
    toString(): string {
      return `postLocked(p${this.periodIdx})`;
    }
  }

  /** Allocate an invoice number; it must equal the model's next gapless number. */
  class AllocateInvoice implements Cmd {
    check(): boolean {
      return true;
    }
    async run(m: Model, r: Real): Promise<void> {
      const [row] = await db.sql<{ n: string }[]>`
        SELECT allocate_invoice_number(${r.orgId}) AS n`;
      expect(Number(row!.n)).toBe(m.lastInvoice + 1);
      m.lastInvoice += 1;
      await assertInvariants(m, r);
    }
    toString(): string {
      return 'allocInvoice';
    }
  }

  /** Allocate inside a tx that rolls back: the number is consumed transiently but the counter must
   *  NOT advance — a SEQUENCE would have burned it, leaving a gap. This is gaplessness under rollback. */
  class AllocateInvoiceRolledBack implements Cmd {
    check(): boolean {
      return true;
    }
    async run(m: Model, r: Real): Promise<void> {
      let burned = 0;
      await expect(
        db.sql.begin(async (tx) => {
          const [row] = await tx<{ n: string }[]>`
            SELECT allocate_invoice_number(${r.orgId}) AS n`;
          burned = Number(row!.n);
          throw new Error('force rollback');
        }),
      ).rejects.toThrow('force rollback');
      expect(burned).toBe(m.lastInvoice + 1); // it WOULD have been the next number…
      await assertInvariants(m, r); // …but the counter is unchanged (no gap)
    }
    toString(): string {
      return 'allocInvoiceRollback';
    }
  }

  const ore = fc.integer({ min: 1, max: 100_000_000 }); // 1 øre … 1 000 000 kr
  const idx = fc.nat({ max: 1000 });

  const commandArbs: fc.Arbitrary<Cmd>[] = [
    // Bias toward the state-building commands so reverse/mutate paths are reachable.
    fc.tuple(idx, ore).map(([p, a]) => new PostBalanced(p, a)),
    fc.tuple(idx, ore).map(([p, a]) => new PostBalanced(p, a)),
    fc.tuple(idx, idx).map(([v, p]) => new ReverseVoucher(v, p)),
    fc.tuple(idx, fc.boolean()).map(([v, d]) => new AttemptMutateVoucher(v, d)),
    fc.tuple(idx, fc.boolean()).map(([v, d]) => new AttemptMutatePosting(v, d)),
    fc.tuple(idx, ore, ore).map(([p, d, c]) => new AttemptUnbalanced(p, d, c)),
    idx.map((p) => new LockPeriod(p)),
    idx.map((p) => new AttemptPostLocked(p)),
    fc.constant(new AllocateInvoice()),
    fc.constant(new AllocateInvoice()),
    fc.constant(new AllocateInvoiceRolledBack()),
  ];

  it('every reachable history upholds balance, append-only and gapless numbering', async () => {
    await fc.assert(
      fc.asyncProperty(fc.commands(commandArbs, { maxCommands: 16 }), async (cmds) => {
        const real = await seedRun(); // fresh tenant per run → clean slate on shrink replays
        const model = freshModel(real);
        await fc.asyncModelRun(() => ({ model, real }), cmds);
      }),
      { numRuns: 25 },
    );
  });

  it('gaplessness is a counter row, not a SEQUENCE (no invoice sequence exists in the schema)', async () => {
    const [seq] = await db.sql<{ c: number }[]>`
      SELECT count(*)::int AS c FROM pg_class WHERE relkind = 'S' AND relname ILIKE '%invoice%'`;
    expect(seq!.c).toBe(0);
  });
});
