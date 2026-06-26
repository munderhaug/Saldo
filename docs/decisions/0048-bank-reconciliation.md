# ADR 0048 — Bank reconciliation: deterministic KID/amount/date matcher + settlement posting

- **Status:** Accepted
- **Date:** 2026-06-26

## Context
Banking import (ADR 0047) landed the append-only `bank_transaction` substrate — imported facts with a
signed-øre amount and nullable `kid` / `matched_voucher_id`, but nothing that consumes them. Build-spec
§8.7 / §16 Phase 5 calls for reconciliation: match imported bank lines to issued invoices (KID first,
then amount + date proximity, then manual) and, on a confirmed match, post the settlement and mark the
invoice paid. The invoice → ledger loop (ADR 0043) already posts an AR voucher on issue (debit 1500
receivable gross / credit revenue + output VAT); a payment must clear that receivable. The open
questions: where payment posting happens, how confident matching is decided, and whether any of it is
an AI system under the EU AI Act.

## Decision
- **Payment posting happens at reconciliation, not at import.** Confirming a match posts a BALANCED
  `bank` settlement voucher — debit bank 1920 / credit receivable 1500 the document gross for an
  incoming customer payment (the inverse for outgoing) — via the existing posting path
  (`insertPostedVoucher`, now exported and widened to any `VoucherType`). The settlement touches no VAT
  account: VAT was settled on the AR voucher at issue, so a payment is a pure balance-sheet movement.
- **The matcher is pure and lives in `@saldo/domain`** (`reconciliation/match.ts`,
  `reconciliation/settlement.ts`) with exhaustive + fast-check property tests. Tiers: `kid-exact`
  (the invoice's mod-10-valid KID appears in the payment message and the amount equals the outstanding;
  a *unique* such hit can auto-apply) → `amount-date` (equal amount, booking date within a window of the
  due/issue date) → `amount` (equal amount only). KID validation reuses the committed `Kid` mod-10 check
  — not reinvented.
- **Deterministic, rules-based — NOT an AI system** (EU AI Act Recital 12), so no Art. 50 disclosure.
  The matcher proposes; the route action validates server-authoritatively; a human confirms each match
  (a §5.5 consequential act → explicit confirmation, ADR 0002).
- **Exact settlement only.** A match requires `amount == outstanding`; partial / over-payments are
  rejected (`amount-mismatch`) pending a residual model. `outstanding` is the invoice gross, sound only
  because an invoice is either fully open or `paid`.
- **The only mutation to an imported row is `matched_voucher_id` + `kid`** — exactly what the ADR 0047
  append-only trigger whitelists; every imported column stays frozen. No new table: the §5.5
  "reconciliation state" is derivable from `matched_voucher_id`.

## Consequences
- The invoicing → payment loop closes: a KID payment reconciles in one confirm, posts a balanced
  settlement, and flips the invoice to `paid`. Proven by a Testcontainers integrity test through the
  `saldo_app` role under FORCE-RLS (balanced legs, linked tx, invoice paid, atomic rejection of a
  non-equal amount, no double-post, booking-date-period fallback).
- Matching is legible and testable (pure domain, property-tested) and carries no AI-Act burden.
- **Known costs / deferred:** partial & over-payments (need a residual/outstanding model); outgoing
  supplier-payment reconciliation (no AP documents until `feat-supplier-invoices` — `deriveSettlement`
  already supports the inverse leg); mod-11 issuer-assigned KIDs (Saldo mints mod-10); an LLM-assisted
  suggestion for the long tail (would be propose-only with Art. 50 disclosure — not built).

## Alternatives considered
- **Post the settlement at import** — rejected: import is an append-only fact capture (ADR 0047);
  posting requires a matched invoice and a human confirm, which only exist at reconciliation.
- **A separate `reconciliation` table for matched/unmatched state** — rejected as speculative: the state
  is fully derivable from `bank_transaction.matched_voucher_id` (engineering-discipline: simplicity
  first). Revisit if a per-account/period running-balance view needs materialising.
- **Auto-post high-confidence matches without confirmation** (ADR 0002 grace-window) — deferred: money
  movement is a §5.5 act; per-row explicit confirm is the safe MVP. Bulk/passive confirm can layer on
  later without changing the matcher.
- **An LLM matcher** — rejected for the core: a deterministic rules matcher is preferable, avoids
  AI-Act obligations, and is exhaustively testable.
