import { existsSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { type LedgerDb, seedOrg, startLedgerDb } from './db-harness.js';
import * as schema from '../../app/db/schema.js';
import {
  createSession,
  generateSessionToken,
  invalidateSession,
  invalidateUserSessions,
  validateSessionToken,
} from '../../app/auth/session.server.js';
import { authenticateWithPassword } from '../../app/auth/dev-auth.server.js';
import {
  createUserWithPassword,
  getMembership,
  getMemberships,
} from '../../app/auth/users.server.js';

// Needs Docker (Testcontainers); skips gracefully where unavailable. Exercises the auth tables on the
// non-owner `saldo_app` connection — the real app path (ADR 0020).
const dockerAvailable = Boolean(process.env.DOCKER_HOST) || existsSync('/var/run/docker.sock');
const DAY = 86_400_000;

describe.skipIf(!dockerAvailable)('Identity & sessions (real Postgres, app role)', () => {
  let ledger: LedgerDb;
  let db: ReturnType<typeof drizzle<typeof schema>>;

  beforeAll(async () => {
    ledger = await startLedgerDb();
    db = drizzle(ledger.appSql, { schema });
  });

  afterAll(async () => {
    await ledger.stop();
  });

  let seq = 0;
  const email = () => `user${(seq += 1)}.${Date.now()}@example.no`;

  it('creates a user with a normalised email and an argon2id hash', async () => {
    const user = await createUserWithPassword(db, '  MixedCase@Example.NO ', 'secret123');
    expect(user.email).toBe('mixedcase@example.no');
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
  });

  it('round-trips a session token via its SHA-256 and resolves the user', async () => {
    const user = await createUserWithPassword(db, email(), 'secret123');
    const token = generateSessionToken();
    const session = await createSession(db, token, user.id);
    expect(session.id).toMatch(/^[0-9a-f]{64}$/);
    expect(session.id).not.toContain(token); // the token itself is never stored

    const valid = await validateSessionToken(db, token);
    expect(valid?.user).toEqual({ id: user.id, email: user.email });
    expect(await validateSessionToken(db, generateSessionToken())).toBeNull();
  });

  it('deletes and rejects an expired session', async () => {
    const user = await createUserWithPassword(db, email(), 'secret123');
    const token = generateSessionToken();
    const base = new Date('2026-01-01T00:00:00Z');
    const session = await createSession(db, token, user.id, base);

    expect(await validateSessionToken(db, token, new Date(base.getTime() + 31 * DAY))).toBeNull();
    const rows = await db
      .select({ id: schema.userSession.id })
      .from(schema.userSession)
      .where(eq(schema.userSession.id, session.id));
    expect(rows).toHaveLength(0);
  });

  it('slides expiry when used within the renewal window', async () => {
    const user = await createUserWithPassword(db, email(), 'secret123');
    const token = generateSessionToken();
    const base = new Date('2026-01-01T00:00:00Z');
    const session = await createSession(db, token, user.id, base);
    expect(session.expiresAt.getTime()).toBe(base.getTime() + 30 * DAY);

    const at = new Date(base.getTime() + 20 * DAY); // 10d left, inside the 15d window
    const slid = await validateSessionToken(db, token, at);
    expect(slid?.session.expiresAt.getTime()).toBe(at.getTime() + 30 * DAY);
  });

  it('invalidates one session and all of a user’s sessions', async () => {
    const user = await createUserWithPassword(db, email(), 'secret123');
    const a = generateSessionToken();
    const b = generateSessionToken();
    await createSession(db, a, user.id);
    await createSession(db, b, user.id);

    await invalidateSession(db, a);
    expect(await validateSessionToken(db, a)).toBeNull();
    expect(await validateSessionToken(db, b)).not.toBeNull();

    await invalidateUserSessions(db, user.id);
    expect(await validateSessionToken(db, b)).toBeNull();
  });

  it('authenticates the dev provider only with the right password', async () => {
    const e = email();
    const user = await createUserWithPassword(db, e, 'secret123');
    expect(await authenticateWithPassword(db, e, 'secret123')).toEqual({ userId: user.id });
    expect(await authenticateWithPassword(db, e, 'nope')).toBeNull();
    expect(await authenticateWithPassword(db, 'ghost@example.no', 'x')).toBeNull();
  });

  it('links a user to an org via membership (FK to an RLS-forced org, no tenant GUC)', async () => {
    const user = await createUserWithPassword(db, email(), 'secret123');
    const org = await seedOrg(ledger.sql);
    // The membership row is written by the app role with NO app.current_org set — the FK check to the
    // RLS-forced organization still resolves (referential checks bypass RLS), which is what lets us
    // look up a user's orgs before any tenant context exists.
    await db.insert(schema.membership).values({
      userId: user.id,
      organizationId: org.orgId,
      role: 'owner',
    });
    expect(await getMemberships(db, user.id)).toEqual([
      { organizationId: org.orgId, role: 'owner' },
    ]);
    expect(await getMembership(db, user.id, org.orgId)).toEqual({
      organizationId: org.orgId,
      role: 'owner',
    });
    expect(await getMembership(db, user.id, '00000000-0000-0000-0000-000000000000')).toBeNull();
  });
});
