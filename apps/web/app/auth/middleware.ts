import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db/client.js';

/** A Drizzle transaction handle — same query API as `Db`, scoped to one tenant by `withOrgTx`. */
export type OrgTx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Internal org id is a uuid; guard it before it reaches `set_config` (defence-in-depth, never user-typed). */
const orgIdSchema = z.string().uuid();

/**
 * Run `fn` inside a transaction with the `app.current_org` GUC set transaction-locally, so the FORCEd
 * RLS policies (ADR 0012) scope every statement to this tenant. This is the per-request tenancy
 * boundary: the app connects as the non-owner `saldo_app` role and calls this with the organization id
 * from the authenticated session — RLS then makes cross-tenant reads/writes impossible even if a query
 * forgets its `WHERE organization_id = …` filter.
 *
 * `set_config(_, _, true)` is transaction-scoped (the SET LOCAL form) — the only safe variant on a
 * pooled connection, since a session-level GUC would leak to the next request that reuses the socket.
 */
export function withOrgTx<T>(
  db: Db,
  organizationId: string,
  fn: (tx: OrgTx) => Promise<T>,
): Promise<T> {
  const orgId = orgIdSchema.parse(organizationId);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.current_org', ${orgId}, true)`);
    return fn(tx);
  });
}
