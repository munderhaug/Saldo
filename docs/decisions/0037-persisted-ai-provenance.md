# ADR 0037 — Persisted AI provenance (durable Art. 50(2) audit trail)

- **Status:** Accepted
- **Date:** 2026-06-25

## Context
EU AI Act **Art. 50(2)** requires AI-generated output to carry machine-readable provenance. Two earlier
ADRs cover the *code-level* and *UI* halves: the proposal's provenance is a required Zod field
(`aiProvenance`, literal `aiAssisted: true` + model/version/confidence — ADR 0035), and the first-
interaction disclosure generalises through the shared `<AiAssisted>` primitive (ADR 0036).

What was still missing is the **durable** half. The receipt confirm action posted a confirmed AI proposal
through `recordManualVoucher` and then **discarded** the provenance. So after the fact there was no
queryable way to answer "did this posted voucher come from an AI proposal, and from which model?" — the
record Art. 50(2) is about. This task (`aia-provenance-logging`) pairs with the pino observability
baseline (ADR 0021).

The standing invariant holds: **AI never writes the ledger** (ADR 0002). Provenance must be recorded
*alongside* the human-confirmed post, not as an AI write. And privacy is a hard constraint
(`.claude/rules/data-handling.md`): the record must never carry the supplier name (personal — may be a
natural person's name for an ENK), the amounts (PII), or the image.

## Decision
Persist provenance in a dedicated **`ai_provenance` table**, FK'd 1:1 to the voucher, **and** emit a
structured pino log line — both carrying **model · modelVersion · confidence + the voucher linkage only**.

- **Table** (`db/migrations/*_ai_provenance.sql`): `organization_id`, `voucher_id` (UNIQUE, 1:1), `model`,
  `model_version`, `confidence numeric(4,3)` (CHECK 0..1), `created_at`. A composite FK
  `(voucher_id, organization_id) → voucher(id, organization_id)` makes a cross-tenant link impossible at
  the storage layer (mirroring `voucher_period_same_org`, ADR 0018). FORCE RLS + a USING/WITH CHECK
  `org_isolation` policy (ADR 0012). The `saldo_app` grant is **SELECT + INSERT only** — no UPDATE/DELETE,
  so the audit trail is append-only/immutable at the privilege level, matching the immutable voucher it
  annotates (no extra trigger needed).
- **Write path:** the confirm action (AI-only) re-validates the provenance carried through the review
  round-trip as hidden fields (`receiptConfirmInput`), then posts **and** inserts the provenance in the
  **same tenant transaction**, so the voucher and its provenance commit atomically.
- **Log:** `aiProvenanceLogFields` is the single definition of the loggable shape; a unit test asserts it
  contains no personal/financial field.

## Consequences
- A queryable, durable, tenant-isolated answer to "which posted vouchers are AI-assisted, from which
  model" — the Art. 50(2) record survives log rotation and joins to the system of record.
- One confirmed AI post ⇒ exactly one provenance row, written atomically with the post; a plain manual
  post writes none. Proven by a Testcontainers integrity test (FK 1:1, RLS isolation, append-only grant,
  manual-post-writes-none, minimal columns) + a redaction/no-leak unit test.
- **Known cost — trust boundary:** provenance rides the confirm form as hidden fields. They are populated
  by us from the extraction and re-validated, but a user could tamper with their *own* books' provenance.
  Accepted: the data is private to the user's own ledger, the worst case is a mislabelled AI tag on one's
  own voucher (no cross-tenant or integrity impact), and the confidence is self-reported by the model
  anyway. Not worth a server-side staging table for this slice.
- A new tenant table is now on the RLS-coverage allowlist; future AI surfaces reuse `recordAiProvenance`.

## Alternatives considered
- **Structured logging only (no table).** Simpler — no migration. Rejected: logs rotate/expire and are
  not joinable to the voucher, so they can't durably answer the Art. 50(2) query against the system of
  record. We keep the log line *in addition* as the observability signal, but the table is the record.
- **Fold provenance onto the `voucher` row** (provenance columns directly on `voucher`). Rejected: it
  bloats the integrity-critical ledger table with optional AI metadata and couples the immutability story
  to non-ledger fields; a side table FK'd 1:1 keeps the ledger clean and the audit concern separable.
- **A staging table written by the extract step, promoted at confirm.** Rejected as over-built for this
  slice — the hidden-field round-trip with re-validation is sufficient given the private-books trust model.
