# ADR 0034 — Manual voucher entry: an event-framed first posting surface, status-driven VAT, designated posting accounts

- **Status:** Accepted
- **Date:** 2026-06-24

## Context
After org onboarding (ADR 0032) and the honest-number reveal (ADR 0033), the org is live but the
**ledger is empty** — nothing posts vouchers yet, so the reveal shows the "you're caught up" zero
state instead of real figures. `feat-manual-voucher-entry` is the keystone that produces real ledger
data: the first surface that writes a posted voucher, sequenced ahead of sales-invoice issuance and
receipt extraction (both build on a working posting path).

The pure posting core already exists — `deriveSales` / `derivePurchase` (the status-branching
input-VAT fork) and the `runRules` gate (`vatLineRule`) — and the SQL integrity layer (balance,
posted-completeness, period-lock, RLS) is in place (ADRs 0003 / 0007 / 0018 / 0012). What was missing
is the **app slice** that turns a user's economic event into a balanced, posted voucher.

Three questions had to be settled for the first slice: (1) **what the user enters** — a full
double-entry, or an event; (2) **how VAT treatment is chosen** without putting SAF-T VAT-code jargon
on the everyday surface; (3) **which accounts** a derived voucher posts to, source-grounded rather
than from memory.

## Decision
**A minimal, event-framed posting surface: the user records *income* or an *expense* with a net
amount; the server derives, validates, and posts a balanced voucher. No schema change.**

- **Event, not double-entry.** The form asks the two everyday questions — *income or expense?* and
  *how much?* — never konto/debit/credit (experience-principles §4.2: accounting is an output, the
  everyday surface never shows the ledger). The amount is net kroner, parsed to integer **øre** by a
  new pure `parseKroner` (`@saldo/domain`, the integer-safe inverse of `formatKr`; assembled by
  string, never float — the money invariant, ADR 0004).
- **VAT treatment is derived from the org's `mva_status`, not entered.** Status drives all posting
  (hard invariant): `registered_standard` charges/deducts the standard 25 % rate (resolved from the
  *cited* rate table, `rateForCategory('regular')`, never a memorised literal); below the threshold /
  unntatt books gross with no VAT; `registered_zero_rated` charges no output VAT on a sale but still
  deducts input VAT on a purchase. So no SAF-T VAT-code jargon reaches the surface
  (experience-voice: no jargon the user didn't choose). The derivation stays the pure
  `deriveSales`/`derivePurchase`; the resolved code still passes the `runRules` line-VAT gate before
  anything touches the ledger (ADR 0002: derive proposes → rules validate → posted).
- **Designated posting accounts/codes, verified against the committed lists.** The bookkeeping
  plumbing the user never sees — receivable `1500`, payable `2400`, output-VAT `2700`, input-VAT
  `2710`, a default revenue `3000` and a default deductible-cost `7798` account, plus the domestic
  regular-rate SAF-T codes `3` (output) / `1` (input) — is designated by number/code in
  `db/posting.server.ts` and **verified to exist in the committed SAF-T kontoplan + tax-code lists**
  by a unit test (`posting-accounts.test.ts`). This is source-grounding, not memory: the same
  safeguard ADRs 0029/0032 use for rates and provisioning. Accounts/codes resolve to the org's own
  provisioned rows at post time.
- **§5.5 money-touching act → explicit, sober confirmation.** Posting is consequential and the ledger
  is append-only, so the surface drops all playfulness (plain heading, no display serif), states that
  the entry stands and is corrected with a *new* entry (never an edit), and submitting **is** the
  explicit active confirmation. Server-authoritative: a real `<Form>` that works without JS; RHF + the
  Zod resolver are inline-validation polish over the same `app/contracts` schema the action
  re-validates.
- **Inserted POSTED, in one tenant transaction.** `recordManualVoucher(tx, …)` runs inside
  `withUserOrg` (membership proven, RLS scoped), ensures a `fiscal_period` for the year, inserts the
  voucher (`posted_at` set) and its postings, and lets the **deferred** SQL triggers verify balance
  and posted-completeness at COMMIT. A manual voucher is **not** an issued sales invoice, so **no
  gapless `invoice_counter` is allocated** — that belongs to invoice issuance (ADR 0007).

## Consequences
- The reveal shows real numbers: posting a sale + a purchase makes `home.tsx` aggregate income /
  VAT-held / estimated-tax / spendable over a non-empty ledger. The empty state and the reveal both
  link to the new surface. This unblocks `feat-receipt-extraction` and sales-invoice issuance, which
  post against this path.
- **No schema change.** Every table/trigger already exists; this is an app-layer + a small pure
  domain addition (`parseKroner`). Integrity is proven by a Testcontainers test of the posting path
  through the non-owner `saldo_app` role under FORCE-RLS: a registered sale/purchase posts balanced,
  posted, correctly VAT-split and aggregates; an unregistered org books gross; a locked period blocks
  the post; the balance and posted-completeness triggers still reject the bad cases; one tenant's
  postings are invisible to another.
- **Accepted scope cuts (sequenced, not lost).** (1) Only the org's *standard* rate — reduced rates
  (15 %/12 %), zero-rated/reverse-charge codes, and a per-line VAT picker are deferred to the VAT
  tasks (`vat-mixed-activity`, `vat-reverse-charge`). (2) A single default revenue / cost account —
  choosing the income/expense *category* is `feat-account-chart-curation`. (3) One net line per
  voucher (no multi-line / split entries yet). (4) The counter side books to receivable/payable
  (open AR/AP), not bank settlement — a payment/settlement surface is later work. (5) Effective date
  = the current year's period; a per-entry date is deferred. Each cut keeps the slice minimal while
  exercising the full derive → validate → post path.

## Alternatives considered
- **A raw double-entry "manual bilag" (pick debit/credit accounts + amounts).** Rejected for the
  everyday surface — it puts konto/debit/credit in front of the user (against experience §4.2) and
  bypasses the `deriveSales`/`derivePurchase` fork the invariant routes posting through. A
  depth-on-demand accountant entry can come later, on top of the same `recordManualVoucher`.
- **A user-facing SAF-T VAT-code picker.** Rejected for now — the codes are jargon the user didn't
  choose, and the selectable set needs reverse-charge/import filtering the first slice doesn't handle.
  Deriving the standard treatment from status is correct for the common ENK and keeps the surface
  clean; a plain-language rate/treatment chooser is sequenced with the reduced-rate work.
- **Resolve "the" revenue/expense account by kontoklasse at post time.** Rejected — klasse 3 / 4–7
  each hold many accounts; picking one still needs a designation. An explicit, test-verified
  designation is clearer than an implicit "first klasse-3 row" and is equally source-grounded.
- **Insert a draft then post via the grace-window untap (ADR 0002).** Rejected here — passive
  confirmation is for high-confidence *AI-proposed* routine items; a human-entered money-touching act
  is the §5.5 case that wants explicit active confirmation, which submitting already is.
- **Allocate an invoice number for a manual sale.** Rejected — the gapless counter is for *issued
  invoices/credit notes* (ADR 0007). A manual income voucher is not an issued document; allocating a
  number would burn the gapless sequence and conflate posting with invoicing.
