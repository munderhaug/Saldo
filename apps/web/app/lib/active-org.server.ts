/**
 * The persisted active-org context (feat-org-active-context, ADR 0060) — which business the user is
 * acting for across requests. A plain browser cookie like the companion preference: it is a
 * NAVIGATION HINT ONLY, never an authz input — every read still goes `requireUser` → membership →
 * `withOrgTx` (ADR 0020), so a stale or forged value can never widen access; it can only point at an
 * org the server then refuses. Opening an org sets it; home follows it instead of guessing.
 */
import { z } from 'zod';

const ACTIVE_ORG_COOKIE = 'saldo_active_org';
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;
const uuid = z.string().uuid();

/** The remembered org id for this request, or null. Validated shape only — membership is NOT proven here. */
export function readActiveOrg(request: Request): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === ACTIVE_ORG_COOKIE) {
      const value = part.slice(eq + 1).trim();
      return uuid.safeParse(value).success ? value : null;
    }
  }
  return null;
}

/** Set-Cookie value remembering `orgId` as the active org. Same attributes as the session cookie. */
export function buildActiveOrgCookie(orgId: string, secure: boolean): string {
  return [
    `${ACTIVE_ORG_COOKIE}=${orgId}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${ONE_YEAR_SECONDS}`,
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}
