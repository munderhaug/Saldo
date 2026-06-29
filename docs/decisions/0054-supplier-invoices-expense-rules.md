# ADR 0054 — Supplier invoices, expense rules, owner draws & mileage

- **Status:** Accepted
- **Date:** 2026-06-29

## Context

Purchases were only half-built: receipt extraction (ADR 0035) and the manual expense path (ADR 0034)
could post a single-line cost voucher, and the reverse-charge dual leg existed (ADR 0044), but there
was no structured **supplier-invoice** document, no per-line non-deductible handling, and no way to
record an *enkeltpersonforetak*'s owner-economy events (drawings, privately-paid outlays, tax-free
travel allowances). Build-spec §8.5 / §16 Phase 4 calls for all of these. The sales side already set
the structural template: a document family (ADR 0042) that posts through the append-only ledger on a
status-driven derivation (ADR 0043), with VAT owned in one place.

The hard constraint: every posting must reuse the existing input-VAT fork (`derivePurchase`) and
reverse-charge dual leg (`deriveReverseChargePurchase`) — no second posting rule — and every account /
VAT code must come from the committed SAF-T lists, never memory.

## Decision

**A supplier-invoice document family, mirroring sales but simpler.** New `supplier_invoice` +
`supplier_invoice_line` tables. Unlike a sales invoice *we* issue, a supplier invoice is *received*:
there is **no gapless number** (the supplier's own invoice number is a free-text reference) and **no
issue lifecycle** — it is a `draft`, then `posted` when its AP voucher books, and from there immutable
in SQL (the posted trigger), corrected only via a motbilag. Same RLS + same-org composite FKs as every
tenant table; the posting voucher links back via a new `voucher.supplier_invoice_id` (mirroring the
sales `invoice_id` link).

**Multi-line AP posting reuses the forks.** `derivePurchaseInvoice` (pure domain) runs each line through
`derivePurchase` (ordinary) or `deriveReverseChargePurchase` (snudd avregning) and merges the legs —
cost debits per account, deductible input VAT per rate, self-accounted reverse-charge legs, and every
line's supplier credit folded into one payable credit. It adds only the aggregation, never a posting
rule. The supplier payable (2400) is credited the document gross (net only on reverse-charge lines, where
the supplier never invoices the VAT).

**Non-deductible input VAT is an explicit, human-recorded reason, not an inference.** `expense-deductibility`
encodes the three statutory cases — `representasjon` (mval § 8-3), `restricted_vehicle` (§ 8-4),
`private_use` (§ 8-2/§ 8-3) — as an exhaustive set whose posting consequence is the existing
`deductible = false` branch (book the gross to cost, no split). A person records the reason on the line;
the system never silently classifies an account. An unregistered org carries **no** input VAT code on its
voucher (it makes no deduction claim), mirroring `deriveStandardExpense`.

**Owner-economy events post as equity movements, not payroll.** For an ENK the owner and business are not
separate persons, so `deriveOwnerOutlay` (a privately-paid cost / a tax-free travel allowance — reuses
`derivePurchase` with owner equity in the payable slot, the input-VAT fork intact) and `deriveDrawing`
(a cash drawing: debit 2060, credit bank — the one genuinely new two-leg event) cover drawings
(privatuttak), outlays (utlegg), and mileage/diett (kjøregodtgjørelse/diett, VAT-free, rate 0). Booked to
the committed kontoplan accounts (drawings 2060, equity-contribution 2062, mileage 7100, diett 7160),
source-grounded and verified by `posting-accounts.test.ts`.

## Consequences

- Purchases are complete end-to-end through the UI: enter a supplier invoice → post AP; record owner
  draws/outlays/mileage. All flow through the one append-only ledger path; the SQL balance /
  posted-completeness / period-lock triggers verify every entry at commit.
- The domain gains exhaustive + fast-check coverage for the multi-line AP voucher, the owner derivations,
  and the non-deductible rule; Testcontainers integrity tests prove the server path (balance,
  immutability, reverse-charge dual leg, owner events) and tenancy.
- **Deferred (tracked in the backlog):** recurring expenses (needs the graphile-worker runner, ADR 0010 —
  recurring *invoices* are likewise still deferred); withdrawal output VAT (uttaks-mva on 3060/2064) for a
  goods drawing; AP aging / supplier reskontro (a reporting surface); auto-*suggesting* a non-deductible
  reason from the chosen account (needs a committed deductibility reference — kept human-confirmed for now).
- Below-threshold § 3-30 self-accounting for an unregistered reverse-charge buyer stays deferred to
  `vat-threshold-watcher` (unchanged from ADR 0044): such a line books a plain net cost with no melding legs.

## Alternatives considered

- **Reuse the sales `invoice` table with a direction flag.** Rejected: the sales document is built around
  *us* issuing it (gapless counter, KID, issue lifecycle, customer snapshot) — none of which fit a received
  document. A separate, simpler table keeps each side's invariants honest.
- **Infer non-deductibility from the account number** (e.g. 7360 "ikke fradragsberettiget"). Rejected for
  now: VAT deductibility (mval § 8-3/§ 8-4) is a distinct axis from the account's income-tax label, and
  classifying it from memory risks the source-grounding invariant. The reason is human-recorded; an
  auto-suggestion backed by a committed reference is a tracked follow-on.
- **Post owner outlays/mileage as a payroll run.** Rejected: an ENK does not pay itself wages (§8.5 names
  these as deductions, not payroll); they are equity movements, far simpler and correct.
- **A dedicated `deriveOwnerOutlay` posting rule.** Rejected as a *new* rule: it delegates to
  `derivePurchase`, changing only the credit account, so the input-VAT fork stays owned in one place.
