import { eq } from 'drizzle-orm';
import { sha256 } from '@oslojs/crypto/sha2';
import { encodeBase32LowerCaseNoPadding, encodeHexLowerCase } from '@oslojs/encoding';
import type { Db } from '../db/client.js';
import { appUser, userSession } from '../db/schema.js';

/**
 * Server-side sessions, the Lucia pattern (ADR 0020). The cookie carries a high-entropy opaque token;
 * the DB stores ONLY its SHA-256, so a database leak never yields a usable session token. Absolute TTL
 * of 30 days with a sliding renewal: a session within 15 days of expiry is extended on use.
 *
 * All functions take the `db` handle (and an injectable `now`) so they unit-test against a real
 * Postgres without importing app config. Run on the plain app connection (no tenant tx) — these tables
 * are pre-org (ADR 0020). Server-only (`.server.ts`).
 */
const DAY_MS = 86_400_000;
const SESSION_TTL_MS = 30 * DAY_MS;
const RENEW_WITHIN_MS = 15 * DAY_MS;

export interface Session {
  readonly id: string;
  readonly userId: string;
  readonly expiresAt: Date;
}
export interface SessionUser {
  readonly id: string;
  readonly email: string;
}

/** A new opaque token for the cookie (20 random bytes, base32). Its hash is the row id. */
export function generateSessionToken(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return encodeBase32LowerCaseNoPadding(bytes);
}

/** SHA-256 (hex) of the token — the stored session id; never store the token itself. */
function hashSessionToken(token: string): string {
  return encodeHexLowerCase(sha256(new TextEncoder().encode(token)));
}

export async function createSession(
  db: Db,
  token: string,
  userId: string,
  now = new Date(),
): Promise<Session> {
  const id = hashSessionToken(token);
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await db.insert(userSession).values({ id, userId, expiresAt: expiresAt.toISOString() });
  return { id, userId, expiresAt };
}

/** Resolve a cookie token to its session + user, or null. Expired sessions are deleted; live ones slide. */
export async function validateSessionToken(
  db: Db,
  token: string,
  now = new Date(),
): Promise<{ session: Session; user: SessionUser } | null> {
  const id = hashSessionToken(token);
  const rows = await db
    .select({
      userId: userSession.userId,
      expiresAt: userSession.expiresAt,
      email: appUser.email,
    })
    .from(userSession)
    .innerJoin(appUser, eq(appUser.id, userSession.userId))
    .where(eq(userSession.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  let expiresAt = new Date(row.expiresAt);
  if (now.getTime() >= expiresAt.getTime()) {
    await db.delete(userSession).where(eq(userSession.id, id));
    return null;
  }
  if (expiresAt.getTime() - now.getTime() < RENEW_WITHIN_MS) {
    expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
    await db
      .update(userSession)
      .set({ expiresAt: expiresAt.toISOString() })
      .where(eq(userSession.id, id));
  }
  return {
    session: { id, userId: row.userId, expiresAt },
    user: { id: row.userId, email: row.email },
  };
}

/** Invalidate one session (logout). */
export async function invalidateSession(db: Db, token: string): Promise<void> {
  await db.delete(userSession).where(eq(userSession.id, hashSessionToken(token)));
}

/** Invalidate every session for a user (e.g. password change, "sign out everywhere"). */
export async function invalidateUserSessions(db: Db, userId: string): Promise<void> {
  await db.delete(userSession).where(eq(userSession.userId, userId));
}
