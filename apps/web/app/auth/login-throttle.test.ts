import { describe, expect, it } from 'vitest';
import { checkLoginRate, loginCallerKey } from './login-throttle.server';

// The limiters are module singletons, so each test uses fresh IP/email keys to stay isolated. `now` is
// injected; the window is 15 min, per-IP cap 20, per-account cap 10.
const WINDOW_MS = 15 * 60_000;
const t0 = 1_000_000;

describe('loginCallerKey', () => {
  it('uses the first X-Forwarded-For hop', () => {
    const req = new Request('http://x', {
      headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' },
    });
    expect(loginCallerKey(req)).toBe('203.0.113.7');
  });

  it('falls back to a shared global bucket when the header is absent', () => {
    expect(loginCallerKey(new Request('http://x'))).toBe('global');
  });
});

describe('checkLoginRate', () => {
  it('caps attempts per account (10/window), then refuses', () => {
    const ip = 'ip-acct';
    const email = 'acct@example.no';
    for (let i = 0; i < 10; i++) expect(checkLoginRate(ip, email, t0 + i)).toBe(true);
    expect(checkLoginRate(ip, email, t0 + 11)).toBe(false);
  });

  it('caps attempts per IP (20/window) even across distinct accounts', () => {
    const ip = 'ip-spray';
    for (let i = 0; i < 20; i++) expect(checkLoginRate(ip, `u${i}@example.no`, t0 + i)).toBe(true);
    // 21st distinct account from the same IP is refused by the per-IP limiter.
    expect(checkLoginRate(ip, 'u20@example.no', t0 + 21)).toBe(false);
  });

  it('tracks accounts independently (exhausting one does not block another)', () => {
    const ip = 'ip-iso';
    for (let i = 0; i < 10; i++) checkLoginRate(ip, 'a@example.no', t0 + i);
    expect(checkLoginRate(ip, 'a@example.no', t0 + 10)).toBe(false); // a exhausted
    expect(checkLoginRate('ip-iso-b', 'b@example.no', t0 + 10)).toBe(true); // b untouched
  });

  it('resets once the window elapses', () => {
    const ip = 'ip-reset';
    const email = 'reset@example.no';
    for (let i = 0; i < 10; i++) checkLoginRate(ip, email, t0 + i);
    expect(checkLoginRate(ip, email, t0 + 100)).toBe(false);
    expect(checkLoginRate(ip, email, t0 + WINDOW_MS + 1)).toBe(true);
  });
});
