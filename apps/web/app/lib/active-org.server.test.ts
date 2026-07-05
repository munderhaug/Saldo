import { describe, expect, it } from 'vitest';
import { buildActiveOrgCookie, readActiveOrg } from './active-org.server';

const ORG = '3b241101-e2bb-4255-8caf-4136c566a962';

function withCookie(cookie?: string): Request {
  return new Request('http://localhost/', cookie ? { headers: { cookie } } : undefined);
}

describe('active-org cookie (ADR 0060: a navigation hint, never an authz input)', () => {
  it('reads back the remembered org, also among other cookies', () => {
    expect(readActiveOrg(withCookie(`saldo_active_org=${ORG}`))).toBe(ORG);
    expect(readActiveOrg(withCookie(`saldo_session=abc; saldo_active_org=${ORG}`))).toBe(ORG);
  });

  it('yields null when absent, empty, or not a UUID (a forged value never propagates)', () => {
    expect(readActiveOrg(withCookie())).toBeNull();
    expect(readActiveOrg(withCookie('saldo_active_org='))).toBeNull();
    expect(readActiveOrg(withCookie('saldo_active_org=banana'))).toBeNull();
    expect(readActiveOrg(withCookie('saldo_active_org=../../etc'))).toBeNull();
    expect(readActiveOrg(withCookie('saldo_session=abc'))).toBeNull();
  });

  it('round-trips through the built cookie', () => {
    const cookie = buildActiveOrgCookie(ORG, false);
    expect(readActiveOrg(withCookie(cookie.split(';')[0]))).toBe(ORG);
  });

  it('is HttpOnly + SameSite=Lax + long-lived like the session cookie, Secure only in production', () => {
    const cookie = buildActiveOrgCookie(ORG, true);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('Max-Age=31536000');
    expect(buildActiveOrgCookie(ORG, false)).not.toContain('Secure');
  });
});
