# ADR 0064 — Year-end close: one closing voucher, a locked period, reports that stay honest

- **Status:** Accepted
- **Date:** 2026-07-05

## Context
Build-spec §8.6/§8.10 require the year-end close: balance carry-forward, period locking,
næringsspesifikasjon figures, beregnet personinntekt basis, saldoavskrivning. Until now nothing set
`fiscal_period.locked_at` (the period-lock triggers, ADR 0018, had no writer), the derived
årsresultat was never posted into equity (`buildBalanse` injects it live — its own comment pointed
here), and SAF-T's cumulative opening balances carried result-account history forever (deferred in
ADR 0052). The instruction sketch suggested the carry-forward "produce next year's opening voucher"
via a `deriveOpeningBalance`-style path.

## Decision
**The closing voucher IS the carry-forward** — no separate opening voucher exists for a year
rollover. In a continuous ledger, balance-sheet accounts (klasse 1–2) carry across years by
cumulative sum; posting them again would double-count. What must move is the result side:

- **Domain** (`posting/year-end.ts`, the `deriveOpeningBalance` shape): `deriveYearEndClose` takes
  the year's per-account balances, reverses every non-zero result-side net (kontoklasse 3–8,
  including the ≥8800 dispositions accumulated during the year), and plugs the difference to equity
  **2050** — the same plug account as the migration opening (ADR 0061). No VAT code on any line.
  A new voucher type **`year_end`** (domain union + a CHECK-widening migration) marks it.
- **Server** (`db/year-end.server.ts`): `closeYear` = derive → the ordinary rules gate →
  `insertPostedVoucher` → `fiscal_period.locked_at = now()`, ONE tenant transaction, serialized by
  a `pg_advisory_xact_lock` on org+year (a concurrent double-submit answers `already-closed`, never
  a second closing voucher) with the guarded lock UPDATE asserted. Guards: `already-closed` (locked
  period or existing `year_end` voucher), `nothing-to-close`. Attributed in the audit trail
  (ADR 0062). Known consequence: a year with ONLY balance-sheet activity has nothing to close and
  therefore never locks — acceptable, since the lock exists to protect a posted result.
- **Reports stay honest via the type — and positions go cumulative:** `aggregateAccountBalances`
  gains `excludeYearEnd` (the resultat report and the close derivation read the year's REAL
  activity even after the close empties the result accounts) and `cumulative` (the balanse and
  likviditet read POSITIONS — every year up to and including the viewed one; before this they
  showed single-year deltas, which a multi-year ledger would silently mispresent — vat-review
  2026-07-05 #1). Closed years' result accounts net zero inside the cumulative sum, so the derived
  årsresultat is exactly the unclosed remainder — no special-casing, no double count against the
  posted equity. SAF-T needs no change: with result accounts zeroed in-year, its cumulative opening
  balances become correct for every later year (closing the ADR 0052 gap).
- **Surface** (`/orgs/:orgId/year-end`): the year's figures (driftsinntekter, driftskostnader,
  årsresultat = næringsinntekt — the beregnet personinntekt basis under ADR 0029's stated
  assumptions — and the tax set-aside estimate when the year's rates are captured), a guidance
  checklist, and the §5.5 sober "Lukk året" explicit confirm (only for a year that is over).
- **Saldoavskrivning** (`tax/saldo-depreciation.ts`): the saldogruppe a–j rate table for 2026,
  grounded in the captured Skatteetaten satser page (`docs/regulatory/saldoavskrivning.md`),
  fail-closed per year (the `tax/params.ts` pattern), plus the pure declining-balance schedule.

## Consequences
- Locking finally has a writer; the closed year is immutable in SQL; multi-year SAF-T opening
  balances become honest; the balanse's injected årsresultat and the posted equity can never both
  count.
- Proven by domain exhaustive + property tests (always balanced; result side nets zero post-close;
  loss/zero/balance-only years) and a Testcontainers integrity test (real activity → close →
  result side zero, 2050 carries the result, the period-lock trigger blocks later postings,
  re-close answers `already-closed`, tenant isolation).
- **Deliberate scope cuts, tracked as tasks:** the **asset register** that would feed
  saldoavskrivning postings (`feat-asset-register` — the rate table + schedule are ready), and the
  **full næringsspesifikasjon post mapping** (`feat-naeringsspesifikasjon` — needs its own captured
  structure; the year-end page ships the summary figures). No period REOPEN surface, deliberately —
  corrections happen in the new year, like everything on the append-only ledger.
- Depreciation's § 14-40/§ 14-47 small-amount rules are not modelled (no captured source yet) —
  the schedule is conservative until they are.

## Alternatives considered
- **Post next-year opening vouchers from closing balances** (the instruction's letter). Rejected:
  in a continuous ledger balance accounts already carry; an opening voucher would double them. The
  spirit — the `deriveOpeningBalance`-style pure derivation + plug-to-equity through the ordinary
  posting path — is exactly how the close is built.
- **Close only via an 8960 disposition (leave result accounts un-zeroed).** Keeps the P&L readable
  without a type filter, but leaves SAF-T's cumulative result-account opening balances wrong forever
  — the very gap this task exists to close.
- **A `skattekostnad` accrual line in the close.** Wrong for an ENK: income tax is the OWNER's,
  not the entity's (foretaksmodellen); the estimate belongs on the year-end surface (ADR 0029),
  never in the ledger.
- **Reuse type `'manual'` for the closing voucher** (the ADR 0061 deferral). Rejected now: the
  reports must distinguish the close from real activity — the type finally has behavioral gain,
  which is the test ADR 0061 set.
