# ADR 0051 — Reporting: resultat/balanse/hovedbok/reskontro/likviditet derived read-only from the ledger

- **Status:** Accepted
- **Date:** 2026-06-26

## Context
The invoicing → ledger → payment → VAT-return loop is closed (ADRs 0042–0050). The posted ledger now
holds enough to answer the accountant/auditor questions the build-spec calls for (§8.9, §16 Phase 7):
the **resultatregnskap** (P&L), the **balanse** (balance sheet), the **hovedbok**/kontospesifikasjon
drill-down, **reskontro** with AR aging, and a simple **likviditet** view. These are reports, not new
business actions — they must not introduce a second posting path, must tie out to the ledger penny-for-
penny, and must keep the hard invariants (integer øre, append-only ledger, RLS tenancy). They are
deterministic aggregation, **not** AI systems (EU AI Act Recital 12), so no Art. 50 disclosure applies —
the same posture as the MVA-melding (ADR 0050) and the honest-number reveal (ADR 0033).

A tension specific to reporting: the everyday surface deliberately never shows konto/debit/credit
(experience-principles §4.2). The hovedbok is the **explicit depth-on-demand exception** — the one
accountant/auditor surface where the ledger's debit/credit grammar is shown.

## Decision
**Derive every report purely in `@saldo/domain` from per-account ledger balances; the SQL query layer
does the summation, the domain composes the reports; no report writes anything.**

- **Aggregation pattern (extends ADR 0033).** `aggregateAccountBalances(year)` sums Σdebit/Σcredit
  **per account** over POSTED vouchers, RLS-scoped via `withUserOrg` — exactly like `aggregateLedger` /
  `aggregateVatByCode`. The pure `@saldo/domain/reporting` functions (`buildResultat`, `buildBalanse`,
  `buildHovedbok`, `bucketReskontro`, `buildLiquidity`) classify by **kontoklasse** (the leading digit,
  source-grounded in the committed SAF-T kontoplan) and compose the figures. Money stays integer øre.
- **Resultat** = revenue (klasse 3, credit−debit) − costs (klasse 4–7, debit−credit) + finansposter
  (klasse 8 **below 8800**, credit−debit). **Årsresultat = Σ over klasse 3–8 (credit−debit)**, the same
  quantity the balanse closes into equity.
- **Balanse** = eiendeler (klasse 1) vs egenkapital og gjeld (klasse 2 **plus the klasse-8 disposition/
  equity accounts 8800+** — 8800 årsresultat, 89xx overføringer, 8980 privatuttak) + the period's
  årsresultat. The two partitions cover klasse 3–8 exactly once, so **eiendeler = egenkapital og gjeld +
  årsresultat** holds by the double-entry invariant (every posted voucher balances). The page states the
  tie-out explicitly.
- **Hovedbok** = one account's posted entries with a debit-normal running balance, starting from the
  prior-periods incoming balance. This is the depth-on-demand exception (§4.2) — the only report showing
  konto/debit/credit, on the accountant/auditor surface.
- **Reskontro** = per-customer open AR (issued, unpaid invoices, reusing the invoice lifecycle +
  reconciliation `matched_voucher_id` state — **not a new model**), signed (+invoice, −credit note),
  bucketed by age. For the invoice-driven flow it reconciles to the kundefordringer control account
  (1500). Leverandørreskontro (AP) awaits supplier invoices.
- **Likviditet** = cash on hand (konto 19xx debit balances, **excluding 1950 skattetrekk** — money held
  in trust) + open AR − open AP (payables are a stub until supplier invoices land).
- **Routes** are read-only under `/orgs/:orgId/reports/*`, `private, no-store`, NO/EN via `t()`, figures
  through the domain money helpers + an accessible currency label (WCAG 2.2 AA). shadcn + TanStack Table
  for the hovedbok drill-down.

## Consequences
- **Tie-outs are proven, not assumed.** A Testcontainers integration test asserts resultat + balanse
  balance (incl. a klasse-8 privatuttak landing on the equity side, not in årsresultat), reskontro
  reconciles to 1500 (paid excluded, credit note signed), the hovedbok running balance closes at the
  account balance, and RLS isolates tenants. Domain exhaustive + fast-check tests cover the rest.
- **No schema change.** Every report reads existing tables; no migration, no new tenant table.
- **Known limits (documented, deferred).** Within-year aggregation only — multi-year opening balances /
  year-end close are `feat-year-end` (Phase 7). The reskontro→control tie-out holds for the invoice
  flow; a manual voucher to 1500 or a partial settlement can introduce a difference, surfaced by a
  follow-up (`reskontro-control-reconciliation`). Open AP, period-over-period comparison, and the
  næringsspesifikasjon figures are out of this slice.
- **Not an AI system.** Deterministic — no Art. 50 obligation; kept that way deliberately.

## Alternatives considered
- **Materialised report tables / a reporting cache.** Rejected: the ledger is the source of truth and
  small-ENK volumes aggregate fast; a cache would add an invalidation burden and a second place for a
  figure to drift from the ledger. Revisit only if volumes demand it.
- **Classify accounts by the stored `account.type` column.** Rejected in favour of the kontoklasse
  (leading digit) so the classification is source-grounded in the SAF-T kontoplan and the finer klasse-8
  split (finans vs disposition) is expressible; `account.type` is a denormalisation.
- **Treat all of kontoklasse 8 as finansposter.** Rejected: 8800 årsresultat and 89xx disposition/
  privatuttak are equity movements; folding them into årsresultat would corrupt the result the moment a
  draw or year-end close is posted. They belong on the balanse equity side.
