import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ledgerDbAvailable, startRouteHarness, type RouteHarness } from './route-harness.js';

// Needs a real Postgres (Docker/Testcontainers, or SALDO_TEST_PG_URI). Skips cleanly otherwise.

/**
 * Route-level contract test for the MVA screen's filing intent (`intent=submit`, ADR 0063 — a §5.5
 * act). Locks the FAIL-CLOSED posture: with the Altinn integration unconfigured the action returns
 * the typed `not-configured` status, makes no filing record, and never throws. The instance-flow
 * sequencing itself is unit-tested in `~/integrations/altinn`; the filing-record invariants are the
 * `mva-filing` integrity suite. This is purely the action boundary.
 */
type Handler = (a: { request: Request; params: Record<string, string> }) => Promise<unknown>;

describe.skipIf(!ledgerDbAvailable)('orgs/$orgId/mva — the submit intent (fail-closed)', () => {
  let h: RouteHarness;
  let action: Handler;

  beforeAll(async () => {
    h = await startRouteHarness();
    const mod = await import('../../app/routes/orgs.$orgId.mva.js');
    action = mod.action as unknown as Handler;
  });

  afterAll(async () => {
    await h.stop();
  });

  function submitForm(year = '2026', refile = false): FormData {
    const fd = new FormData();
    fd.set('year', year);
    fd.set('intent', 'submit');
    if (refile) fd.set('refile', 'true');
    return fd;
  }

  it('returns not-configured and records NO filing when the integration is off', async () => {
    const org = await h.seedOrg();
    const cookie = await h.sessionCookie(await h.createMember(org.orgId));
    const result = await h.invoke(() =>
      action({
        request: h.request(`/orgs/${org.orgId}/mva`, {
          method: 'POST',
          cookie,
          body: submitForm(),
        }),
        params: { orgId: org.orgId },
      }),
    );
    expect(result).toEqual({ intent: 'submit', status: 'not-configured' });

    const [count] = await h.ledger.sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM mva_filing WHERE organization_id = ${org.orgId}`;
    expect(count!.n).toBe(0);
  });

  it('guards a term that already has a filing: already-filed unless refile is explicit', async () => {
    const org = await h.seedOrg();
    const cookie = await h.sessionCookie(await h.createMember(org.orgId));
    await h.ledger.sql`
      INSERT INTO mva_filing (organization_id, year, term, altinn_party_id, altinn_instance_id)
      VALUES (${org.orgId}, 2026, 'aar', '51234', ${crypto.randomUUID()})`;

    // Without the explicit refile confirm the duplicate is stopped BEFORE any external call.
    const blocked = await h.invoke(() =>
      action({
        request: h.request(`/orgs/${org.orgId}/mva`, {
          method: 'POST',
          cookie,
          body: submitForm(),
        }),
        params: { orgId: org.orgId },
      }),
    );
    expect(blocked).toEqual({ intent: 'submit', status: 'already-filed' });

    // With refile=true the re-filing proceeds — and fails closed on the unconfigured integration.
    const refiled = await h.invoke(() =>
      action({
        request: h.request(`/orgs/${org.orgId}/mva`, {
          method: 'POST',
          cookie,
          body: submitForm('2026', true),
        }),
        params: { orgId: org.orgId },
      }),
    );
    expect(refiled).toEqual({ intent: 'submit', status: 'not-configured' });

    const [count] = await h.ledger.sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM mva_filing WHERE organization_id = ${org.orgId}`;
    expect(count!.n).toBe(1); // still only the seeded row — nothing recorded on either attempt
  });

  it('403 for a member of another org (tenancy before any integration call)', async () => {
    const org = await h.seedOrg();
    const outsider = await h.sessionCookie(await h.createMember(null));
    const res = await h.invoke(() =>
      action({
        request: h.request(`/orgs/${org.orgId}/mva`, {
          method: 'POST',
          cookie: outsider,
          body: submitForm(),
        }),
        params: { orgId: org.orgId },
      }),
    );
    expect((res as Response).status).toBe(403);
  });
});
