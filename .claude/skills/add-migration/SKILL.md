---
name: add-migration
description: Create a new raw SQL migration for the Saldo ledger (tables, constraints, triggers, RLS, sequences-via-counter) and regenerate the Drizzle schema. Use when the database schema or any integrity rule must change.
---
# Add a migration

Integrity lives in SQL, not the ORM. The Drizzle schema is generated, never hand-written.

## Steps
1. `pnpm db:migrate:new <name>` — creates `db/migrations/<timestamp>_<name>.sql` with
   `-- migrate:up` / `-- migrate:down` sections (dbmate).
2. Write the change. For ledger-touching work, include the relevant guard:
   - balance CONSTRAINT TRIGGER · immutability trigger · period-lock trigger · RLS policy
   - invoice numbers: per-org `invoice_counter` + `UPDATE ... RETURNING` — never a SEQUENCE.
3. Apply locally: `pnpm db:migrate`.
4. Regenerate types: `pnpm db:introspect` (writes `apps/web/app/db/schema.ts` — do not edit by hand).
5. Add a Testcontainers integration test proving the constraint/trigger actually blocks the bad case.

## Gotchas
- `bigint` for all money (øre). Every business table needs `organization_id`.
- Always provide a working `-- migrate:down`.
- If unsure of the SQL, delegate a draft to the `migration-author` subagent, then review and apply it yourself.
