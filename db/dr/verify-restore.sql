-- verify-restore.sql — post-restore integrity assertion for the Saldo ledger.
--
-- Run this against ANY restored database — a Neon point-in-time restore branch (ADR 0013) OR a
-- pg_restore target (the local drill, tools/restore-drill.sh) — to confirm the integrity layer and
-- the ledger data survived the restore intact. "A restore you have never tested is not a backup":
-- this is the test (DR runbook: docs/runbooks/disaster-recovery.md).
--
-- It is READ-ONLY (safe to run on a restored production branch) and self-contained: it raises an
-- exception listing every failure, so `psql -v ON_ERROR_STOP=1 -f db/dr/verify-restore.sql` exits
-- non-zero iff the restore is unhealthy. Pass with `-v expect_data=1` to also require the ledger to
-- be non-empty (a real restore should carry data; the structural checks alone pass on an empty DB).
--
-- The tenant-table set is DERIVED from the catalog at run time (every FORCE-RLS table), so it can never
-- drift behind a migration that adds one. The trigger list stays explicit (pg_trigger has no "integrity
-- invariant" flag) but is kept honest by the restore-verify integration test, which proves the verifier
-- BITES when any listed trigger is missing.

\set ON_ERROR_STOP on
\if :{?expect_data}
\else
  \set expect_data 0
\endif
-- psql does NOT interpolate :vars inside dollar-quoted blocks, so bridge the flag through a GUC.
SET drill.expect_data TO :'expect_data';

DO $$
DECLARE
  fail text[] := '{}';
  -- Tenant tables (FORCE ROW LEVEL SECURITY + org-isolation policy, ADR 0012) are DERIVED from the
  -- catalog below — the structural definition of "tenant table" is exactly "FORCE RLS is on", so this
  -- set cannot drift behind a migration that adds one (the previous hand-typed list silently skipped 7).
  tenant_tables text[];
  -- Auth/system tables are deliberately NOT org-RLS'd (ADR 0020 — looked up before any tenant context),
  -- so they cannot be derived from the RLS predicate; they stay an explicit allowlist.
  auth_tables text[] := ARRAY['app_user','membership','user_session'];
  -- Every table the application depends on = the derived tenant set ∪ the auth allowlist.
  required_tables text[];
  -- The integrity triggers that enforce the hard invariants in SQL (append-only ledger, balance,
  -- posted-completeness, period locks). pg_trigger carries no "is an integrity invariant" flag, so this
  -- stays explicit — kept honest by the restore-verify integration test (it BITES on a missing one).
  required_triggers text[] := ARRAY[
    'posting_balance','posting_immutable','posting_period_lock',
    'voucher_immutable','voucher_period_lock','voucher_posted_complete',
    'invoice_immutable','invoice_line_immutable','bank_transaction_append_only'
  ];
  required_extensions text[] := ARRAY['pgcrypto','btree_gist'];
  t text;
  imbalanced int;
  bad_counter int;
  voucher_count bigint;
BEGIN
  -- 0. Derive the tenant set from the catalog: every base table with FORCE ROW LEVEL SECURITY (the
  --    same predicate the rls-coverage suite uses). This is what makes checks 1 and 4 cover ALL tenant
  --    tables automatically, instead of a hand-typed list that drifts.
  SELECT array_agg(c.relname ORDER BY c.relname) INTO tenant_tables
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND c.relrowsecurity AND c.relforcerowsecurity;
  -- A restore that silently lost RLS entirely would yield an empty set — flag it rather than pass a
  -- vacuous loop in check 4.
  IF tenant_tables IS NULL OR array_length(tenant_tables, 1) IS NULL THEN
    fail := fail || 'no FORCE-RLS tenant tables found (RLS lost in the restore?)'::text;
    tenant_tables := '{}';
  END IF;
  required_tables := tenant_tables || auth_tables;

  -- 1. Tables present.
  FOREACH t IN ARRAY required_tables LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      fail := fail || ('missing table: ' || t);
    END IF;
  END LOOP;

  -- 2. Required extensions present (the integrity layer uses pgcrypto + btree_gist).
  FOREACH t IN ARRAY required_extensions LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = t) THEN
      fail := fail || ('missing extension: ' || t);
    END IF;
  END LOOP;

  -- 3. Integrity triggers present (append-only + balance + period-lock + posted-complete).
  FOREACH t IN ARRAY required_triggers LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = t AND NOT tgisinternal) THEN
      fail := fail || ('missing trigger: ' || t);
    END IF;
  END LOOP;

  -- 4. FORCE RLS + an org-isolation policy on every tenant table (ADR 0012). Owner BYPASSES RLS, so
  --    this is a structural check; the behavioural cross-tenant proof is the rls-tenancy suite,
  --    pointed at the restored DB (see the runbook).
  FOREACH t IN ARRAY tenant_tables LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;  -- already reported as a missing table in check 1
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_class WHERE oid = to_regclass('public.' || t)
        AND relrowsecurity AND relforcerowsecurity
    ) THEN
      fail := fail || ('FORCE RLS not set on: ' || t);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t) THEN
      fail := fail || ('no RLS policy on: ' || t);
    END IF;
  END LOOP;

  -- 5. The gapless invoice counter is a per-org ROW + SECURITY DEFINER function, NEVER a SEQUENCE
  --    (a sequence leaks gaps on rollback — the hard invariant). Assert both halves survived.
  IF to_regprocedure('public.allocate_invoice_number(uuid)') IS NULL THEN
    fail := fail || 'missing function: allocate_invoice_number(uuid)'::text;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.sequences
    WHERE sequence_schema = 'public' AND sequence_name ILIKE '%invoice%'
  ) THEN
    fail := fail || 'unexpected invoice SEQUENCE present (must be a counter row, not a sequence)'::text;
  END IF;

  -- 6. The non-owner application role exists (the app connects as it so RLS applies, ADR 0012).
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'saldo_app') THEN
    fail := fail || 'missing role: saldo_app'::text;
  END IF;

  -- 7. Ledger-data integrity sweep (real data — works on a restored production branch too).
  --    Every POSTED voucher must balance: sum(debit_ore) = sum(credit_ore) over its postings.
  IF to_regclass('public.posting') IS NOT NULL AND to_regclass('public.voucher') IS NOT NULL THEN
    SELECT count(*) INTO imbalanced FROM (
      SELECT v.id
      FROM voucher v
      JOIN posting p ON p.voucher_id = v.id
      WHERE v.posted_at IS NOT NULL
      GROUP BY v.id
      HAVING coalesce(sum(p.debit_ore), 0) <> coalesce(sum(p.credit_ore), 0)
    ) q;
    IF imbalanced > 0 THEN
      fail := fail || (imbalanced || ' posted voucher(s) do not balance after restore');
    END IF;

    -- The counter must never be behind reality: next ≥ 1 for every org row, AND ≥ the highest
    -- invoice number actually issued for that org — a restore that lost the counter row (or an
    -- older snapshot of it) would otherwise re-allocate an already-used number on the next issue
    -- (review 2026-07-03 §11).
    SELECT count(*) INTO bad_counter FROM invoice_counter WHERE next < 1;
    IF bad_counter > 0 THEN
      fail := fail || (bad_counter || ' invoice_counter row(s) with next < 1');
    END IF;
    SELECT count(*) INTO bad_counter FROM (
      SELECT m.organization_id
      FROM (
        SELECT organization_id, max(invoice_number) AS max_no
        FROM invoice
        WHERE invoice_number IS NOT NULL
        GROUP BY organization_id
      ) m
      LEFT JOIN invoice_counter c ON c.organization_id = m.organization_id
      WHERE coalesce(c.next, 0) < m.max_no
    ) behind;
    IF bad_counter > 0 THEN
      fail := fail || (bad_counter || ' org(s) whose invoice_counter is BEHIND max(invoice_number) — the next issue would reuse a number');
    END IF;

    -- 8. Optional: a real restore should carry data. Opt in with -v expect_data=1.
    IF current_setting('drill.expect_data', true) = '1' THEN
      SELECT count(*) INTO voucher_count FROM voucher;
      IF voucher_count = 0 THEN
        fail := fail || 'expect_data=1 but the restored ledger has zero vouchers'::text;
      END IF;
    END IF;
  END IF;

  IF array_length(fail, 1) IS NULL THEN
    RAISE NOTICE 'verify-restore: OK — integrity layer + ledger data intact.';
  ELSE
    RAISE EXCEPTION E'verify-restore: % failure(s):\n  - %',
      array_length(fail, 1), array_to_string(fail, E'\n  - ');
  END IF;
END $$;
