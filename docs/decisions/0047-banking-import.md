# ADR 0047 — Banking import: GoCardless AIS + self-built camt.054 + CSV, behind one interface

- **Status:** Accepted
- **Date:** 2026-06-26

## Context
The ledger can issue and post sales invoices (ADR 0042/0043) and deliver them (ADR 0046), but nothing
yet brings **bank transactions** into the system. Build-spec §8.7 + §9 + §16 Phase 5 need the import +
persistence layer that becomes the **reconciliation substrate**: pull transactions for one or more bank
accounts from three sources — **GoCardless Bank Account Data** (PSD2/AIS, free tier), **camt.054** XML
files (ISO 20022), and **CSV** — behind one provider-agnostic interface, and store them as facts ready
for matching. KID/amount/date auto-matching + the reconciliation workflow is the **downstream** task,
not this one.

Constraints that shape this: money is integer **øre** (transactions arrive as decimal strings — never a
float); GoCardless rate-limits as low as **~4 calls/day/account per scope**, so the client must cache +
batch and never poll; bank transactions are **personal + financial data** that must stay **EU-resident**
and never be logged; external field models (GoCardless JSON, the camt.054 schema) must come from a
**committed, cited source**, not memory; the durable jobs surface for long/retryable AIS fetches **is
not built yet** (same situation ADR 0046's inline send faced).

## Decision
1. **Source-grounded first.** The GoCardless API contract and the camt.054 field model are captured
   under `db/reference/banking/` (cited + dated), exactly like the SAF-T/PEPPOL captures. The parser and
   client map ONLY the fields recorded there. The rate-limit caution is baked into the capture + code.
2. **Pure normalisation in the domain.** `@saldo/domain/banking` converts a transaction from any source
   to one typed `NormalisedBankTx` with a **signed amount in øre** (positive = into the account). The
   two sources differ only in sign carriage: camt amounts are unsigned with a `CdtDbtInd`, GoCardless
   carries the sign in the string. Amounts are assembled by string, never float; sub-øre precision is
   rejected, not rounded. CSV parsing (RFC-4180 tokeniser + Norwegian-locale amount handling + header
   inference) is pure and property-tested too. The domain stays dependency-free.
3. **Self-built camt.054 parser at the app boundary.** `integrations/banking/camt054.server.ts` uses the
   already-present `fast-xml-parser` for structural XML→fields (namespace-agnostic, versions
   …001.02–…001.08), then delegates all money to the domain normaliser. A self-built parser over a heavy
   dependency, scoped to a documented subset (BOOKED entries, one transaction per `Ntry`).
4. **GoCardless client, fail-closed.** `integrations/banking/` holds the config + client. The live AIS
   client is enabled ONLY when the operator asserts EU residency (`BANKING_EU_RESIDENT=true`) AND the
   secrets are set (server env only, `env.ts` Zod contract, never logged) — otherwise it is OFF and
   file import still works. Every payload is **Zod-validated** at the boundary; results are typed, never
   thrown; account numbers/balances/transactions are **never logged** (only counts + an error class). A
   fetch is **one batch** (one token call + one transactions call); a 429 surfaces as `rate-limited`.
5. **Append-only persistence with idempotent import.** Two tenant-scoped tables (`bank_account`,
   `bank_transaction`) via a SQL migration: FORCE RLS + USING/WITH CHECK on `app.current_org` + a
   `saldo_app` grant; a same-org composite FK pins a transaction to its account's org; a per-account
   **UNIQUE (external_ref)** + `ON CONFLICT DO NOTHING` makes re-import idempotent (the dedup key is the
   source id, or a content fingerprint when none). A trigger makes imported facts **append-only** —
   DELETE blocked, every imported column immutable — while leaving the reconciliation columns
   (`kid`, `matched_voucher_id`) writable for the downstream task. **No posting happens here.** A
   Testcontainers integrity test proves RLS isolation, the same-org FK, append-only, and idempotency.
6. **Inline-with-idempotency interim for the AIS fetch.** Per the §16 note and mirroring ADR 0046's
   inline send, the GoCardless fetch runs **inline in the route action** (network I/O outside the DB
   transaction), NOT in a graphile-worker job — the jobs surface is not built. This is safe because the
   import is idempotent: a crash or a 429 mid-fetch re-runs cleanly with no duplicates and no wasted
   quota. Moving it to a worker job is deferred to when the jobs runner lands.

## Consequences
- An org can add bank accounts and import transactions from a camt.054 file, a CSV, or (when configured)
  a live GoCardless fetch — all converging on the same append-only `bank_transaction` facts, ready for
  the reconciliation task. The signed-øre rule keeps every imported amount exact and float-free.
- **Go-live steps (not exercised locally):** a GoCardless Bank Account Data account + the
  secret_id/secret_key in the deploy env + `BANKING_EU_RESIDENT=true`; the PSD2 **consent/link flow**
  (institutions → end-user agreement → requisition → account ids) is out of scope here — this feature
  consumes an already-linked account's transactions.
- **Retention / lawful basis (GDPR).** A `bank_transaction` is an imported accounting fact and is made
  permanently undeletable by the append-only trigger — including an as-yet-**unmatched** line that
  carries a counterparty name. The lawful basis is the **bookkeeping legal obligation**
  (bokføringsloven; `.claude/rules/data-handling.md` §Retention): imported bank data is source
  documentation for the ledger, retained for the statutory window, so erasure of an unmatched line is
  intentionally **not** offered. A GDPR erasure path therefore never deletes these rows; minimisation is
  handled by never importing/persisting more than the documented fields and never logging them.
- **Known limitations (deferred):** the AIS fetch is inline (at-most-once is a non-issue thanks to
  idempotency, but a worker job is the eventual home); a batch `Ntry` bundling many `TxDtls` collapses
  to the entry total (split is a reconciliation-era refinement); pending GoCardless/camt entries are
  skipped (only booked are facts); CSV column inference covers common Norwegian/English headers, with an
  explicit column map as the fallback path; **KID parsing + voucher matching + the reconciliation
  workflow are the downstream task** (this stores a nullable `kid`/`matched_voucher_id` only).

## Alternatives considered
- **A heavy camt.054 / ISO 20022 parsing library.** Rejected: the task calls for a self-built parser
  over a heavy dep, and the subset we need (entry amount + direction + dates + remittance + parties) is
  small; `fast-xml-parser` (already a dependency) covers the structural step, money stays in the domain.
- **Posting bank transactions to the ledger on import.** Rejected: a bank line is not a voucher — it is
  an imported fact to be reconciled against existing/created vouchers. Posting on import would double-book
  and pre-empt the reconciliation design. Bank transactions are append-only facts, not ledger entries.
- **A mechanical EU-host allow-list for GoCardless.** Rejected as the primary guard (same reasoning as
  ADR 0045's email gate): the honest gate is an explicit EU-residency assertion + the provider being a
  known EU service, paired with TLS; secrets never leave the server env.
- **Blocking the feature until the graphile-worker jobs surface exists.** Rejected: it would stall the
  reconciliation track. The inline-with-idempotency interim is safe and is the documented precedent
  (ADR 0046).
