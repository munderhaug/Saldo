import {
  ledgerDbAvailable,
  seedOrg,
  startLedgerDb,
  type LedgerDb,
  type SeededOrg,
} from '../integrity/db-harness.js';

export { ledgerDbAvailable };

/**
 * Route-test harness. There is no RR7 server in these tests — a loader/action is a plain async
 * function of `{ request, params }`, so we call it directly. The only obstacle is the `db` singleton in
 * `~/db/client`, which builds its connection from `env.DATABASE_URL` at IMPORT time. So: start a real
 * throwaway DB, point `DATABASE_URL` at its `saldo_app` connection, and only THEN dynamically import the
 * app layer — the route handlers then run against this DB as the non-owner role, with RLS in force,
 * exactly like production.
 *
 * Test files MUST import only from this harness (and dynamically import route modules INSIDE the test,
 * after `startRouteHarness()` has set `DATABASE_URL`) — never statically import an app module that
 * transitively pulls in `~/db/client`, or it would bind to the wrong connection. Gate suites with
 * `describe.skipIf(!ledgerDbAvailable)` like the integrity suites.
 */
const HOST = 'localhost:3000';
const ORIGIN = 'http://localhost:3000';

export interface RouteHarness {
  readonly ledger: LedgerDb;
  /** Seed an isolated org (owner connection, RLS-free): accounts + an open + a locked period. */
  seedOrg(): Promise<SeededOrg>;
  /** Create a user and, when `orgId` is given, a membership in it. Returns the user id. */
  createMember(orgId: string | null, role?: 'owner' | 'member'): Promise<string>;
  /** A `Cookie` header value carrying a fresh, valid session for the user. */
  sessionCookie(userId: string): Promise<string>;
  /** Build a Request; adds the session cookie and (for non-GET) a same-origin Origin/Host pair. */
  request(path: string, opts?: RequestOpts): Request;
  /** Run a loader/action, returning the thrown Response (redirect / 404 / 403) or its return value. */
  invoke<T>(fn: () => Promise<T>): Promise<T | Response>;
  stop(): Promise<void>;
}

interface RequestOpts {
  readonly method?: string;
  readonly cookie?: string;
  readonly body?: FormData;
  /** Default true; set false to omit the Origin header so assertSameOrigin rejects a non-GET. */
  readonly sameOrigin?: boolean;
}

export async function startRouteHarness(): Promise<RouteHarness> {
  const ledger = await startLedgerDb();
  // Point the app db singleton at THIS run's DB before importing any app module that builds it.
  process.env.DATABASE_URL = ledger.appUri;
  const { db } = await import('../../app/db/client.js');
  const { createUserWithPassword } = await import('../../app/auth/users.server.js');
  const { createSession, generateSessionToken } = await import('../../app/auth/session.server.js');

  let userSeq = 0;
  return {
    ledger,
    seedOrg: () => seedOrg(ledger.sql),
    async createMember(orgId, role = 'owner') {
      userSeq += 1;
      const user = await createUserWithPassword(
        db,
        `route.${userSeq}.${Date.now()}@example.no`,
        'secret123',
      );
      if (orgId) {
        await ledger.sql`
          INSERT INTO membership (user_id, organization_id, role)
          VALUES (${user.id}, ${orgId}, ${role})`;
      }
      return user.id;
    },
    async sessionCookie(userId) {
      const token = generateSessionToken();
      await createSession(db, token, userId);
      return `saldo_session=${token}`;
    },
    request(path, opts = {}) {
      const headers: Record<string, string> = { host: HOST };
      if (opts.cookie) headers.cookie = opts.cookie;
      if ((opts.sameOrigin ?? true) && (opts.method ?? 'GET') !== 'GET') headers.origin = ORIGIN;
      return new Request(`${ORIGIN}${path}`, {
        method: opts.method ?? 'GET',
        headers,
        ...(opts.body ? { body: opts.body } : {}),
      });
    },
    async invoke(fn) {
      try {
        return await fn();
      } catch (e) {
        if (e instanceof Response) return e;
        throw e;
      }
    },
    stop: () => ledger.stop(),
  };
}
