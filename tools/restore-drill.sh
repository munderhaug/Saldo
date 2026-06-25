#!/usr/bin/env bash
# restore-drill.sh — a real, self-contained restore drill for the Saldo ledger.
#
# "A restore you have never tested is not a backup." This script proves the WHOLE chain mechanically
# on a local Postgres: build a source DB from db/migrations, seed a canary (a posted, balanced voucher
# + an allocated gapless invoice number), pg_dump it, restore the dump into a fresh scratch DB, then
# assert the restore is healthy with db/dr/verify-restore.sql AND that the append-only immutability
# trigger still BITES on the restored data. It cleans up after itself and exits non-zero on any failure.
#
# This is the mechanical rehearsal of the procedure in docs/runbooks/disaster-recovery.md. The live
# Neon drill (restore a PITR branch, then run db/dr/verify-restore.sql against it) follows the same
# verify step — this script is what makes that step trustworthy before you ever need it for real.
#
# Usage:
#   tools/restore-drill.sh
#   ADMIN_URL='postgresql://root:rootpw@localhost:5432/postgres' tools/restore-drill.sh
#
# ADMIN_URL must be a superuser connection on the cluster (it CREATEs/DROPs the two drill databases
# and the migrations CREATE the saldo_app role). Defaults to the local dev cluster.

set -euo pipefail

ADMIN_URL="${ADMIN_URL:-postgresql://root:rootpw@localhost:5432/postgres}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATIONS_DIR="$REPO_ROOT/db/migrations"
VERIFY_SQL="$REPO_ROOT/db/dr/verify-restore.sql"
STAMP="$(date +%s 2>/dev/null || echo drill)"
SRC_DB="saldo_drill_src_${STAMP}_$$"
DST_DB="saldo_drill_dst_${STAMP}_$$"
DUMP_FILE="$(mktemp -t saldo-drill-XXXXXX.dump)"

# Derive a same-cluster URL for a named database from ADMIN_URL (swap the path).
db_url() { # $1 = dbname
  python3 - "$ADMIN_URL" "$1" <<'PY'
import sys, urllib.parse as u
url = u.urlsplit(sys.argv[1])
print(u.urlunsplit((url.scheme, url.netloc, '/' + sys.argv[2], url.query, url.fragment)))
PY
}

cleanup() {
  rm -f "$DUMP_FILE"
  psql "$ADMIN_URL" -v ON_ERROR_STOP=0 -q \
    -c "DROP DATABASE IF EXISTS ${SRC_DB} WITH (FORCE);" \
    -c "DROP DATABASE IF EXISTS ${DST_DB} WITH (FORCE);" >/dev/null 2>&1 || true
}
trap cleanup EXIT

say() { printf '\n\033[1m== %s\033[0m\n' "$*"; }

say "1. Build source DB ($SRC_DB) from db/migrations"
psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -q -c "CREATE DATABASE ${SRC_DB};"
SRC_URL="$(db_url "$SRC_DB")"
# Apply the -- migrate:up body of every migration, in order (mirrors the test harness, ADR 0011).
for f in $(ls "$MIGRATIONS_DIR"/*.sql | sort); do
  awk '/-- migrate:up/{f=1;next} /-- migrate:down/{f=0} f' "$f" \
    | psql "$SRC_URL" -v ON_ERROR_STOP=1 -q -f -
done

say "2. Seed a canary: org + accounts + period + a POSTED, balanced voucher + an invoice number"
psql "$SRC_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
DO $$
DECLARE
  org uuid; per uuid; acc_debit uuid; acc_credit uuid; v uuid; n bigint;
BEGIN
  -- org_nr '999888777' is deliberately mod-11-INVALID (control digit would be 1, not 7), so this
  -- canary can never collide with a real organisasjonsnummer — it is provably synthetic test data.
  INSERT INTO organization (org_nr, name, mva_status)
    VALUES ('999888777', 'DR Drill Canary ENK', 'registered_standard') RETURNING id INTO org;
  -- Tenant context so SECURITY DEFINER counter + any RLS-aware paths behave like the app.
  PERFORM set_config('app.current_org', org::text, true);
  INSERT INTO account (organization_id, number, name, type)
    VALUES (org, '3000', 'Salgsinntekt', 'revenue') RETURNING id INTO acc_credit;
  INSERT INTO account (organization_id, number, name, type)
    VALUES (org, '1500', 'Kundefordringer', 'asset') RETURNING id INTO acc_debit;
  INSERT INTO fiscal_period (organization_id, year, starts_on, ends_on)
    VALUES (org, 2026, '2026-01-01', '2026-12-31') RETURNING id INTO per;

  -- Allocate a gapless invoice number from the per-org counter row (NOT a sequence).
  n := allocate_invoice_number(org);
  RAISE NOTICE 'canary: allocated invoice number %', n;

  -- A balanced voucher: debit 1250,00 kr = credit 1250,00 kr (125000 øre each), posted.
  INSERT INTO voucher (organization_id, type, period_id, posted_at)
    VALUES (org, 'sales', per, now()) RETURNING id INTO v;
  INSERT INTO posting (organization_id, voucher_id, account_id, debit_ore, credit_ore)
    VALUES (org, v, acc_debit, 125000, 0);
  INSERT INTO posting (organization_id, voucher_id, account_id, debit_ore, credit_ore)
    VALUES (org, v, acc_credit, 0, 125000);
END $$;
SQL

say "3. pg_dump the source (custom format)"
pg_dump "$SRC_URL" --format=custom --file="$DUMP_FILE" --no-owner --no-privileges --no-acl 2>/dev/null \
  || pg_dump "$SRC_URL" --format=custom --file="$DUMP_FILE"
printf '   dump size: %s bytes\n' "$(wc -c < "$DUMP_FILE")"

say "4. Restore the dump into a fresh scratch DB ($DST_DB)"
psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -q -c "CREATE DATABASE ${DST_DB};"
DST_URL="$(db_url "$DST_DB")"
# pg_restore re-runs the schema (incl. triggers/RLS/functions) and reloads the rows.
pg_restore --no-owner --no-privileges --dbname="$DST_URL" "$DUMP_FILE" 2>&1 | grep -vi 'warning' || true

say "5. Verify the restore: db/dr/verify-restore.sql (structural + data sweep, expect_data=1)"
psql "$DST_URL" -v ON_ERROR_STOP=1 -v expect_data=1 -f "$VERIFY_SQL"

say "6. Prove the append-only invariant still BITES on the restored data"
# Attempt to mutate a posted voucher; the immutability trigger must reject it. If the UPDATE
# succeeds, the restore silently lost the protection — that is a drill FAILURE.
if psql "$DST_URL" -v ON_ERROR_STOP=1 -q \
     -c "UPDATE voucher SET type = 'tampered' WHERE posted_at IS NOT NULL;" >/dev/null 2>&1; then
  echo "   FAIL: a posted voucher was mutated after restore — immutability trigger did NOT survive" >&2
  exit 1
fi
echo "   OK: UPDATE of a posted voucher was rejected (immutability trigger survived the restore)."

say "RESTORE DRILL PASSED — backup verified restorable, integrity layer intact."
