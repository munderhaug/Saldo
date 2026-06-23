import type { Db } from '../db/client.js';
import { verifyPassword } from './password.server.js';
import { findUserByEmail } from './users.server.js';

/**
 * Dev email/password provider (ADR 0020). Ships now so the full login → org → ledger flow is testable
 * without a live eID broker. Production login is BankID/Vipps via OIDC (no password). Server-only.
 */
export async function authenticateWithPassword(
  db: Db,
  email: string,
  password: string,
): Promise<{ userId: string } | null> {
  const user = await findUserByEmail(db, email);
  // No such user, or an OIDC-only user (null hash) — fail the same way (don't reveal which).
  if (!user?.passwordHash) return null;
  const ok = await verifyPassword(user.passwordHash, password);
  return ok ? { userId: user.id } : null;
}
