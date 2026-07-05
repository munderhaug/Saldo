# ADR 0062 — Audit trail (sporbarhet) + full data export

- **Status:** Accepted
- **Date:** 2026-07-05

## Context
Build-spec §8.11/§11 require an **immutable audit trail** and a **full data export**. The
bokføringsforskrift's sporbarhet expectation — and the security audit's non-repudiation gap — is that
every consequential write is attributable to the authenticated person who performed it. Until now the
actor was proven at the request boundary (`requireOrgAccess` → `withUserOrg`) and then discarded: no
durable record answered "who posted this voucher / issued this invoice / changed this contact?".
Separately, the anti-lock-in half (GDPR Art. 20) had only the standardised SAF-T file — no raw,
complete machine-readable copy of the org's data.

Two capture designs were on the table: database triggers on every business table (needs a new
`app.current_user` GUC threaded through `withOrgTx`, and cannot distinguish "invoice issued" from
"draft edited" — row changes are not business acts), or explicit event writes in the same tenant
transaction, the pattern ai_provenance already set (ADR 0037).

## Decision
An **append-only `audit_log` table** written by an explicit, typed helper in the same tenant
transaction as the write it attests to — plus a **full raw JSON export** beside the SAF-T export.

- **Table** (`db/migrations/*_audit_log.sql`): `organization_id`, `actor_user_id → app_user`,
  `action` (CHECK `'^[a-z_]+\.[a-z_]+$'`), `entity_table` (CHECK format), `entity_id`, `created_at`.
  FORCE RLS + the `org_isolation` USING/WITH CHECK policy (ADR 0012); the `saldo_app` grant is
  **SELECT + INSERT only** — append-only at the privilege level, like ai_provenance (ADR 0037).
  Data minimisation: actor · action · entity linkage ONLY — the audited values stay in the entity
  rows, joinable, never duplicated.
- **Helper** (`app/db/audit.server.ts`): `recordAuditEvent(tx, …)` with a **closed TS union** of
  actions (`voucher.posted`, `invoice.issued/sent/paid`, `supplier_invoice.posted`,
  `bank_transaction.reconciled`, `contact/product.created/updated`, `organization.created/updated`);
  the entity table is derived from the action prefix so linkage can't drift. Called from every
  consequential route action inside its `withUserOrg` callback — the actor comes from the
  authenticated session context, never from client input. **Drafts are not audited**: a mutable draft
  is not part of the books; the consequential act is the post/issue/send that freezes it.
- **Export**: `readFullExport` (`app/db/export.server.ts`) reads every business table under the
  caller's RLS transaction; the `/orgs/:orgId/export.json` resource route streams it as one
  versioned JSON document (`private, no-store`), linked from the SAF-T page. The auth tables are
  deliberately absent (account plumbing, not the org's books): this route is the ORG's Art. 20 path —
  the data subject's own account data (their email) is a separate, user-scoped portability concern,
  and audit actors export as bare UUIDs by design; an org-scoped member id→email map can join a
  future `version` if a consumer needs to name actors. Deterministic — NOT an AI system
  (Recital 12).

## Consequences
- Non-repudiation: "who did what, when, to which row" is a queryable join against the system of
  record, tenant-isolated and immutable to the app role. Proven by a Testcontainers integrity test
  (atomic same-tx attribution, closed action format in SQL, RLS isolation, no UPDATE/DELETE grant,
  RLS-scoped export) — and the migration CI gate now binds every future schema change to such a test.
- The export gives a complete, machine-readable copy of the org's books at any moment — the GDPR
  Art. 20 / anti-lock-in guarantee beside SAF-T.
- **Known cost — coverage is by convention, not mechanism:** a future consequential action must
  remember its `recordAuditEvent` call (the ai_provenance precedent accepted the same). The closed
  union keeps the taxonomy honest, and review + the route-test conventions are the guard; a
  trigger-based net stays available as a follow-on if drift is ever observed.
- A future viewing surface ("hendelseslogg") can read the table as-is; the export already carries it.
- `audit_log` joins the RLS-coverage allowlist as a tenant table.

## Alternatives considered
- **Generic DB triggers on all business tables + an `app.current_user` GUC.** Mechanically complete
  (nothing can forget to log), but row-level changes are not business acts: an UPDATE cannot say
  "issued" vs "draft edit", provisioning writes 700+ meaningless rows per org, and every mutation
  path pays a trigger. Rejected for this slice; revisit only if call-site drift is observed.
- **Actor column on the business rows** (`created_by` on voucher/invoice/…). Spreads identity over
  every table, needs a migration per table, and still can't express acts that aren't inserts
  (send, reconcile, transition). A side log keeps the concern separable — the ADR 0037 shape.
- **CSV/ZIP-of-tables export.** More familiar to spreadsheets but loses types and relations; one
  versioned JSON document is the faithful, machine-readable copy. SAF-T remains the standardised
  interchange; CSV views can be derived later if asked for.
