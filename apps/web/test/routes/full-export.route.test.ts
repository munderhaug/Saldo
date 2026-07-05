import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ledgerDbAvailable, startRouteHarness, type RouteHarness } from './route-harness.js';

// Needs a real Postgres (Docker/Testcontainers, or SALDO_TEST_PG_URI). Skips cleanly otherwise.

/**
 * Route-level contract test for the full raw data export (`/orgs/:orgId/export.json`, ADR 0062 — the
 * GDPR Art. 20 / anti-lock-in download). Asserts the HTTP RESPONSE CONTRACT — status, the download
 * headers, the residency-relevant `Cache-Control: private, no-store` — and, through the resource
 * route, the shared `withUserOrg` auth/tenancy chain. The exported DATA (RLS scoping, table
 * coverage) is proven by `test/integrity/audit-log.integration.test.ts`; this is purely the boundary.
 */
type Loader = (args: { request: Request; params: Record<string, string> }) => Promise<Response>;

describe.skipIf(!ledgerDbAvailable)('export.json — response + auth/tenancy contract', () => {
  let h: RouteHarness;
  let exportLoader: Loader;

  beforeAll(async () => {
    h = await startRouteHarness();
    // Import the route ONLY after the harness has pointed DATABASE_URL at the test DB.
    exportLoader = (await import('../../app/routes/orgs.$orgId.export[.json].js'))
      .loader as unknown as Loader;
  });

  afterAll(async () => {
    await h.stop();
  });

  /** Invoke the loader at the export path (with an optional session cookie) and return the Response. */
  function call(orgId: string, cookie?: string): Promise<Response> {
    const request = h.request(`/orgs/${orgId}/export.json`, cookie ? { cookie } : {});
    return h.invoke(() => exportLoader({ request, params: { orgId } }));
  }

  it('404 on a non-uuid org id (before any auth)', async () => {
    const res = await call('not-a-uuid');
    expect(res.status).toBe(404);
  });

  it('redirects to /auth/login when there is no session', async () => {
    const org = await h.seedOrg();
    const res = await call(org.orgId); // no cookie
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/auth/login');
  });

  it('403 for a valid user who is not a member of the org', async () => {
    const org = await h.seedOrg();
    const outsiderId = await h.createMember(null); // a user with NO membership
    const cookie = await h.sessionCookie(outsiderId);
    const res = await call(org.orgId, cookie);
    expect(res.status).toBe(403);
  });

  it('200 with the exact download headers and the versioned export shape for a member', async () => {
    const org = await h.seedOrg();
    const cookie = await h.sessionCookie(await h.createMember(org.orgId));
    const res = await call(org.orgId, cookie);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(res.headers.get('content-disposition')).toMatch(
      /^attachment; filename="saldo-eksport-\d{4}-\d{2}-\d{2}\.json"$/,
    );
    expect(res.headers.get('cache-control')).toBe('private, no-store');

    const body = (await res.json()) as Record<string, unknown>;
    expect(body['format']).toBe('saldo-full-export');
    expect(body['version']).toBe(1);
    expect((body['organization'] as { id: string }).id).toBe(org.orgId);
    // The provisioned registers ride along; the trail key exists from day one.
    expect((body['accounts'] as unknown[]).length).toBeGreaterThan(0);
    expect(Array.isArray(body['auditLog'])).toBe(true);
  });
});
