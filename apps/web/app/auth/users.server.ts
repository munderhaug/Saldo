import { and, eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { appUser, membership } from '../db/schema.js';
import { hashPassword } from './password.server.js';

/**
 * User + membership queries (ADR 0020). `membership` is the user→org authz link — the piece that lets
 * `requireUser` resolve which org a session may act for, before `withOrgTx` sets the tenant GUC. All
 * functions take `db` (the plain app connection; these tables are pre-org). Server-only.
 */

export interface AppUserRow {
  readonly id: string;
  readonly email: string;
  readonly passwordHash: string | null;
}
export interface MembershipRow {
  readonly organizationId: string;
  readonly role: string;
}

/** Normalise an email the way the DB CHECK expects (lower-cased, trimmed). */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function findUserByEmail(db: Db, email: string): Promise<AppUserRow | null> {
  const rows = await db
    .select({ id: appUser.id, email: appUser.email, passwordHash: appUser.passwordHash })
    .from(appUser)
    .where(eq(appUser.email, normalizeEmail(email)))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Look up an OIDC-linked account by its immutable identity — the IdP issuer + subject (ADR 0020,
 * RFC 9700). This is the account key for the OIDC login path; email is NEVER the key (it can be
 * re-assigned/aliased across a multi-IdP broker, which would otherwise be an account-takeover vector).
 */
export async function findUserByOidcIdentity(
  db: Db,
  iss: string,
  sub: string,
): Promise<AppUserRow | null> {
  const rows = await db
    .select({ id: appUser.id, email: appUser.email, passwordHash: appUser.passwordHash })
    .from(appUser)
    .where(and(eq(appUser.oidcIss, iss), eq(appUser.oidcSub, sub)))
    .limit(1);
  return rows[0] ?? null;
}

export async function createUserWithPassword(
  db: Db,
  email: string,
  password: string,
): Promise<AppUserRow> {
  const passwordHash = await hashPassword(password);
  const rows = await db
    .insert(appUser)
    .values({ email: normalizeEmail(email), passwordHash })
    .returning({ id: appUser.id, email: appUser.email, passwordHash: appUser.passwordHash });
  return rows[0]!;
}

/**
 * Create an OIDC-only user (no password). The account is keyed on the immutable `(iss, sub)` pair;
 * the verified email is stored as a display attribute only, never as the lookup key.
 */
export async function createOidcUser(
  db: Db,
  identity: { iss: string; sub: string; email: string },
): Promise<AppUserRow> {
  const rows = await db
    .insert(appUser)
    .values({
      email: normalizeEmail(identity.email),
      oidcIss: identity.iss,
      oidcSub: identity.sub,
    })
    .returning({ id: appUser.id, email: appUser.email, passwordHash: appUser.passwordHash });
  return rows[0]!;
}

export function getMemberships(db: Db, userId: string): Promise<MembershipRow[]> {
  return db
    .select({ organizationId: membership.organizationId, role: membership.role })
    .from(membership)
    .where(eq(membership.userId, userId));
}

export async function getMembership(
  db: Db,
  userId: string,
  organizationId: string,
): Promise<MembershipRow | null> {
  const rows = await db
    .select({ organizationId: membership.organizationId, role: membership.role })
    .from(membership)
    .where(and(eq(membership.userId, userId), eq(membership.organizationId, organizationId)))
    .limit(1);
  return rows[0] ?? null;
}
