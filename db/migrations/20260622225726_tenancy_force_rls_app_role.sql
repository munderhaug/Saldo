-- Tenancy hardening: close the RLS owner-bypass gap (ADR 0012, .claude/rules/ledger-integrity.md).
--
-- The core-ledger migration ENABLEd RLS but (a) Postgres exempts the table OWNER from RLS unless
-- FORCE is set, (b) the policies had USING but no WITH CHECK (so cross-tenant INSERT/UPDATE were not
-- constrained), and (c) `invoice_counter` had no RLS at all. At runtime the app must therefore
-- connect as a NON-OWNER role, and even the owner must be forced under RLS for defense-in-depth
-- (on managed Postgres such as Neon the connection role IS the owner but is not a superuser).
--
-- This migration:
--   1. creates a least-privilege, non-owner application role `saldo_app` (the app connects as it);
--   2. FORCEs RLS on every tenant table (the owner is now subject too — superusers still bypass,
--      which is why the seed/owner test harness keeps working on local/CI Postgres);
--   3. adds an explicit WITH CHECK to every policy so writes are constrained to the current org;
--   4. brings `invoice_counter` under the same RLS regime;
--   5. makes `allocate_invoice_number` SECURITY DEFINER so the app role can allocate without holding
--      direct DML on the gapless counter (the counter is mutated only via the sanctioned function).
--
-- Org-insert bootstrap: a new organization is created by the app generating the org id, running
-- `SET LOCAL app.current_org = <new id>` and then inserting that id — so `WITH CHECK (id = current_org)`
-- holds with no carve-out. The seed/owner path (migrations, tests) bypasses RLS as superuser instead.

-- migrate:up

-- ── 1. Non-owner application role ────────────────────────────────────────────
-- No password here (a secret; set per-environment via env). NOSUPERUSER + NOBYPASSRLS is what makes
-- RLS actually bite for the app. Idempotent so re-runs / shared clusters are safe.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'saldo_app') THEN
    CREATE ROLE saldo_app LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO saldo_app;

-- Least privilege: the app reads/writes business tables (RLS scopes them to the tenant; the
-- append-only / period-lock / balance triggers still enforce ledger integrity regardless of grants).
-- Organization is not DELETE-able by the app (system of record; org lifecycle is handled explicitly).
GRANT SELECT, INSERT, UPDATE                 ON organization  TO saldo_app;
GRANT SELECT, INSERT, UPDATE, DELETE         ON account       TO saldo_app;
GRANT SELECT, INSERT, UPDATE, DELETE         ON vat_code      TO saldo_app;
GRANT SELECT, INSERT, UPDATE, DELETE         ON fiscal_period TO saldo_app;
GRANT SELECT, INSERT, UPDATE, DELETE         ON voucher       TO saldo_app;
GRANT SELECT, INSERT, UPDATE, DELETE         ON posting       TO saldo_app;
-- The counter is read-only to the app; it is mutated only through allocate_invoice_number().
GRANT SELECT                                 ON invoice_counter TO saldo_app;

-- ── 2. FORCE RLS on every tenant table (owner included; superusers still bypass) ──
ALTER TABLE organization   FORCE ROW LEVEL SECURITY;
ALTER TABLE account        FORCE ROW LEVEL SECURITY;
ALTER TABLE vat_code       FORCE ROW LEVEL SECURITY;
ALTER TABLE fiscal_period  FORCE ROW LEVEL SECURITY;
ALTER TABLE voucher        FORCE ROW LEVEL SECURITY;
ALTER TABLE posting        FORCE ROW LEVEL SECURITY;

-- ── 3. Explicit WITH CHECK on the existing policies (was USING-only) ──────────
-- USING governs which rows are visible (SELECT/UPDATE/DELETE); WITH CHECK governs which rows may be
-- written (INSERT/UPDATE). Pin both to the current-org GUC so a tenant can neither read nor write
-- another tenant's rows.
ALTER POLICY org_isolation ON organization
  WITH CHECK (id = current_setting('app.current_org', true)::uuid);
ALTER POLICY org_isolation ON account
  WITH CHECK (organization_id = current_setting('app.current_org', true)::uuid);
ALTER POLICY org_isolation ON vat_code
  WITH CHECK (organization_id = current_setting('app.current_org', true)::uuid);
ALTER POLICY org_isolation ON fiscal_period
  WITH CHECK (organization_id = current_setting('app.current_org', true)::uuid);
ALTER POLICY org_isolation ON voucher
  WITH CHECK (organization_id = current_setting('app.current_org', true)::uuid);
ALTER POLICY org_isolation ON posting
  WITH CHECK (organization_id = current_setting('app.current_org', true)::uuid);

-- ── 4. Bring invoice_counter under RLS (it was missed in the core migration) ──
ALTER TABLE invoice_counter ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_counter FORCE  ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON invoice_counter
  USING      (organization_id = current_setting('app.current_org', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org', true)::uuid);

-- ── 5. allocate_invoice_number runs with definer rights ──────────────────────
-- SECURITY DEFINER lets the least-privileged app role allocate numbers (the function owns the write
-- to invoice_counter) without granting it direct DML on the counter. When the owner is NOT a
-- superuser (Neon), the function is still subject to invoice_counter's RLS, so an allocation for a
-- foreign org (org <> app.current_org) is rejected by WITH CHECK — tenant isolation holds even here.
-- search_path is pinned (SECURITY DEFINER hardening).
CREATE OR REPLACE FUNCTION allocate_invoice_number(org uuid) RETURNS bigint AS $$
DECLARE n bigint;
BEGIN
  INSERT INTO invoice_counter (organization_id, next) VALUES (org, 1)
    ON CONFLICT (organization_id) DO UPDATE SET next = invoice_counter.next + 1
    RETURNING next INTO n;
  RETURN n;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public;

-- Only the app role (and the owner) may call it.
REVOKE ALL ON FUNCTION allocate_invoice_number(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION allocate_invoice_number(uuid) TO saldo_app;

-- migrate:down

-- Restore the invoker-rights function and its default grant.
CREATE OR REPLACE FUNCTION allocate_invoice_number(org uuid) RETURNS bigint AS $$
DECLARE n bigint;
BEGIN
  INSERT INTO invoice_counter (organization_id, next) VALUES (org, 1)
    ON CONFLICT (organization_id) DO UPDATE SET next = invoice_counter.next + 1
    RETURNING next INTO n;
  RETURN n;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION allocate_invoice_number(uuid) TO PUBLIC;

-- invoice_counter back to no-RLS.
DROP POLICY IF EXISTS org_isolation ON invoice_counter;
ALTER TABLE invoice_counter NO FORCE ROW LEVEL SECURITY;
ALTER TABLE invoice_counter DISABLE ROW LEVEL SECURITY;

-- Drop the WITH CHECK by restoring the original USING-only policies.
DROP POLICY org_isolation ON organization;
CREATE POLICY org_isolation ON organization
  USING (id = current_setting('app.current_org', true)::uuid);
DROP POLICY org_isolation ON account;
CREATE POLICY org_isolation ON account
  USING (organization_id = current_setting('app.current_org', true)::uuid);
DROP POLICY org_isolation ON vat_code;
CREATE POLICY org_isolation ON vat_code
  USING (organization_id = current_setting('app.current_org', true)::uuid);
DROP POLICY org_isolation ON fiscal_period;
CREATE POLICY org_isolation ON fiscal_period
  USING (organization_id = current_setting('app.current_org', true)::uuid);
DROP POLICY org_isolation ON voucher;
CREATE POLICY org_isolation ON voucher
  USING (organization_id = current_setting('app.current_org', true)::uuid);
DROP POLICY org_isolation ON posting;
CREATE POLICY org_isolation ON posting
  USING (organization_id = current_setting('app.current_org', true)::uuid);

ALTER TABLE organization   NO FORCE ROW LEVEL SECURITY;
ALTER TABLE account        NO FORCE ROW LEVEL SECURITY;
ALTER TABLE vat_code       NO FORCE ROW LEVEL SECURITY;
ALTER TABLE fiscal_period  NO FORCE ROW LEVEL SECURITY;
ALTER TABLE voucher        NO FORCE ROW LEVEL SECURITY;
ALTER TABLE posting        NO FORCE ROW LEVEL SECURITY;

-- Remove the application role and every privilege granted to it (this database).
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'saldo_app') THEN
    EXECUTE 'DROP OWNED BY saldo_app';
    DROP ROLE saldo_app;
  END IF;
END
$$;
