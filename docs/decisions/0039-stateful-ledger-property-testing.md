# ADR 0039 — Stateful, model-based property testing of the ledger (a real-DB command model)

- **Status:** Accepted
- **Date:** 2026-06-25

## Context

The ledger is Saldo's system of record, and its hard invariants are enforced in **SQL**, not the ORM
(ADR 0011, `.claude/rules/ledger-integrity.md`): vouchers balance at commit, posted vouchers and their
postings are immutable (correct via motbilag/kreditnota — never UPDATE/DELETE), no posting touches a
locked period, and invoice numbers are gapless from a per-org counter row (never a SEQUENCE, which
leaks gaps on rollback — ADR 0007).

Three layers already test pieces of this, but each looks at a *single* point:

- The **example-based integrity suites** (`apps/web/test/integrity/ledger-integrity*.integration.test.ts`)
  prove specific good/bad cases — one balanced voucher accepted, one unbalanced voucher rejected, one
  delete of a posted voucher blocked. Each is a hand-picked transition.
- The **restore verifier** (`db/dr/verify-restore.sql`, ADR 0038) asserts the integrity layer is
  *present and bites* — but on a single static snapshot.
- The **domain property tests** (`packages/domain/src/posting/balance.test.ts`) exercise the pure
  balance rule over random vouchers — but only the in-memory copy of the rule, with no database.

What none of them cover is the **dynamic dimension**: that the invariants hold across *arbitrary
interleavings* of operations over time — post, then reverse, then lock the period, then attempt an
illegal mutation, then allocate an invoice number inside a transaction that rolls back, in any order a
real workload might produce. A bug that only appears after a specific *sequence* of state transitions
(e.g. a counter that double-advances after a rollback, or an immutability check that a reversal
accidentally bypasses) is invisible to point tests.

## Decision

Add **stateful, model-based property testing** (fast-check `fc.asyncModelRun`) that drives random
command sequences through the ledger and asserts the hard invariants hold after *every* command in
*every* generated history. The model lives in **`apps/web/test/integrity`** as a Testcontainers/real-
Postgres integration suite (`ledger-stateful.integration.test.ts`), reusing the existing `db-harness`
(`startLedgerDb` / `seedOrg`).

**The "real system" under test is the actual Postgres, exercised through the real triggers, constraints
and the `allocate_invoice_number` function — NOT a pure-domain re-implementation.** This is the load-
bearing choice. The invariant we most need to defend is precisely that posting is *server-authoritative
and SQL-enforced*; a pure in-memory model would only re-test the domain's own copy of the rules (already
covered by `packages/domain` property tests) and would prove nothing about the database that is the
actual system of record. So:

- The **abstract model** is a small in-memory description of expected state (which vouchers are posted,
  which periods are locked, the next gapless invoice number, the set of numbers committed so far).
- Each **command** runs against the real DB and asserts the database agrees with the model: legal
  operations succeed and advance state; illegal ones (unbalanced post, mutate/delete a posted voucher,
  post into a locked period) are **rejected by SQL**, leaving state unchanged.
- After every command a **global invariant sweep** re-checks the universal properties against the live
  DB: every voucher with postings balances, the committed posted-voucher set matches the model, the
  invoice counter equals the model's next number, and the committed invoice numbers form a gapless
  `1..n` with no SEQUENCE in the schema.

Correction stays on the legitimate path: the reversal command books a **motbilag** (a new voucher with
swapped legs referencing `reverses_voucher_id`), never an UPDATE/DELETE — so the model also asserts the
append-only *workflow*, not just that mutation is blocked.

Each property run seeds a **fresh org** (tenant-isolated by `organization_id`) on one shared migrated
database, so runs are independent without per-run container churn.

## Consequences

- The dynamic transitions the static verifier and point tests can't reach are now covered: invariants
  are asserted across thousands of randomly-interleaved histories, with fast-check shrinking any failure
  to a minimal reproducing sequence.
- The suite is **defense-in-depth, not duplication**: it pins the SQL layer's behaviour under
  composition, complementing (not replacing) the example suites that document each specific guarantee
  and the domain property tests that cover the pure rule.
- It runs only where a real Postgres is reachable (Docker/Testcontainers or `SALDO_TEST_PG_URI`) and
  `skipIf`s cleanly otherwise — same contract as the other integrity suites (ADR 0014).
- Cost: model-based runs are slower than example tests (many DB round-trips per run); run count and
  command-list length are kept modest and bounded so the suite stays inside the existing 120 s test
  timeout.

## Alternatives considered

- **A pure-domain stateful model** (re-implement post/reverse/lock/allocate in TypeScript and
  property-test that) — rejected as the *primary* target: it would test a second copy of the rules, not
  the SQL layer that is authoritative. The whole point of the ledger's design is that integrity lives in
  the database; the stateful test must therefore drive the database. (The pure balance rule keeps its
  own domain property test — that is the right home for *that* check.)
- **More hand-written example cases** — rejected as sufficient: example tests encode the transitions an
  author already thought of. The failure modes worth fearing in a system of record are the
  *interleavings* nobody enumerated; only generated sequences find those.
- **A fresh Testcontainer per property run** — rejected as wasteful: tenant isolation by
  `organization_id` already gives each run a clean slate on one migrated database, at a fraction of the
  startup cost.
