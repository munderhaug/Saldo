import { describe, expect, it } from 'vitest';

// No DB is TOUCHED: the /companion action only writes a preference cookie. But `~/env` Zod-parses
// DATABASE_URL at import time (route-harness.ts explains the pattern), so give it a value before the
// dynamic import — nothing ever connects to it.
process.env.DATABASE_URL ??= 'postgres://saldo_app:unused@localhost:5432/saldo';

// The action still sits behind the same-origin guard like every state-changing action.
type ActionResult = Response | Promise<Response>;
type Action = (args: { request: Request; params: Record<string, never> }) => ActionResult;

async function post(form: Record<string, string>, headers: Record<string, string>) {
  const mod = await import('../../app/routes/companion.js');
  const action = mod.action as unknown as Action;
  const body = new FormData();
  for (const [k, v] of Object.entries(form)) body.set(k, v);
  return action({
    request: new Request('http://localhost/companion', { method: 'POST', body, headers }),
    params: {},
  });
}

const sameOrigin = { origin: 'http://localhost', host: 'localhost' };

describe('/companion — the preference action', () => {
  it('dismissal sets the off cookie and returns to the posting page', async () => {
    const res = await post({ companion: 'off', redirectTo: '/orgs/abc/invoices' }, sameOrigin);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/orgs/abc/invoices');
    expect(res.headers.get('set-cookie')).toContain('saldo_companion=off');
  });

  it('re-enabling clears the cookie', async () => {
    const res = await post({ companion: 'on', redirectTo: '/orgs/abc/settings' }, sameOrigin);
    expect(res.status).toBe(302);
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('saldo_companion=');
    expect(cookie).toContain('Max-Age=0');
  });

  it('never redirects off-app: absolute and protocol-relative targets fall back to home', async () => {
    for (const redirectTo of ['https://evil.example/', '//evil.example/x', '']) {
      const res = await post({ companion: 'off', redirectTo }, sameOrigin);
      expect(res.headers.get('location')).toBe('/');
    }
  });

  it('refuses a cross-origin post (CSRF guard), like every state-changing action', async () => {
    await expect(
      post(
        { companion: 'off', redirectTo: '/' },
        { origin: 'https://evil.example', host: 'localhost' },
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
});
