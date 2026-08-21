import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ledgerDbAvailable, startRouteHarness, type RouteHarness } from './route-harness.js';
// Type-only imports (erased at runtime — the values are dynamically imported after the harness sets
// DATABASE_URL, so the db singleton binds to this run's DB):
import type { db as DbValue } from '../../app/db/client.js';
import type { findUserByEmail as FindUserByEmailFn } from '../../app/auth/users.server.js';

// Needs a real Postgres (Docker/Testcontainers, or SALDO_TEST_PG_URI). Skips cleanly otherwise.

/**
 * Route-level tests for the login action's `register` intent — the first-run account-creation path of
 * the dev password provider (ADR 0064). `DEV_AUTH=true` is set BEFORE the harness imports the app
 * layer, because `devAuthEnabled` is computed at `~/env` import time; the disabled-in-production
 * branch is structural (`&& !isProd`) and covered by env.ts, not re-testable in-process.
 */
type Handler = (a: { request: Request; params: Record<string, string> }) => Promise<unknown>;

function credentials(email: string, password: string, intent?: string): FormData {
  const body = new FormData();
  if (intent) body.set('intent', intent);
  body.set('email', email);
  body.set('password', password);
  return body;
}

describe.skipIf(!ledgerDbAvailable)('auth login — register intent', () => {
  let h: RouteHarness;
  let loginAction: Handler;
  let db: typeof DbValue;
  let findUserByEmail: typeof FindUserByEmailFn;

  beforeAll(async () => {
    process.env.DEV_AUTH = 'true';
    h = await startRouteHarness();
    loginAction = (await import('../../app/routes/auth.login.js')).action as unknown as Handler;
    ({ db } = await import('../../app/db/client.js'));
    ({ findUserByEmail } = await import('../../app/auth/users.server.js'));
  });

  afterAll(async () => {
    await h.stop();
  });

  it('creates the account, starts a session, and the account can then log in', async () => {
    const email = `register.${Date.now()}@example.no`;
    const registered = await h.invoke(() =>
      loginAction({
        request: h.request('/auth/login', {
          method: 'POST',
          body: credentials(email, 'hunter2-hunter2', 'register'),
        }),
        params: {},
      }),
    );
    expect(registered).toBeInstanceOf(Response);
    expect((registered as Response).status).toBe(302);
    expect((registered as Response).headers.get('Location')).toBe('/');
    expect((registered as Response).headers.get('Set-Cookie')).toContain('saldo_session=');
    expect(await findUserByEmail(db, email)).not.toBeNull();

    const loggedIn = await h.invoke(() =>
      loginAction({
        request: h.request('/auth/login', {
          method: 'POST',
          body: credentials(email, 'hunter2-hunter2'),
        }),
        params: {},
      }),
    );
    expect((loggedIn as Response).status).toBe(302);
  });

  it('refuses a taken email with a calm error, not an exception', async () => {
    const email = `taken.${Date.now()}@example.no`;
    await h.invoke(() =>
      loginAction({
        request: h.request('/auth/login', {
          method: 'POST',
          body: credentials(email, 'hunter2-hunter2', 'register'),
        }),
        params: {},
      }),
    );
    const again = await h.invoke(() =>
      loginAction({
        request: h.request('/auth/login', {
          method: 'POST',
          body: credentials(email, 'another-password', 'register'),
        }),
        params: {},
      }),
    );
    expect(again).toHaveProperty('error');
  });

  it('rejects invalid input (short password) before touching the db', async () => {
    const result = await h.invoke(() =>
      loginAction({
        request: h.request('/auth/login', {
          method: 'POST',
          body: credentials(`short.${Date.now()}@example.no`, 'short', 'register'),
        }),
        params: {},
      }),
    );
    expect(result).toHaveProperty('error');
  });
});
