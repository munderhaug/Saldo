import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ledgerDbAvailable, startRouteHarness, type RouteHarness } from './route-harness.js';

// Needs a real Postgres (Docker/Testcontainers, or SALDO_TEST_PG_URI). Skips cleanly otherwise.

/**
 * Route-level tests for the org payout-account settings route (orgs.$orgId.settings) — the surface that
 * populates organization.invoice_payment_account[_name] (emitted as the EHF cac:PayeeFinancialAccount).
 * Locks the read/write/validation wiring: the parse channel returns a typed {error}; a shape-valid but
 * checksum-invalid account is rejected; the happy path stores the normalized account and redirects;
 * '' clears the column; tenancy + CSRF are enforced.
 */
type Handler = (a: { request: Request; params: Record<string, string> }) => Promise<unknown>;

describe.skipIf(!ledgerDbAvailable)('orgs/$orgId/settings — payout account loader + action', () => {
  let h: RouteHarness;
  let loader: Handler;
  let action: Handler;

  beforeAll(async () => {
    h = await startRouteHarness();
    const mod = await import('../../app/routes/orgs.$orgId.settings.js');
    loader = mod.loader as unknown as Handler;
    action = mod.action as unknown as Handler;
  });

  afterAll(async () => {
    await h.stop();
  });

  function payoutForm(over: Record<string, string> = {}): FormData {
    const fd = new FormData();
    const fields: Record<string, string> = {
      invoicePaymentAccount: '8601.11.17947', // a mod-11-valid BBAN, written with dots
      invoicePaymentAccountName: 'Test ENK',
      ...over,
    };
    for (const [k, value] of Object.entries(fields)) fd.set(k, value);
    return fd;
  }

  async function payoutOf(orgId: string) {
    const [row] = await h.ledger.sql<{ account: string | null; name: string | null }[]>`
      SELECT invoice_payment_account AS account, invoice_payment_account_name AS name
        FROM organization WHERE id = ${orgId}`;
    return row!;
  }

  it('loader: 404 on a non-uuid org id', async () => {
    const res = await h.invoke(() =>
      loader({ request: h.request('/orgs/x/settings'), params: { orgId: 'x' } }),
    );
    expect((res as Response).status).toBe(404);
  });

  it('loader: 403 for a non-member; 200 with a null account for a member', async () => {
    const org = await h.seedOrg();
    const outsider = await h.sessionCookie(await h.createMember(null));
    const denied = await h.invoke(() =>
      loader({
        request: h.request(`/orgs/${org.orgId}/settings`, { cookie: outsider }),
        params: { orgId: org.orgId },
      }),
    );
    expect((denied as Response).status).toBe(403);

    const cookie = await h.sessionCookie(await h.createMember(org.orgId));
    const ok = (await h.invoke(() =>
      loader({
        request: h.request(`/orgs/${org.orgId}/settings`, { cookie }),
        params: { orgId: org.orgId },
      }),
    )) as { org: { invoicePaymentAccount: string | null } };
    expect(ok.org.invoicePaymentAccount).toBeNull();
  });

  it('action: 403 (CSRF) on a non-GET with no matching Origin', async () => {
    const org = await h.seedOrg();
    const cookie = await h.sessionCookie(await h.createMember(org.orgId));
    const res = await h.invoke(() =>
      action({
        request: h.request(`/orgs/${org.orgId}/settings`, {
          method: 'POST',
          cookie,
          body: payoutForm(),
          sameOrigin: false,
        }),
        params: { orgId: org.orgId },
      }),
    );
    expect((res as Response).status).toBe(403);
  });

  it('action: a shape-invalid account returns {error} (parse channel), writes nothing', async () => {
    const org = await h.seedOrg();
    const cookie = await h.sessionCookie(await h.createMember(org.orgId));
    const res = await h.invoke(() =>
      action({
        request: h.request(`/orgs/${org.orgId}/settings`, {
          method: 'POST',
          cookie,
          body: payoutForm({ invoicePaymentAccount: '123' }), // too short for the shape
        }),
        params: { orgId: org.orgId },
      }),
    );
    expect(res).toHaveProperty('error');
    expect(res).not.toBeInstanceOf(Response);
    expect((await payoutOf(org.orgId)).account).toBeNull();
  });

  it('action: a shape-valid but checksum-invalid account returns {error}, writes nothing', async () => {
    const org = await h.seedOrg();
    const cookie = await h.sessionCookie(await h.createMember(org.orgId));
    const res = await h.invoke(() =>
      action({
        request: h.request(`/orgs/${org.orgId}/settings`, {
          method: 'POST',
          cookie,
          body: payoutForm({ invoicePaymentAccount: '86011117948' }), // wrong mod-11 control digit
        }),
        params: { orgId: org.orgId },
      }),
    );
    expect(res).toHaveProperty('error');
    expect(res).not.toBeInstanceOf(Response);
    expect((await payoutOf(org.orgId)).account).toBeNull();
  });

  it('action: happy path stores the normalized account + name and redirects to the overview', async () => {
    const org = await h.seedOrg();
    const cookie = await h.sessionCookie(await h.createMember(org.orgId));
    const res = await h.invoke(() =>
      action({
        request: h.request(`/orgs/${org.orgId}/settings`, {
          method: 'POST',
          cookie,
          body: payoutForm(),
        }),
        params: { orgId: org.orgId },
      }),
    );
    expect((res as Response).status).toBe(302);
    expect((res as Response).headers.get('location')).toBe(`/orgs/${org.orgId}`);
    expect(await payoutOf(org.orgId)).toEqual({ account: '86011117947', name: 'Test ENK' });
  });

  it('action: an empty account clears the column', async () => {
    const org = await h.seedOrg();
    const cookie = await h.sessionCookie(await h.createMember(org.orgId));
    await h.ledger.sql`UPDATE organization
                          SET invoice_payment_account = '86011117947',
                              invoice_payment_account_name = 'Old'
                        WHERE id = ${org.orgId}`;
    const res = await h.invoke(() =>
      action({
        request: h.request(`/orgs/${org.orgId}/settings`, {
          method: 'POST',
          cookie,
          body: payoutForm({ invoicePaymentAccount: '', invoicePaymentAccountName: '' }),
        }),
        params: { orgId: org.orgId },
      }),
    );
    expect((res as Response).status).toBe(302);
    expect(await payoutOf(org.orgId)).toEqual({ account: null, name: null });
  });

  it('action: a member of org A cannot change org B (403, nothing written)', async () => {
    const a = await h.seedOrg();
    const b = await h.seedOrg();
    const cookie = await h.sessionCookie(await h.createMember(a.orgId));
    const res = await h.invoke(() =>
      action({
        request: h.request(`/orgs/${b.orgId}/settings`, {
          method: 'POST',
          cookie,
          body: payoutForm(),
        }),
        params: { orgId: b.orgId },
      }),
    );
    expect((res as Response).status).toBe(403);
    expect((await payoutOf(b.orgId)).account).toBeNull();
  });
});
