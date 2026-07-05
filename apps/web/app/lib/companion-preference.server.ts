/**
 * The companion on/off preference (ADR 0058: "dismissible, never nags"). A plain browser cookie,
 * read server-side so the choice holds without JS and the companion never flashes in before being
 * hidden. Deliberately NOT per-org data: it is a presentation preference, holds no personal or
 * financial information, and so needs no account storage — HttpOnly, SameSite=Lax like the session
 * cookie (`~/auth/cookies.server.ts`), long-lived so a dismissal is respected, not re-asked.
 */
const COMPANION_COOKIE = 'saldo_companion';
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/** Whether the companion may show for this request. Default on; only an explicit "off" hides it. */
export function companionEnabled(request: Request): boolean {
  const header = request.headers.get('cookie');
  if (!header) return true;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === COMPANION_COOKIE) {
      return part.slice(eq + 1).trim() !== 'off';
    }
  }
  return true;
}

/** Set-Cookie value persisting the preference. Turning the companion back on clears the cookie. */
export function buildCompanionCookie(enabled: boolean, secure: boolean): string {
  return [
    `${COMPANION_COOKIE}=${enabled ? '' : 'off'}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${enabled ? 0 : ONE_YEAR_SECONDS}`,
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}
