# ADR 0012 — Tenant isolation: FORCE RLS + a non-owner application role

- **Status:** Accepted
- **Date:** 2026-06-22

## Context
Tenancy is enforced primarily at the app layer (every query filtered by `organization_id`) with
Postgres RLS as defense-in-depth, keyed on the `app.current_org` GUC set per request (ADR 0003). The core-ledger migration `ENABLE`d RLS and added `USING` policies — but that does **not**
actually isolate tenants at runtime:

- Postgres **exempts the table owner** from RLS unless `FORCE ROW LEVEL SECURITY` is set. If the app
  connects as the role that owns the schema (the common case, and on managed Postgres such as Neon
  the connection role *is* the database owner), RLS never applies.
- The policies had **`USING` but no `WITH CHECK`**, so a cross-tenant `INSERT`/`UPDATE` was not
  constrained even when reads were.
- `invoice_counter` had **no RLS at all**.

This was the highest-priority Phase-0 correctness gap: tenant isolation existed on paper but did not
bite.

## Decision
Harden tenancy in SQL (migration `20260622225726_tenancy_force_rls_app_role`):

1. **A non-owner application role `saldo_app`** (`NOSUPERUSER NOBYPASSRLS`) that the app connects as.
   Because it neither owns the tables nor bypasses RLS, policies always apply to it. It receives only
   least-privilege DML (no `DELETE` on `organization`; the counter is read-only — see below).
2. **`FORCE ROW LEVEL SECURITY`** on every tenant table, so even the owner is subject (superusers
   still bypass — that is what keeps the superuser-owned test/seed harness working). This is what
   protects the Neon case, where the connection role owns the tables but is not a superuser.
3. **Explicit `WITH CHECK`** on every policy (pinned to `app.current_org`), so writes are constrained
   to the current tenant, not just reads.
4. **`invoice_counter` brought under the same RLS regime** (it was missed originally).
5. **`allocate_invoice_number` made `SECURITY DEFINER`** (search_path pinned) so the least-privileged
   app role can allocate numbers without holding direct DML on the gapless counter. It also guards its
   argument against the GUC — when `app.current_org` is set (the app path), `org` must equal it — so a
   cross-tenant allocation is rejected on **every** topology, not only where the owner is non-superuser
   (there the counter's `WITH CHECK` catches it too). The seed/owner path leaves the GUC unset.

**Org-insert bootstrap.** A new organization is created by the app generating the org id, running
`SET LOCAL app.current_org = <new id>`, then inserting that id — so `WITH CHECK (id = current_org)`
holds with no carve-out. The seed/admin path (tests, migrations) bypasses RLS as a superuser instead;
on Neon, production has no superuser, but it also never bulk-seeds tenant data outside this app path.

**Connection roles.** Migrations/admin run as the owner; the **app runs as `saldo_app`**. The role is
created without a password (a secret); the login secret is provisioned per environment via env.

## Consequences
- Tenant isolation is now enforced at runtime, proven by a 5th Testcontainers guarantee (an org sees
  and writes only its own rows; cross-tenant read/write/bypass all blocked) and reproduced against a
  non-superuser-owner database that mirrors Neon's role model.
- Production deployment must connect the app as `saldo_app` and provision its secret; a misconfigured
  owner-connection no longer silently disables isolation (FORCE covers it).
- Every **new tenant-scoped table** must, in the same migration, enable+force RLS, add a
  `USING`+`WITH CHECK` policy, and grant `saldo_app` (captured in `.claude/rules/ledger-integrity.md`).
- **Grant model (deliberate):** policies are `TO public` (not `TO saldo_app`) so they bite for *any*
  non-superuser role, not just the app role — defense-in-depth. `saldo_app` holds `DELETE` on `voucher`
  /`posting`, which is safe: the immutability triggers block deleting *posted* rows for all roles, so
  only unposted drafts are deletable (the legitimate erasure surface). Column-level write control on
  `organization` (`org_nr`, `mva_status` are tenant-mutable today) is deferred to the org-settings
  feature (Phase 1), where those changes get their own validation/audit.
- Real-Neon validation was done via a local non-superuser-owner reproduction because this build
  environment's network egress allowlist blocks Neon's hosts; the Testcontainers test is the CI gate.

## Alternatives considered
- **Rely on app-layer filtering only** — rejected: not a guarantee (ADR 0003); a missing `WHERE`
  leaks across tenants.
- **App connects as the owner with FORCE RLS only (no separate role)** — weaker: the owner can still
  `DISABLE`/`NO FORCE` RLS or drop policies, so a SQL-injection with DDL reach could undo isolation.
  A non-owner role cannot.
- **Permissive `WITH CHECK (true)` INSERT policy on `organization`** for bootstrap — rejected: lets
  the app insert arbitrary org rows. The generate-id-then-set-GUC pattern needs no carve-out.
