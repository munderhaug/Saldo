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

## Rationalizations (don't)
| Excuse | Reality |
|---|---|
| "I'll add the constraint in app code." | Integrity is SQL, not the ORM. App code is not a guarantee. |
| "A SEQUENCE is simpler for numbering." | Sequences leave gaps on rollback. Use the per-org counter (ADR 0007). |
| "I'll edit schema.ts directly." | It's generated; edit the SQL and re-introspect. A hook blocks it. |

## Red flags — STOP
- A migration with no `-- migrate:down`. RLS not enabled on a new tenant-scoped table. A ledger change
  with no Testcontainers test proving the trigger blocks the bad case.

## Done means (evidence required)
- [ ] `pnpm db:migrate` up AND down both work · [ ] `pnpm db:introspect` regenerated the schema
- [ ] a Testcontainers test asserts the constraint/trigger actually blocks the violation
