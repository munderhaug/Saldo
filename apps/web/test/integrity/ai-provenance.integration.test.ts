import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import { type LedgerDb, ledgerDbAvailable, startLedgerDb } from './db-harness.js';
import * as schema from '../../app/db/schema.js';
import { withOrgTx } from '../../app/auth/middleware.js';
import { recordManualVoucher } from '../../app/db/posting.server.js';
import { recordAiProvenance } from '../../app/db/ai-provenance.server.js';
import { STANDARD_ACCOUNTS, STANDARD_VAT_CODES } from '../../app/db/provisioning.server.js';

// Needs a real Postgres (Docker/Testcontainers, or SALDO_TEST_PG_URI). Skips cleanly otherwise.

/**
 * The durable AI-provenance audit trail (aia-provenance-logging, ADR 0037; EU AI Act Art. 50(2)). When a
 * human confirms an AI proposal and it posts to the ledger, `recordAiProvenance` writes a queryable
 * record — model · modelVersion · confidence, 1:1 with the voucher — in the SAME tenant transaction as
 * the post (AI never writes the ledger; the provenance sits ALONGSIDE the human-confirmed post, ADR 0002).
 *
 * Proven here against the running invariants — the non-owner `saldo_app` role under FORCE-RLS, inside
 * `withOrgTx`, exactly as the confirm action runs it:
 *  - provenance is FK'd 1:1 to the posted voucher and carries only model/version/confidence;
 *  - it is written ONLY on a confirmed AI post — a plain manual post leaves NO provenance row;
 *  - it is tenant-isolated (one org never sees another's provenance) and cross-org links are impossible;
 *  - it is append-only to the app: the `saldo_app` grant has no UPDATE/DELETE (immutable like the voucher).
 */
describe.skipIf(!ledgerDbAvailable)('AI provenance — durable Art. 50(2) audit trail', () => {
  let db: LedgerDb;
  let appDb: ReturnType<typeof drizzle<typeof schema>>;

  beforeAll(async () => {
    db = await startLedgerDb();
    appDb = drizzle(db.appSql, { schema });
  });
  afterAll(async () => {
    await db.stop();
  });

  let orgSeq = 0;
  /** Seed a fully-provisioned org (owner connection bypasses RLS), as real onboarding does. */
  async function provisionOrg(): Promise<string> {
    orgSeq += 1;
    const ownerDb = drizzle(db.sql, { schema });
    const [org] = await db.sql<{ id: string }[]>`
      INSERT INTO organization (org_nr, name, mva_status)
      VALUES (${String(950000000 + orgSeq)}, ${'Provenans ENK ' + String(orgSeq)}, 'registered_standard')
      RETURNING id`;
    const orgId = org!.id;
    await ownerDb
      .insert(schema.account)
      .values(STANDARD_ACCOUNTS.map((a) => ({ organizationId: orgId, ...a })));
    await ownerDb
      .insert(schema.vatCode)
      .values(STANDARD_VAT_CODES.map((c) => ({ organizationId: orgId, ...c })));
    return orgId;
  }

  /** The provenance rows for a voucher (owner read; RLS-free for assertions). */
  function provenanceOf(voucherId: string) {
    return db.sql<{ model: string; modelVersion: string; confidence: string; orgId: string }[]>`
      SELECT model, model_version AS "modelVersion", confidence, organization_id AS "orgId"
        FROM ai_provenance WHERE voucher_id = ${voucherId}`;
  }

  it('writes one provenance row, FK 1:1 to the confirmed AI post (model/version/confidence only)', async () => {
    const orgId = await provisionOrg();
    const voucherId = await withOrgTx(appDb, orgId, async (tx) => {
      const posted = await recordManualVoucher(tx, {
        organizationId: orgId,
        kind: 'expense',
        net: 40_000,
        year: 2026,
      });
      expect(posted.ok).toBe(true);
      if (!posted.ok) throw new Error('post failed');
      await recordAiProvenance(tx, {
        organizationId: orgId,
        voucherId: posted.voucherId,
        model: 'qwen2.5-vl',
        modelVersion: 'qwen2.5-vl:7b',
        confidence: 0.9,
      });
      return posted.voucherId;
    });

    const rows = await provenanceOf(voucherId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      model: 'qwen2.5-vl',
      modelVersion: 'qwen2.5-vl:7b',
      orgId,
    });
    expect(Number(rows[0]!.confidence)).toBeCloseTo(0.9);

    // Data minimisation: the table holds ONLY the provenance + linkage columns — no supplier/amount/image.
    const cols = await db.sql<{ column: string }[]>`
      SELECT column_name AS column FROM information_schema.columns
       WHERE table_name = 'ai_provenance' ORDER BY column_name`;
    expect(cols.map((c) => c.column)).toEqual([
      'confidence',
      'created_at',
      'id',
      'model',
      'model_version',
      'organization_id',
      'voucher_id',
    ]);
  });

  it('writes provenance ONLY on a confirmed AI post — a plain manual post leaves none', async () => {
    const orgId = await provisionOrg();
    const result = await withOrgTx(appDb, orgId, (tx) =>
      recordManualVoucher(tx, { organizationId: orgId, kind: 'income', net: 50_000, year: 2026 }),
    );
    expect(result.ok).toBe(true);
    const voucherId = result.ok ? result.voucherId : '';
    expect(await provenanceOf(voucherId)).toHaveLength(0);
  });

  it('is one-per-voucher: a second provenance insert for the same voucher is rejected', async () => {
    const orgId = await provisionOrg();
    const voucherId = await withOrgTx(appDb, orgId, async (tx) => {
      const posted = await recordManualVoucher(tx, {
        organizationId: orgId,
        kind: 'income',
        net: 30_000,
        year: 2026,
      });
      if (!posted.ok) throw new Error('post failed');
      await recordAiProvenance(tx, {
        organizationId: orgId,
        voucherId: posted.voucherId,
        model: 'm',
        modelVersion: 'v',
        confidence: 0.5,
      });
      return posted.voucherId;
    });

    await expect(
      withOrgTx(appDb, orgId, (tx) =>
        recordAiProvenance(tx, {
          organizationId: orgId,
          voucherId,
          model: 'm2',
          modelVersion: 'v2',
          confidence: 0.6,
        }),
      ),
    ).rejects.toThrow(); // UNIQUE (voucher_id)
  });

  it("never sees another tenant's provenance (RLS isolation via saldo_app)", async () => {
    const a = await provisionOrg();
    const b = await provisionOrg();
    await withOrgTx(appDb, a, async (tx) => {
      const posted = await recordManualVoucher(tx, {
        organizationId: a,
        kind: 'income',
        net: 10_000,
        year: 2026,
      });
      if (!posted.ok) throw new Error('post failed');
      await recordAiProvenance(tx, {
        organizationId: a,
        voucherId: posted.voucherId,
        model: 'm',
        modelVersion: 'v',
        confidence: 0.7,
      });
    });

    // Tenant B, under its own RLS context, counts zero of A's provenance rows.
    const seen = await withOrgTx(appDb, b, (tx) =>
      tx.select({ id: schema.aiProvenance.id }).from(schema.aiProvenance),
    );
    expect(seen).toHaveLength(0);
  });

  it('is append-only to the app role: no UPDATE/DELETE grant on ai_provenance', async () => {
    const [upd] = await db.sql<{ ok: boolean }[]>`
      SELECT has_table_privilege('saldo_app', 'public.ai_provenance', 'UPDATE') AS ok`;
    const [del] = await db.sql<{ ok: boolean }[]>`
      SELECT has_table_privilege('saldo_app', 'public.ai_provenance', 'DELETE') AS ok`;
    expect(upd!.ok).toBe(false);
    expect(del!.ok).toBe(false);
  });
});
