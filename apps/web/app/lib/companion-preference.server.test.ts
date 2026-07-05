import { describe, expect, it } from 'vitest';
import { buildCompanionCookie, companionEnabled } from './companion-preference.server';

function withCookie(cookie?: string): Request {
  return new Request('http://localhost/', cookie ? { headers: { cookie } } : undefined);
}

describe('companion preference cookie (ADR 0058: dismissible, never nags)', () => {
  it('defaults to on — no cookie, an empty value, or an unknown value all show the companion', () => {
    expect(companionEnabled(withCookie())).toBe(true);
    expect(companionEnabled(withCookie('saldo_companion='))).toBe(true);
    expect(companionEnabled(withCookie('saldo_companion=banana'))).toBe(true);
    expect(companionEnabled(withCookie('saldo_session=abc'))).toBe(true);
  });

  it('an explicit "off" hides it, also among other cookies', () => {
    expect(companionEnabled(withCookie('saldo_companion=off'))).toBe(false);
    expect(companionEnabled(withCookie('saldo_session=abc; saldo_companion=off'))).toBe(false);
  });

  it('round-trips: the built dismissal cookie reads back as off, the re-enable clears it', () => {
    const off = buildCompanionCookie(false, false);
    expect(companionEnabled(withCookie(off.split(';')[0]))).toBe(false);
    // Turning it back on writes an expired empty value — the browser drops the cookie, and the
    // empty value reads as on either way.
    const on = buildCompanionCookie(true, false);
    expect(on).toContain('Max-Age=0');
    expect(companionEnabled(withCookie(on.split(';')[0]))).toBe(true);
  });

  it('is HttpOnly + SameSite=Lax like the session cookie, Secure only in production', () => {
    const cookie = buildCompanionCookie(false, true);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('Secure');
    expect(buildCompanionCookie(false, false)).not.toContain('Secure');
  });
});
