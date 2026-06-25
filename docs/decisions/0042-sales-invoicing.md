# ADR 0042 — Sales invoicing: documents, gapless numbers, append-only issue

- **Status:** Accepted
- **Date:** 2026-06-25

## Context
Build-spec §8.4 is the core product surface: build sales documents — quotes → issued invoices →
credit notes — with per-line MVA across all rates and a lifecycle from draft to paid. It must honour
the hard invariants (`AGENTS.md`): money is integer øre; invoice numbers are gapless (per-org counter,
never a SEQUENCE — ADR 0007); an issued invoice is append-only (correct via kreditnota, never an edit);
the MVA-status fork drives posting and is server-authoritative AND enforced in SQL where it can be; RLS
tenancy with same-org composite FKs (the contacts/products precedent, ADRs 0040/0041). The catalogue
(0041) and contacts register (0040) are OPTIONAL defaults/templates layers — an invoice must still ship
with ad-hoc/free-text lines, so invoicing is NOT gated behind them. PDF/email and recurring/reminders
are split to their own tasks (`feat-invoice-pdf-email`, `feat-recurring-invoices-reminders`).

## Decision
- **Two tables, `invoice` + `invoice_line`, in one `kind` model** (`'quote' | 'invoice' | 'credit_note'`).
  A line carries `description`, an exact `quantity numeric(14,3)`, `unit`, net `unit_price_ore bigint`,
  a same-org `account_id` + `vat_code_id`, an optional catalogue `product_id`, and cached `net_ore` /
  `vat_ore`. The document caches `net/vat/gross_ore` and freezes a **customer snapshot**
  (name/e-mail/org-nr/address — personal data) independent of the contacts register.
- **One uniform lifecycle state machine** in `@saldo/domain` (`draft → issued → sent → viewed → paid`,
  with `overdue` reachable after issue and `paid` terminal). The `kind` only changes what *issuing*
  does in the data layer (an invoice/credit note draws a gapless number; a quote does not) and which
  moves the UI surfaces — not the shape of the machine. A quote becomes an invoice by copying its lines
  into a new draft, never by a status change.
- **Per-line MVA reuses the ledger's VAT engine.** `checkSalesLine` builds on the shared `checkVatLine`
  / `line-treatment` registration gate (output-VAT / fritatt require registration) and adds the one
  sales rule (an input-deductible code is a purchase code, blocked on a sale). VAT is `mulRate(net,
  rate)` charged ONLY on a permitted output-VAT line, so a blocked line yields no chargeable VAT. The
  HARD BLOCK is **server-authoritative**: the route action derives every line via the domain against the
  committed SAF-T code list (`STANDARD_TAX_CODE_INDEX`) and refuses to persist or issue a blocked line;
  the browser re-runs the same maths for instant feedback but decides nothing.
- **Gapless numbering via the per-org counter.** Issuing calls `allocate_invoice_number(org)`
  (`UPDATE … RETURNING`, SECURITY DEFINER, current-tenant-checked) inside the issuing transaction and
  mints a deterministic per-invoice **KID** (`invoiceKid` — zero-padded number + mod10 control digit).
  A rolled-back issue rolls the counter back with it, so no gap appears — proven by a Testcontainers
  test under concurrency AND rollback.
- **Append-only once issued, enforced in SQL.** A `BEFORE UPDATE OR DELETE` trigger on `invoice` blocks
  DELETE of an issued document and freezes every financial/identity column once `issued_at` is set —
  only the lifecycle `status` and its timestamps may still advance (a `ROW(...) IS DISTINCT FROM` guard
  over the frozen projection). A second trigger freezes the lines (no INSERT/UPDATE/DELETE once issued).
  Reverting to draft is impossible (the CHECK ties `status='draft'` to `issued_at IS NULL`, and
  `issued_at` is frozen). This mirrors the voucher/posting immutability triggers.
- **Tenancy + same-org integrity.** Both tables are `ENABLE` + `FORCE` RLS with a `USING`+`WITH CHECK`
  policy on `app.current_org` and a `saldo_app` grant. Every cross-table reference (customer → contact,
  line account/VAT code/product, credit note → credited invoice) is a same-org composite FK, so a
  reference can never cross tenants even though FK targets are not RLS-constrained.
- **Money/quantity stay exact.** Money is integer øre throughout; the one rounding boundary is
  `mulRate` (round half away from zero, once). A fractional quantity is the domain's `Rate` multiplier,
  stored as exact `numeric(14,3)`, so the line net is `mulRate(unitPrice, quantity)` with no float drift.

## Consequences
- The §8.4 core ships: list, draft editor with dynamic ad-hoc/catalogue-prefilled lines, issue,
  lifecycle transitions, and credit-note creation — with NO+EN microcopy, WCAG 2.2 AA, and the §5.5
  sober voice on the issue act. Domain logic is exhaustively + property-tested; the SQL guarantees have
  a Testcontainers integrity test (gaplessness under concurrency + rollback, immutability of the
  document and its lines, same-org FK rejection, RLS isolation).
- **Ledger posting is deferred.** Issuing does NOT yet post the AR voucher (debit receivable / credit
  revenue + output VAT) to the general ledger — that needs period resolution and broader posting wiring,
  and is logged as `feat-invoice-ledger-posting`. The invoice stores enough (per-line account + VAT
  code, customer link, totals) that posting is a mechanical follow-on. Until then a sales document is a
  document of record, not a ledger entry.
- The customer snapshot is duplicated personal data, frozen on issue and under the 5-year statutory
  retention — so a GDPR erasure against a `contact` must NOT reach issued-invoice snapshots (the
  retention exception in `.claude/rules/data-handling.md`). The eventual erasure/export paths
  (pre-existing backlog gaps) must treat `invoice`/`invoice_line` as in-scope-for-export but
  held-from-erasure.
- A credit-note draft copies the source invoice's stored lines/totals verbatim; if the org's MVA status
  changed since the original issue, `issueInvoice` re-derives and would block a now-illegal output-VAT
  line, so the document of record stays correct even if a draft preview is momentarily stale.

## Alternatives considered
- **A Postgres SEQUENCE for numbering.** Rejected by ADR 0007: sequences leave gaps on rollback. The
  per-org counter row in the issuing tx is the sanctioned mechanism; the rollback test proves no gap.
- **Fully immutable invoice row + a separate append-only status-event log.** Cleaner in theory, but the
  lifecycle (sent/viewed/paid) needs the current status on the row for listing/filtering, and a second
  table + projection is more machinery than this surface warrants. The column-guard trigger gives the
  same append-only guarantee for the financial identity while letting status advance.
- **Per-kind lifecycle state machines.** Rejected as needless branching; the uniform machine plus a
  `drawsInvoiceNumber(kind)` predicate captures the only real difference (numbering) without forking.
- **Storing quantity as integer milli-units.** Workable but awkward against the money lint (raw `* /`)
  and less legible than an exact `numeric` + the `Rate` multiplier flowing through `mulRate`.
- **Auto-posting the AR voucher on issue in this PR.** Deferred to keep the change surgical and the PR
  reviewable; posting pulls in period selection and the full posting path, which deserve their own task.
