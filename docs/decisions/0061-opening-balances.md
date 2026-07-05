# ADR 0061 — Opening balances: one plugged voucher through the ordinary posting path

- **Status:** Accepted
- **Date:** 2026-07-05

## Context

A business switching to Saldo mid-year arrives with existing books; until now the only way in was
manual vouchers from zero, so the ledger — and the honest-number reveal built on it — started wrong
(build-spec §8.1, task `feat-opening-balances`). The ledger-integrity rules forbid any bypass: an
opening balance must be an append-only voucher that satisfies the SQL balance/completeness triggers.

## Decision

Opening balances post as **one balanced voucher through the existing posting path**
(`deriveOpeningBalance` in `@saldo/domain` → the rules gate → `insertPostedVoucher`):

- **The surface speaks positions, not accounts** (experience §4.2): a curated five-line set in
  everyday words — bank deposits (1920), customer receivables (1500), equipment (1250), supplier
  debt (2400), VAT owed (2740) — each optional. Sides are the server's designation ("own" → debit,
  "owe" → credit), never a form field.
- **Equity is the plug**: the own−owe difference lands on 2050 (Annen egenkapital) — credit when
  positive, debit when negative (a struggling business states its position honestly; nothing blocks
  it). That is not a trick: for an ENK the plug *is* the definition of equity. All six numbers are
  source-grounded in the committed kontoplan and verified by `posting-accounts.test.ts`.
- **No VAT codes on any line.** An opening states positions, not new taxable transactions; the VAT
  position carries over as a liability on the settlement account (2740), deliberately not the
  transactional 2700/2710 — so an opening can never leak into an MVA-melding (which aggregates by
  VAT code).
- **Voucher `type` is `'manual'`**, not a new `'opening'` enum value. The `voucher_type_check`
  constraint would need a migration for a new type, and the semantic buys nothing today: the voucher
  is identified by its content, corrections are motbilag either way, and reports don't fork on it. If
  SAF-T or reporting later needs the distinction, add the type in its own migration and ADR.
- **Repeatable, not idempotent, by design**: a second opening voucher is just another voucher —
  append-only corrections (motbilag) are the model, so the surface promises correctability instead of
  policing one-shot-ness.

## Consequences

- Mid-year migrators start with a correct balance sheet and a correct honest number; the reveal, the
  balanse report, and SAF-T all see the opening as ordinary posted data — zero special cases.
- The curated set covers the common ENK migration; unusual positions (loans, stock) can still be
  entered via manual vouchers today and a richer opening surface later (pairs with
  `feat-account-chart-curation`).
- YTD *result* figures (income/costs so far this year) are NOT part of this slice — a migrator's
  in-year activity arrives as ordinary vouchers (or a later import). The honest number is correct for
  activity booked in Saldo plus the opened positions; the ADR records this as the accepted cut.

## Alternatives considered

- **A dedicated `'opening'` voucher type** — cleaner semantics, but requires a check-constraint
  migration + introspection for no behavioral gain today. Deferred, not rejected.
- **Free-form account/amount rows** (a mini hovedbok editor) — maximal power, but drops konto jargon
  on the everyday surface and invites unbalanced/wrong-side entry. Rejected for the first slice.
- **Editing balances as org settings outside the ledger** — a ledger bypass; violates append-only.
  Rejected outright.
