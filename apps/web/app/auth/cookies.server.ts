/**
 * Session cookie plumbing (ADR 0020). HttpOnly (no JS access), SameSite=Lax (sent on top-level
 * navigation — needed for the OIDC redirect return — but not on cross-site sub-requests, the CSRF
 * defense), Path=/, and Secure in production. Server-only (`.server.ts`).
 */
const SESSION_COOKIE = 'saldo_session';

function attributes(secure: boolean): string[] {
  return ['HttpOnly', 'SameSite=Lax', 'Path=/', ...(secure ? ['Secure'] : [])];
}

/** Set-Cookie value pinning the session token until `expiresAt`. */
export function buildSessionCookie(token: string, expiresAt: Date, secure: boolean): string {
  return [
    `${SESSION_COOKIE}=${token}`,
    ...attributes(secure),
    `Expires=${expiresAt.toUTCString()}`,
  ].join('; ');
}

/** Set-Cookie value that clears the session (logout). */
export function clearSessionCookie(secure: boolean): string {
  return [`${SESSION_COOKIE}=`, ...attributes(secure), 'Max-Age=0'].join('; ');
}

/** Read the session token from the request's Cookie header, or null. */
export function readSessionToken(request: Request): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === SESSION_COOKIE) {
      return decodeURIComponent(part.slice(eq + 1).trim()) || null;
    }
  }
  return null;
}
