import { redirect } from 'react-router';
import { db } from '../db/client.js';
import { withOrgTx, type OrgTx } from './middleware.js';
import { readSessionToken } from './cookies.server.js';
import { type SessionUser, validateSessionToken } from './session.server.js';
import { getMembership, type MembershipRow } from './users.server.js';

/**
 * The authn/authz wiring (ADR 0020) — the FIRST lock, in front of RLS (the second). This module binds
 * the testable cores (session, users) to the real app `db` and the request lifecycle. The chain the
 * roadmap calls for: `requireUser` → resolve `membership` → `withOrgTx`.
 */

export async function getOptionalUser(request: Request): Promise<SessionUser | null> {
  const token = readSessionToken(request);
  if (!token) return null;
  const result = await validateSessionToken(db, token);
  return result?.user ?? null;
}

/** Authn gate for a loader/action: a logged-in user, or a redirect to the login page. */
export async function requireUser(request: Request): Promise<SessionUser> {
  const user = await getOptionalUser(request);
  if (!user) throw redirect('/auth/login');
  return user;
}

/** Authz gate: the user must be a member of `organizationId`, else 403. Returns the user + role.
 * Use directly (instead of `withUserOrg`) when an action needs the proven user BEFORE doing non-DB
 * work — e.g. gating an outbound LLM call — without opening a tenant transaction. */
export async function requireOrgAccess(
  request: Request,
  organizationId: string,
): Promise<{ user: SessionUser; membership: MembershipRow }> {
  const user = await requireUser(request);
  const membership = await getMembership(db, user.id, organizationId);
  if (!membership) throw new Response('Forbidden', { status: 403 });
  return { user, membership };
}

/**
 * The full chain: authn → membership authz → tenant transaction. Run `fn` inside `withOrgTx` (which
 * sets `app.current_org` so RLS scopes every statement) only after proving the user may act for the org.
 */
export function withUserOrg<T>(
  request: Request,
  organizationId: string,
  fn: (tx: OrgTx, ctx: { user: SessionUser; role: string }) => Promise<T>,
): Promise<T> {
  return requireOrgAccess(request, organizationId).then(({ user, membership }) =>
    withOrgTx(db, organizationId, (tx) => fn(tx, { user, role: membership.role })),
  );
}

/**
 * CSRF defense for state-changing requests: SameSite=Lax keeps the session cookie off cross-site
 * sub-requests, and this additionally requires the Origin to match the Host. Call at the top of every
 * mutating action.
 */
export function assertSameOrigin(request: Request): void {
  if (request.method === 'GET' || request.method === 'HEAD') return;
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (!origin || !host || new URL(origin).host !== host) {
    throw new Response('Cross-origin request blocked', { status: 403 });
  }
}
