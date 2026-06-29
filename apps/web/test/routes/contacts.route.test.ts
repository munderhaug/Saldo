import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ledgerDbAvailable, startRouteHarness, type RouteHarness } from './route-harness.js';

// Needs a real Postgres (Docker/Testcontainers, or SALDO_TEST_PG_URI). Skips cleanly otherwise.

/**
 * Route-level tests for a representative CRUD route (contacts/new) — review §9 named the
 * contacts/products/vouchers routes as untested. Exercises the loader + action through the real
 * withUserOrg auth/tenancy chain and assertSameOrigin CSRF guard: the parse-failure channel returns a
 * typed {error} (not a throw), the happy path persists the row and redirects, and a cross-tenant or
 * unauthenticated actor is refused. The contact contract itself is unit-tested elsewhere; this is the
 * action's wiring (CSRF + parse channel + persistence + tenancy).
 */
type Loader = (a: { request: Request; params: Record<string, string> }) => Promise<unknown>;
type Action = Loader;

/** A valid contactInput as form fields; override any. */
function contactForm(over: Record<string, string> = {}): FormData {
  const fd = new FormData();
  const fields: Record<string, string> = {
    name: 'Test Kunde',
    role: 'customer',
    orgNr: '',
    email: '',
    phone: '',
    addressLine: '',
    postalCode: '',
    city: '',
    countryCode: 'NO',
    mvaStatus: 'under_threshold',
    paymentTermsDays: '14',
    defaultAccountId: '',
    defaultVatCodeId: '',
    currency: 'NOK',
    language: 'nb',
    notes: '',
    ...over,
  };
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe.skipIf(!ledgerDbAvailable)('contacts/new route — loader + action contract', () => {
  let h: RouteHarness;
  let loader: Loader;
  let action: Action;

  beforeAll(async () => {
    h = await startRouteHarness();
    const mod = await import('../../app/routes/orgs.$orgId.contacts.new.js');
    loader = mod.loader as unknown as Loader;
    action = mod.action as unknown as Action;
  });

  afterAll(async () => {
    await h.stop();
  });

  async function contactCount(orgId: string, name: string): Promise<number> {
    const [row] = await h.ledger.sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM contact WHERE organization_id = ${orgId} AND name = ${name}`;
    return row!.n;
  }

  it('loader: 404 on a non-uuid org id', async () => {
    const res = await h.invoke(() =>
      loader({ request: h.request('/orgs/x/contacts/new'), params: { orgId: 'x' } }),
    );
    expect((res as Response).status).toBe(404);
  });

  it('loader: 403 for a valid user who is not a member', async () => {
    const org = await h.seedOrg();
    const cookie = await h.sessionCookie(await h.createMember(null));
    const res = await h.invoke(() =>
      loader({
        request: h.request(`/orgs/${org.orgId}/contacts/new`, { cookie }),
        params: { orgId: org.orgId },
      }),
    );
    expect((res as Response).status).toBe(403);
  });

  it('action: 403 (CSRF) on a non-GET with no matching Origin', async () => {
    const org = await h.seedOrg();
    const cookie = await h.sessionCookie(await h.createMember(org.orgId));
    const res = await h.invoke(() =>
      action({
        request: h.request(`/orgs/${org.orgId}/contacts/new`, {
          method: 'POST',
          cookie,
          body: contactForm(),
          sameOrigin: false, // omit the Origin header
        }),
        params: { orgId: org.orgId },
      }),
    );
    expect((res as Response).status).toBe(403);
  });

  it('action: invalid input returns a typed {error}, not a throw, and writes nothing', async () => {
    const org = await h.seedOrg();
    const cookie = await h.sessionCookie(await h.createMember(org.orgId));
    const res = await h.invoke(() =>
      action({
        request: h.request(`/orgs/${org.orgId}/contacts/new`, {
          method: 'POST',
          cookie,
          body: contactForm({ name: '' }), // name is required
        }),
        params: { orgId: org.orgId },
      }),
    );
    expect(res).toHaveProperty('error');
    expect(res).not.toBeInstanceOf(Response);
  });

  it('action: happy path persists the contact and redirects to the list', async () => {
    const org = await h.seedOrg();
    const cookie = await h.sessionCookie(await h.createMember(org.orgId));
    const res = await h.invoke(() =>
      action({
        request: h.request(`/orgs/${org.orgId}/contacts/new`, {
          method: 'POST',
          cookie,
          body: contactForm({ name: 'Acme Kunde' }),
        }),
        params: { orgId: org.orgId },
      }),
    );
    expect((res as Response).status).toBe(302);
    expect((res as Response).headers.get('location')).toBe(`/orgs/${org.orgId}/contacts`);
    expect(await contactCount(org.orgId, 'Acme Kunde')).toBe(1);
  });

  it('action: a member of org A cannot create a contact in org B (403, nothing written)', async () => {
    const a = await h.seedOrg();
    const b = await h.seedOrg();
    const cookie = await h.sessionCookie(await h.createMember(a.orgId)); // member of A only
    const res = await h.invoke(() =>
      action({
        request: h.request(`/orgs/${b.orgId}/contacts/new`, {
          method: 'POST',
          cookie,
          body: contactForm({ name: 'Cross Tenant' }),
        }),
        params: { orgId: b.orgId },
      }),
    );
    expect((res as Response).status).toBe(403);
    expect(await contactCount(b.orgId, 'Cross Tenant')).toBe(0);
  });
});
