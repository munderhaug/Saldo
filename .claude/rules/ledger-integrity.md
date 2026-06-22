---
paths: ["db/migrations/**", "apps/web/app/db/**"]
---
# Ledger integrity (enforced in SQL, not the ORM)

- The Drizzle schema in `apps/web/app/db/schema.ts` is GENERATED via `pnpm db:introspect`.
  Never hand-edit it — change `db/migrations/*.sql` and re-introspect. (A hook blocks edits.)
- Every integrity guarantee is a SQL migration:
  - **Balance:** a CONSTRAINT TRIGGER verifies Σ debit = Σ credit per voucher at commit.
  - **Immutability:** a trigger BLOCKS UPDATE/DELETE on `voucher`/`posting` once `posted_at` is set;
    same for issued `invoice`/`credit_note`.
  - **Period lock:** a trigger blocks postings into a locked period.
  - **Invoice numbering:** gapless per-org via the `invoice_counter` row, allocated with
    `UPDATE invoice_counter SET next = next + 1 WHERE organization_id = $1 RETURNING next`
    inside the issuing transaction. NEVER a Postgres SEQUENCE (sequences leave gaps on rollback).
  - **Tenancy:** RLS policies reference the GUC `app.current_org` set via `SET LOCAL` per request.
- Money columns are `bigint` (øre). Every business table carries `organization_id`.
- New ledger-touching change is "done" only when SQL-integrity tests (Testcontainers) cover it.
