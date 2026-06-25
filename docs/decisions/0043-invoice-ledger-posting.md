# ADR 0043 — Invoice → ledger posting: the AR voucher on issue

- **Status:** Accepted
- **Date:** 2026-06-25

## Context
ADR 0042 shipped sales documents but deliberately deferred the ledger leg: issuing an invoice produced
a document of record, not a ledger entry. Build-spec §8.4 closes the loop — when a sales invoice (or
credit note) is issued, its accounts-receivable voucher must post to the general ledger so the honest-
number reveal, the MVA-melding and SAF-T all see the sale. The invoice already stores everything the
posting needs (per-line `account_id` + `vat_code_id`, cached `net_ore`/`vat_ore`, the customer link,
document totals), so this is mostly wiring — but it must honour every hard invariant: money is integer
øre; the ledger is append-only; posting is server-authoritative AND enforced in SQL (balance, posted-
completeness, period-lock, immutability triggers — ADRs 0003/0018); the MVA-status fork drives the
legs; accounts/VAT codes come from the committed SAF-T lists, never memory.

## Decision
- **Derive the voucher in the pure domain, reusing `deriveSales`.** A new `deriveSalesInvoice`
  (`packages/domain/src/posting/sales-invoice.ts`) runs each revenue line through the existing single-
  line `deriveSales` (which owns the registration hard block) and **merges** the legs: every line's
  receivable debit folds into ONE gross debit, and the revenue / output-VAT credits are summed per
  account + VAT code. A sum of balanced vouchers is balanced, so the result balances by construction.
  The route never hand-rolls the debit/credit layout.
- **The voucher ties out to the frozen document.** The posting charges output VAT on EXACTLY the lines
  `computeLine` did — gated on the line's `checkSalesLine` treatment being `output-vat` — so the per-
  line VAT it posts is the same `mulRate(net, rate)` the document froze as `vat_ore`. A zero-rated,
  exempt or **reverse-charge** line (a non-blocking advisory that can carry a non-zero rate category)
  charged no VAT on the document and therefore posts at rate 0: no phantom VAT leg, receivable = net.
- **Source-grounded accounts.** The receivable (`1500`) and the per-rate output-VAT accounts
  (`2700`/`2701`/`2702`/`2703` for regular/middle/raw-fish/low) are designated in
  `SALES_INVOICE_ACCOUNTS` and verified to exist in the committed kontoplan with the right kontoklasse
  by `posting-accounts.test.ts`. Each line's revenue account is the line's own `account_id`.
- **Posted atomically in the issuing transaction.** `issueInvoice` posts the voucher in the SAME
  transaction that allocates the gapless number and freezes the document — so the number, the issued
  document and the balanced voucher commit together or not at all. The fiscal period is resolved from
  the **issue date's** year (`ensureFiscalPeriod`, shared with the manual-voucher path). On failure
  (a locked period, a missing designated account) the whole issue rolls back, leaving no number, no
  document mutation and no voucher — proven by a Testcontainers test.
- **A credit note posts the reversing motbilag.** `reverseVoucher` swaps every leg (credit receivable,
  debit revenue + output VAT) of the credit note's own derived voucher and records
  `reverses_voucher_id` → the original invoice's voucher for provenance. Correction stays append-only:
  the original voucher is never touched.
- **Traceability + idempotency in SQL.** A new nullable `voucher.invoice_id` (same-org composite FK to
  `invoice(id, organization_id)`) links each posted voucher to its document, with a partial
  `UNIQUE (invoice_id)` so a document is booked at most once. No new integrity triggers were needed —
  the existing voucher/posting guarantees already cover balance, completeness, period-lock and
  immutability.

## Consequences
- The invoicing → ledger loop is closed: issuing a sales invoice now posts a balanced AR voucher that
  the honest-number aggregation already sums (revenue net, output VAT on a liability account by SAF-T
  direction). The detail view shows a sober §5.5 confirmation ("Bokført i regnskapet") — the ledger
  legs themselves stay depth-on-demand (no konto/debit/credit on the everyday surface).
- New behaviour is covered: `deriveSalesInvoice`/`reverseVoucher` are exhaustively + property-tested
  (always balanced, receivable ties to gross, reversal preserves balance); a Testcontainers integrity
  test drives the real `createDraft → issueInvoice → createCreditNoteDraft` path through the `saldo_app`
  role under RLS and proves the voucher balances, lands in the correct UNLOCKED period, ties out to the
  document, posts no phantom VAT on a reverse-charge line, reverses correctly for a credit note, and
  rolls back wholesale on a locked period.
- **Reverse-charge remains single-leg (seller side).** A reverse-charge sale posts revenue at net with
  no VAT leg, which is correct for the seller; the dual-leg (buyer self-accounts) derivation is still
  deferred (build-spec §4.3, `.claude/rules/vat.md`, `feat-vat-reverse-charge`). The voucher mirrors
  the document exactly, so nothing is mis-stated — the buyer-side leg simply isn't posted yet.
- **Known narrow limitation: MVA-status drift on a credit note.** The credit-note voucher re-derives
  from the credit note's own lines at the *current* status (so it ties out to the credit-note document
  and respects any edits). If the org's MVA status changed between issuing an invoice and crediting it,
  the motbilag reflects the new status rather than blindly mirroring the original voucher. Issuance re-
  validates every line, blocking a now-illegal output-VAT line, so the ledger never goes unbalanced;
  the residual edge is documented and revisited when the credit-note recompute / reverse-charge work
  lands.
- PDF/email (`feat-invoice-pdf-email`, blocked on the transactional-email-provider decision) and
  recurring/reminders are unchanged and still split out.

## Alternatives considered
- **Building the voucher from the stored `net_ore`/`vat_ore` directly (no `deriveSales`).** Ties out by
  construction even under status drift, but hand-rolls the leg layout the task asked to keep in the
  domain. Rejected in favour of reusing `deriveSales` and reproducing the stored amounts via the same
  treatment gate `computeLine` uses — which ties out for every freshly-issued document and isolates the
  status-drift edge to credit notes (documented above).
- **Re-deriving the rate from the SAF-T `rateCategory` unconditionally.** Simpler, but it would post a
  25 % VAT leg on a reverse-charge line that the document charged nothing for — breaking both the tie-
  out and the "reverse charge must not silently become an ordinary output leg" rule. Rejected; the
  posting now mirrors `computeLine`'s `output-vat` gate exactly.
- **Posting in a separate transaction (or a background job) after issue.** Rejected: it opens a window
  where an issued, numbered invoice has no ledger entry. Atomic posting in the issuing tx is the only
  way to keep the document and its voucher consistent and leverage the deferred balance/completeness
  triggers at one COMMIT.
- **A new `posting`-side trigger to enforce "issued invoice ⇒ voucher exists".** Considered, but the
  one-way draft→issued transition plus the partial `UNIQUE (invoice_id)` and atomic posting already
  guarantee it; an extra trigger would be machinery without a gap to close.
- **`invoice.voucher_id` instead of `voucher.invoice_id`.** Rejected: the voucher is the dependent,
  append-only record and already carries `reverses_voucher_id`; pointing it at the invoice mirrors that
  and keeps the immutable document free of a back-reference written after it froze.
```
