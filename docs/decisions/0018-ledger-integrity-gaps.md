# ADR 0018 — Closing four ledger-integrity gaps in SQL

- **Status:** Accepted
- **Date:** 2026-06-23

## Context
The core ledger (ADR 0003) enforces balance, immutability, period-lock, and gapless numbering in SQL.
A review found four concrete holes where the SQL did not fully enforce an invariant the ledger relies
on. Per our discipline, each is closed in SQL (not app code) and proven by a Testcontainers test of the
**bad** case.

1. **Period-lock reached only the voucher.** `block_locked_period` fired on `voucher`, so postings
   could still be inserted/updated/deleted on an *existing, unposted* voucher whose period was locked
   *afterwards* — and an unposted voucher in a locked period could be deleted.
2. **Empty / half-posted vouchers.** The balance trigger treats `0 = 0` as valid, so a voucher could be
   marked `posted_at` with **zero** (or otherwise incomplete) postings.
3. **Overlapping fiscal periods.** Nothing stopped a tenant from creating two periods whose date ranges
   overlap.
4. **Cross-org period reference.** A voucher's `period_id` was only a single-column FK; pointing it at
   another org's period was prevented by RLS *visibility*, not by a hard constraint.

## Decision
One migration (`..._ledger_integrity_gaps.sql`) adds:

1. A `posting`-side `BEFORE INSERT/UPDATE/DELETE` trigger that rejects any posting whose voucher's
   period is locked; and extends the voucher trigger to `DELETE` (via `COALESCE(NEW, OLD)`).
2. A **deferred** constraint trigger `voucher_posted_complete`: a voucher with `posted_at` set must
   have **≥ 2 postings and balance**. Deferred so the normal insert-voucher → insert-postings →
   set-posted_at flow is validated at COMMIT. Drafts (unposted) may still be incomplete.
3. An `EXCLUDE USING gist` constraint (`btree_gist`) forbidding overlapping `daterange(starts_on,
   ends_on, '[]')` for the same org.
4. A composite FK `voucher (period_id, organization_id) → fiscal_period (id, organization_id)` (backed
   by a new `UNIQUE (id, organization_id)`), making a cross-org period reference impossible at the
   storage layer.

A new RLS-**coverage** test asserts *every* `public` base table has `ENABLE`+`FORCE` RLS, a policy, and
a `saldo_app` grant — turning the ledger rule's "every tenant table MUST…" into a mechanical gate.

## Consequences
- Each gap is closed in the database, so it holds regardless of which code path (or role) writes — and
  is proven by a failing-bad-case Testcontainers test (10 new assertions) plus the coverage gate.
- The single-column `voucher.period_id` FK remains (harmless; subsumed by the composite one).
- squawk flags the constraint-adds as unsafe-on-a-populated-table; the tables are **greenfield/empty**
  here, so each is exempted with an inline `-- squawk-ignore` + justification (the rules stay active
  globally for future migrations) — consistent with ADR 0017's greenfield exclusions.
- Posting `account_id` / `vat_code_id` cross-org references remain guarded by RLS only (not in scope
  here); a future migration can extend the composite-FK pattern to them if defense-in-depth warrants.

## Alternatives considered
- **A trigger for same-org period** instead of a composite FK — a declarative FK is simpler, cheaper,
  and self-documenting; a trigger would re-implement referential integrity by hand.
- **A `CHECK`/app-layer guard for posted-completeness** — app code is not a guarantee (ADR 0003); a
  non-deferred check would break the natural multi-statement posting flow.
