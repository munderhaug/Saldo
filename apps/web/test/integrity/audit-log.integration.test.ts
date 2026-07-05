import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import { type LedgerDb, ledgerDbAvailable, startLedgerDb } from './db-harness.js';
import * as schema from '../../app/db/schema.js';
import { withOrgTx } from '../../app/auth/middleware.js';
import { recordManualVoucher } from '../../app/db/posting.server.js';
import { recordAuditEvent } from '../../app/db/audit.server.js';
import { readFullExport } from '../../app/db/export.server.js';
import { STANDARD_ACCOUNTS, STANDARD_VAT_CODES } from '../../app/db/provisioning.server.js';

// Needs a real Postgres (Docker/Testcontainers, or SALDO_TEST_PG_URI). Skips cleanly otherwise.

/**
 * The audit trail (feat-audit-log, ADR 0062; bokføringsforskrift sporbarhet). Every consequential
 * write records WHO did it — `recordAuditEvent` runs in the SAME tenant transaction as the write, so
 * the act and its attribution commit atomically (the ai_provenance convention, ADR 0037).
 *
 * Proven here against the running invariants — the non-owner `saldo_app` role under FORCE-RLS, inside
 * `withOrgTx`, exactly as the route actions run it:
 *  - one consequential write ⇒ one attributed row (actor · action · entity linkage, nothing more);
 *  - the action format is a closed 'entity.act' shape — free text is rejected in SQL;
 *  - the trail is tenant-isolated (one org never sees another's) and append-only at the privilege
 *    level (no UPDATE/DELETE grant — immutable like the ledger it attests to);
 *  - the full raw export (`readFullExport`, the anti-lock-in half) is RLS-scoped and carries the
 *    org's own trail.
 */
describe.skipIf(!ledgerDbAvailable)('audit log — sporbarhet + full export (ADR 0062)', () => {
  let db: LedgerDb;
  let appDb: ReturnType<typeof drizzle<typeof schema>>;

  beforeAll(async () => {
    db = await startLedgerDb();
    appDb = drizzle(db.appSql, { schema });
  });
  afterAll(async () => {
    await db.stop();
  });

  let seq = 0;
  /** Seed a fully-provisioned org + an authenticated user (owner connection, as onboarding does). */
  async function provision(): Promise<{ orgId: string; userId: string }> {
    seq += 1;
    const ownerDb = drizzle(db.sql, { schema });
    const [org] = await db.sql<{ id: string }[]>`
      INSERT INTO organization (org_nr, name, mva_status)
      VALUES (${String(960000000 + seq)}, ${'Sporbarhet ENK ' + String(seq)}, 'registered_standard')
      RETURNING id`;
    const orgId = org!.id;
    await ownerDb
      .insert(schema.account)
      .values(STANDARD_ACCOUNTS.map((a) => ({ organizationId: orgId, ...a })));
    await ownerDb
      .insert(schema.vatCode)
      .values(STANDARD_VAT_CODES.map((c) => ({ organizationId: orgId, ...c })));
    const [user] = await db.sql<{ id: string }[]>`
      INSERT INTO app_user (email) VALUES (${`actor${String(seq)}@example.test`}) RETURNING id`;
    return { orgId, userId: user!.id };
  }

  /** Post one voucher and audit it, as the route actions do — one tenant tx, actor in hand. */
  async function postAudited(orgId: string, userId: string): Promise<string> {
    return withOrgTx(appDb, orgId, async (tx) => {
      const posted = await recordManualVoucher(tx, {
        organizationId: orgId,
        kind: 'income',
        net: 25_000,
        year: 2026,
      });
      if (!posted.ok) throw new Error('post failed');
      await recordAuditEvent(tx, {
        organizationId: orgId,
        actorUserId: userId,
        action: 'voucher.posted',
        entityId: posted.voucherId,
      });
      return posted.voucherId;
    });
  }

  it('attributes the post to its actor, atomically in the posting tx (minimal columns only)', async () => {
    const { orgId, userId } = await provision();
    const voucherId = await postAudited(orgId, userId);

    const rows = await db.sql<{ actor: string; action: string; table: string; entity: string }[]>`
      SELECT actor_user_id AS actor, action, entity_table AS "table", entity_id AS entity
        FROM audit_log WHERE organization_id = ${orgId}`;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      actor: userId,
      action: 'voucher.posted',
      table: 'voucher',
      entity: voucherId,
    });

    // Data minimisation: actor · action · linkage — no amounts, names or free-text payload columns.
    const cols = await db.sql<{ column: string }[]>`
      SELECT column_name AS column FROM information_schema.columns
       WHERE table_name = 'audit_log' ORDER BY column_name`;
    expect(cols.map((c) => c.column)).toEqual([
      'action',
      'actor_user_id',
      'created_at',
      'entity_id',
      'entity_table',
      'id',
      'organization_id',
    ]);
  });

  it("rejects a free-text action in SQL (the closed 'entity.act' format)", async () => {
    const { orgId, userId } = await provision();
    const voucherId = await postAudited(orgId, userId);

    // Raw SQL so the CHECK's constraint name surfaces unwrapped (Drizzle wraps the cause).
    await expect(
      db.sql`
        INSERT INTO audit_log (organization_id, actor_user_id, action, entity_table, entity_id)
        VALUES (${orgId}, ${userId}, 'did some stuff', 'voucher', ${voucherId})`,
    ).rejects.toThrow(/audit_log_action_check/);
  });

  it("never sees another tenant's trail (RLS isolation via saldo_app)", async () => {
    const a = await provision();
    const b = await provision();
    await postAudited(a.orgId, a.userId);

    const seen = await withOrgTx(appDb, b.orgId, (tx) =>
      tx.select({ id: schema.auditLog.id }).from(schema.auditLog),
    );
    expect(seen).toHaveLength(0);
  });

  it('is append-only to the app role: no UPDATE/DELETE grant on audit_log', async () => {
    const [upd] = await db.sql<{ ok: boolean }[]>`
      SELECT has_table_privilege('saldo_app', 'public.audit_log', 'UPDATE') AS ok`;
    const [del] = await db.sql<{ ok: boolean }[]>`
      SELECT has_table_privilege('saldo_app', 'public.audit_log', 'DELETE') AS ok`;
    expect(upd!.ok).toBe(false);
    expect(del!.ok).toBe(false);
  });

  it('exports the whole org — vouchers, postings and the trail — RLS-scoped to the caller', async () => {
    const a = await provision();
    const b = await provision();
    const voucherId = await postAudited(a.orgId, a.userId);
    await postAudited(b.orgId, b.userId);

    const full = await withOrgTx(appDb, a.orgId, (tx) => readFullExport(tx));
    expect(full.format).toBe('saldo-full-export');
    expect((full.organization as { id: string }).id).toBe(a.orgId);
    expect(full.vouchers.map((v) => v['id'])).toEqual([voucherId]);
    expect(full.postings.length).toBeGreaterThanOrEqual(2); // the balanced legs
    expect(full.auditLog).toHaveLength(1);
    expect(full.auditLog[0]!['entityId']).toBe(voucherId);
    // Registers and codes ride along (the fresh org's provisioned chart), never another tenant's.
    expect(full.accounts.length).toBeGreaterThan(0);
    expect(new Set(full.accounts.map((r) => r['organizationId']))).toEqual(new Set([a.orgId]));
  });
});
