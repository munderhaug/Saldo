/**
 * Organisation onboarding queries (ADR 0032) — the piece that makes `withOrgTx` real per logged-in
 * user: create an org, attach the creator as `owner`, and provision its per-org kontoplan + VAT codes,
 * all inside ONE tenant transaction. Functions take the `db` handle (testable against a real Postgres,
 * the `users.server` pattern). Server-only.
 */
import { eq, sql } from 'drizzle-orm';
import type { MvaStatus } from '@saldo/domain';
import type { Db } from './client.js';
import { withOrgTx, type OrgTx } from '../auth/middleware.js';
import { getMemberships } from '../auth/users.server.js';
import { account, membership, organization, vatCode } from './schema.js';
import { STANDARD_ACCOUNTS, STANDARD_VAT_CODES } from './provisioning.server.js';

/** An org's identifying header (no membership role). */
interface OrgHeader {
  readonly id: string;
  readonly name: string;
  readonly orgNr: string;
  readonly mvaStatus: string;
}

/** A header plus the caller's role in it — the selection-list shape. */
export interface OrgSummary extends OrgHeader {
  readonly role: string;
}

export interface VatCodeRow {
  readonly code: string;
  readonly rate: string;
  readonly direction: string;
}

export interface OrgOverview {
  readonly org: OrgHeader;
  readonly vatCodes: readonly VatCodeRow[];
  readonly accountCount: number;
}

export type CreateOrgResult =
  | { ok: true; orgId: string }
  | { ok: false; reason: 'duplicate-org-nr' };

/**
 * A Postgres unique-violation on the given constraint. postgres.js surfaces `code`/`constraint_name`
 * on the error; Drizzle wraps the driver error and carries the original on `.cause`, so we walk the
 * cause chain.
 */
function isUniqueViolation(error: unknown, constraint: string): boolean {
  for (
    let e: unknown = error;
    e !== null && e !== undefined;
    e = (e as { cause?: unknown }).cause
  ) {
    if (
      typeof e === 'object' &&
      (e as { code?: string }).code === '23505' &&
      (e as { constraint_name?: string }).constraint_name === constraint
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Create an organization for `userId` and provision it, atomically. The app picks the new org id and
 * runs the whole insert inside `withOrgTx(orgId)` so the FORCE-RLS `WITH CHECK (… = current_org)`
 * holds for the org row and every provisioned child row (the bootstrap proven by the RLS tenancy
 * test). `membership` is the pre-org authz link (no RLS) and is written in the same transaction so a
 * created org always has its owner. A duplicate org number is an expected outcome, not a thrown 500.
 */
export async function createOrganization(
  db: Db,
  input: { userId: string; orgNr: string; name: string; mvaStatus: MvaStatus },
): Promise<CreateOrgResult> {
  const orgId = crypto.randomUUID();
  try {
    await withOrgTx(db, orgId, async (tx) => {
      await tx
        .insert(organization)
        .values({ id: orgId, orgNr: input.orgNr, name: input.name, mvaStatus: input.mvaStatus });
      await tx
        .insert(account)
        .values(STANDARD_ACCOUNTS.map((a) => ({ organizationId: orgId, ...a })));
      await tx
        .insert(vatCode)
        .values(STANDARD_VAT_CODES.map((c) => ({ organizationId: orgId, ...c })));
      await tx
        .insert(membership)
        .values({ userId: input.userId, organizationId: orgId, role: 'owner' });
    });
    return { ok: true, orgId };
  } catch (error) {
    if (isUniqueViolation(error, 'organization_org_nr_key')) {
      return { ok: false, reason: 'duplicate-org-nr' };
    }
    throw error;
  }
}

/**
 * The orgs a user may act for (the multi-membership selection surface). `organization` is RLS-scoped
 * to a single `app.current_org`, and listing is a pre-active-org, cross-org operation — so we read each
 * membership's org inside its own `withOrgTx` (the proven per-request boundary, correct on every
 * topology) rather than assume a cross-org RLS bypass. A handful of orgs per user makes this cheap.
 */
export async function listOrganizationsForUser(db: Db, userId: string): Promise<OrgSummary[]> {
  const memberships = await getMemberships(db, userId);
  const rows = await Promise.all(
    memberships.map((m) =>
      withOrgTx(db, m.organizationId, async (tx) => {
        const [org] = await tx
          .select({
            id: organization.id,
            name: organization.name,
            orgNr: organization.orgNr,
            mvaStatus: organization.mvaStatus,
          })
          .from(organization)
          .limit(1);
        return org ? { ...org, role: m.role } : null;
      }),
    ),
  );
  return rows
    .filter((r): r is OrgSummary => r !== null)
    .sort((a, b) => a.name.localeCompare(b.name, 'nb'));
}

/**
 * Read one org's overview within an already-scoped tenant transaction (call via `withUserOrg`, which
 * proves membership first). RLS scopes the counts/lists to the current org, so the unfiltered
 * `account`/`vat_code` reads return only this tenant's rows.
 */
export async function readOrgOverview(tx: OrgTx, orgId: string): Promise<OrgOverview | null> {
  const [org] = await tx
    .select({
      id: organization.id,
      name: organization.name,
      orgNr: organization.orgNr,
      mvaStatus: organization.mvaStatus,
    })
    .from(organization)
    .where(eq(organization.id, orgId))
    .limit(1);
  if (!org) return null;

  const vatCodes = await tx
    .select({ code: vatCode.code, rate: vatCode.rate, direction: vatCode.direction })
    .from(vatCode);
  const [counts] = await tx.select({ n: sql<number>`count(*)::int` }).from(account);

  return {
    org,
    vatCodes,
    accountCount: counts?.n ?? 0,
  };
}
