import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ledgerDbAvailable, startRouteHarness, type RouteHarness } from './route-harness.js';

// Needs a real Postgres (Docker/Testcontainers, or SALDO_TEST_PG_URI). Skips cleanly otherwise.

/**
 * Route-level contract tests for the two statutory XML export routes (review §9 — no route-level
 * header/404 tests existed). They assert the HTTP RESPONSE CONTRACT — status, the exact download
 * headers, the residency-relevant `Cache-Control: private, no-store` — and, through these resource
 * routes, the shared `withUserOrg` auth/tenancy chain: a missing session redirects, a non-member is
 * 403, a malformed/under-threshold org is 404. The pure builders are covered by the domain suites; this
 * is purely the boundary.
 */
type Loader = (args: { request: Request; params: Record<string, string> }) => Promise<Response>;

describe.skipIf(!ledgerDbAvailable)('XML export routes — response + auth/tenancy contract', () => {
  let h: RouteHarness;
  let saftLoader: Loader;
  let mvaLoader: Loader;
  let orgSeq = 0;

  beforeAll(async () => {
    h = await startRouteHarness();
    // Import the routes ONLY after the harness has pointed DATABASE_URL at the test DB.
    saftLoader = (await import('../../app/routes/orgs.$orgId.saft[.xml].js'))
      .loader as unknown as Loader;
    mvaLoader = (await import('../../app/routes/orgs.$orgId.mva[.xml].js'))
      .loader as unknown as Loader;
  });

  afterAll(async () => {
    await h.stop();
  });

  /** Insert a bare org with a chosen MVA status (owner connection); returns its id. */
  async function orgWithStatus(status: string): Promise<string> {
    orgSeq += 1;
    const [org] = await h.ledger.sql<{ id: string }[]>`
      INSERT INTO organization (org_nr, name, mva_status)
      VALUES (${String(960000000 + orgSeq)}, ${'Route ENK ' + orgSeq}, ${status})
      RETURNING id`;
    return org!.id;
  }

  /** Invoke a resource-route loader at `path` (with an optional session cookie) and return the Response. */
  function call(loader: Loader, path: string, orgId: string, cookie?: string): Promise<Response> {
    const request = h.request(path, cookie ? { cookie } : {});
    return h.invoke(() => loader({ request, params: { orgId } }));
  }
  const saftPath = (orgId: string) => `/orgs/${orgId}/saft.xml?year=2026`;
  const mvaPath = (orgId: string) => `/orgs/${orgId}/mva.xml?year=2026`;

  // ── saft.xml ──
  it('saft.xml: 404 on a non-uuid org id (before any auth)', async () => {
    const res = await call(saftLoader, saftPath('not-a-uuid'), 'not-a-uuid');
    expect(res.status).toBe(404);
  });

  it('saft.xml: redirects to /auth/login when there is no session', async () => {
    const org = await h.seedOrg();
    const res = await call(saftLoader, saftPath(org.orgId), org.orgId); // no cookie
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/auth/login');
  });

  it('saft.xml: 403 for a valid user who is not a member of the org', async () => {
    const org = await h.seedOrg();
    const outsiderId = await h.createMember(null); // a user with NO membership
    const cookie = await h.sessionCookie(outsiderId);
    const res = await call(saftLoader, saftPath(org.orgId), org.orgId, cookie);
    expect(res.status).toBe(403);
  });

  it('saft.xml: 200 with the exact download headers for a member', async () => {
    const org = await h.seedOrg();
    const userId = await h.createMember(org.orgId);
    const cookie = await h.sessionCookie(userId);
    const res = await call(saftLoader, saftPath(org.orgId), org.orgId, cookie);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/xml; charset=utf-8');
    expect(res.headers.get('content-disposition')).toBe(
      'attachment; filename="saf-t-financial-2026.xml"',
    );
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    const body = await res.text();
    expect(body).toContain('<AuditFile'); // well-formed SAF-T root (builder content is tested elsewhere)
  });

  // ── mva.xml ──
  it('mva.xml: 404 for an under-threshold org (no melding to file)', async () => {
    const orgId = await orgWithStatus('under_threshold');
    const cookie = await h.sessionCookie(await h.createMember(orgId));
    const res = await call(mvaLoader, mvaPath(orgId), orgId, cookie);
    expect(res.status).toBe(404);
  });

  it('mva.xml: 200 with the mva-melding download headers for a registered member', async () => {
    const org = await h.seedOrg(); // registered_standard
    const cookie = await h.sessionCookie(await h.createMember(org.orgId));
    const res = await call(mvaLoader, mvaPath(org.orgId), org.orgId, cookie);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/xml; charset=utf-8');
    expect(res.headers.get('content-disposition')).toBe(
      'attachment; filename="mva-melding-2026.xml"',
    );
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });
});
