import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql, TransactionSql } from 'postgres';
import { type LedgerDb, ledgerDbAvailable, seedOrg, startLedgerDb } from './db-harness.js';

// Needs a real Postgres (Docker/Testcontainers, or SALDO_TEST_PG_URI). Skips cleanly otherwise.

/**
 * Invoice email-delivery log (feat-invoice-pdf-email, §8.4) — tenancy isolation, the same-org invoice
 * link, and the append-only-by-grant design, proven against real Postgres via the non-owner `saldo_app`
 * connection (RLS is FORCEd for it). A log row carries the recipient (personal data), so cross-tenant
 * leakage would be a privacy incident: these assert a tenant sees/writes only its own rows, that a log
 * row can never reference another tenant's invoice, and that saldo_app may record but never rewrite an
 * attempt (no UPDATE/DELETE privilege).
 */
describe.skipIf(!ledgerDbAvailable)(
  'Invoice email log — RLS isolation + same-org link + append-only',
  () => {
    let db: LedgerDb;

    beforeAll(async () => {
      db = await startLedgerDb();
    });

    afterAll(async () => {
      await db.stop();
    });

    function asOrg<T>(orgId: string, fn: (tx: TransactionSql) => Promise<T>): Promise<T> {
      return db.appSql.begin(async (tx) => {
        await tx`SELECT set_config('app.current_org', ${orgId}, true)`;
        return fn(tx);
      }) as Promise<T>;
    }

    /** Insert a minimal issued-ish invoice (owner connection, RLS-bypassing) and return its id. */
    async function seedInvoice(sql: Sql, orgId: string): Promise<string> {
      const [row] = await sql<{ id: string }[]>`
      INSERT INTO invoice (organization_id, kind, customer_name)
      VALUES (${orgId}, 'invoice', 'Kunde AS')
      RETURNING id`;
      return row!.id;
    }

    it('scopes reads to the current org, and a cross-tenant INSERT is rejected by WITH CHECK', async () => {
      const a = await seedOrg(db.sql);
      const b = await seedOrg(db.sql);
      const invoiceA = await seedInvoice(db.sql, a.orgId);
      const invoiceB = await seedInvoice(db.sql, b.orgId);

      await asOrg(
        a.orgId,
        (tx) => tx`
      INSERT INTO invoice_email (organization_id, invoice_id, recipient, status, provider_message_id)
      VALUES (${a.orgId}, ${invoiceA}, 'kunde-a@example.no', 'sent', 'pm-a-1')`,
      );
      await asOrg(
        b.orgId,
        (tx) => tx`
      INSERT INTO invoice_email (organization_id, invoice_id, recipient, status, provider_message_id)
      VALUES (${b.orgId}, ${invoiceB}, 'kunde-b@example.no', 'sent', 'pm-b-1')`,
      );

      // A sees only its own log row, never B's.
      const seen = await asOrg(
        a.orgId,
        (tx) => tx<{ recipient: string }[]>`SELECT recipient FROM invoice_email`,
      );
      expect(seen.map((r) => r.recipient)).toEqual(['kunde-a@example.no']);

      // Writing a row tagged with another tenant's org id is blocked by the policy's WITH CHECK.
      await expect(
        asOrg(
          a.orgId,
          (tx) => tx`
        INSERT INTO invoice_email (organization_id, invoice_id, recipient, status)
        VALUES (${b.orgId}, ${invoiceB}, 'smuglet@example.no', 'sent')`,
        ),
      ).rejects.toThrow(/row-level security/i);
    });

    it('rejects a log row that references another tenant invoice (same-org composite FK)', async () => {
      const a = await seedOrg(db.sql);
      const b = await seedOrg(db.sql);
      const invoiceB = await seedInvoice(db.sql, b.orgId);

      // A tries to log against B's invoice id under A's org — the composite FK (id, organization_id) has
      // no matching row for org A, so it is rejected at the storage layer (RLS alone would not catch it).
      await expect(
        asOrg(
          a.orgId,
          (tx) => tx`
        INSERT INTO invoice_email (organization_id, invoice_id, recipient, status)
        VALUES (${a.orgId}, ${invoiceB}, 'kunde@example.no', 'sent')`,
        ),
      ).rejects.toThrow(/foreign key|violates/i);
    });

    it('is append-only for the app role: saldo_app may INSERT/SELECT but never UPDATE or DELETE', async () => {
      const a = await seedOrg(db.sql);
      const invoiceA = await seedInvoice(db.sql, a.orgId);
      await asOrg(
        a.orgId,
        (tx) => tx`
      INSERT INTO invoice_email (organization_id, invoice_id, recipient, status)
      VALUES (${a.orgId}, ${invoiceA}, 'kunde@example.no', 'failed')`,
      );

      // No UPDATE/DELETE privilege was granted — a rewrite attempt fails with a permission error, so a
      // recorded send attempt can never be altered after the fact.
      await expect(
        asOrg(a.orgId, (tx) => tx`UPDATE invoice_email SET status = 'sent'`),
      ).rejects.toThrow(/permission denied/i);
      await expect(asOrg(a.orgId, (tx) => tx`DELETE FROM invoice_email`)).rejects.toThrow(
        /permission denied/i,
      );
    });
  },
);
