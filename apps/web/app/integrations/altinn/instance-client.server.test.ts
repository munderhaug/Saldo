import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { completeMeldingInstance, openMeldingInstance } from './instance-client.server';
import { resolveAltinnConfig } from './config.server';

const GUID = 'e2c1b0e0-1111-4222-8333-444455556666';
const ELEMENT = '7f9a2d10-aaaa-4bbb-8ccc-dddeeefff000';
const INSTANCE = {
  id: `51234/${GUID}`,
  data: [
    { id: ELEMENT, dataType: 'no.skatteetaten.fastsetting.avgift.mva.mvameldinginnsending.v0.1' },
  ],
};
const XMLS = { innsendingXml: '<env/>', meldingXml: '<melding/>' };

/** Route each call of the captured sequence by URL/method; unlisted → 500. */
function stubSequence(
  overrides: Partial<
    Record<'exchange' | 'create' | 'envelope' | 'melding' | 'next', () => Response>
  > = {},
) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      calls.push(`${method} ${url}`);
      if (url.includes('/exchange/id-porten'))
        return Promise.resolve(overrides.exchange?.() ?? new Response('"altinn-token"'));
      if (method === 'POST' && url.endsWith('/instances'))
        return Promise.resolve(overrides.create?.() ?? Response.json(INSTANCE, { status: 201 }));
      if (method === 'PUT' && url.includes(`/data/${ELEMENT}`))
        return Promise.resolve(overrides.envelope?.() ?? new Response('', { status: 201 }));
      if (method === 'POST' && url.includes('/data?dataType=mvamelding'))
        return Promise.resolve(overrides.melding?.() ?? new Response('', { status: 201 }));
      if (method === 'PUT' && url.endsWith('/process/next'))
        return Promise.resolve(overrides.next?.() ?? new Response('', { status: 200 }));
      return Promise.resolve(new Response('', { status: 500 }));
    }),
  );
  return calls;
}

/** Run both phases as the route action does; returns every call for sequence assertions. */
async function submitBothPhases() {
  const opened = await openMeldingInstance('974760673');
  if (!opened.ok) return { opened, done: null };
  const done = await completeMeldingInstance({ handle: opened.handle, ...XMLS });
  return { opened, done };
}

beforeEach(() => {
  process.env.ALTINN_EU_RESIDENT = 'true';
  process.env.ALTINN_APPS_BASE_URL = 'https://skd.apps.tt02.altinn.no';
  process.env.ALTINN_PLATFORM_BASE_URL = 'https://platform.tt02.altinn.no';
  process.env.ALTINN_APP_ID = 'skd/mva-melding-innsending-etm2';
  process.env.ALTINN_ID_PORTEN_TOKEN = 'idp-token';
});
afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of [
    'ALTINN_EU_RESIDENT',
    'ALTINN_APPS_BASE_URL',
    'ALTINN_PLATFORM_BASE_URL',
    'ALTINN_APP_ID',
    'ALTINN_ID_PORTEN_TOKEN',
  ])
    delete process.env[k];
});

describe('resolveAltinnConfig — the fail-closed residency gate', () => {
  it('is null without the EU-residency assertion, even fully configured otherwise', () => {
    expect(
      resolveAltinnConfig({
        ALTINN_APPS_BASE_URL: 'https://a',
        ALTINN_PLATFORM_BASE_URL: 'https://p',
        ALTINN_APP_ID: 'skd/app',
        ALTINN_ID_PORTEN_TOKEN: 't',
      }),
    ).toBeNull();
  });

  it('is null when any endpoint or the token is missing', () => {
    expect(resolveAltinnConfig({ ALTINN_EU_RESIDENT: 'true' })).toBeNull();
  });

  it('trims trailing slashes and the app id', () => {
    const c = resolveAltinnConfig({
      ALTINN_EU_RESIDENT: 'true',
      ALTINN_APPS_BASE_URL: 'https://apps.example/',
      ALTINN_PLATFORM_BASE_URL: 'https://platform.example//',
      ALTINN_APP_ID: '/skd/app/',
      ALTINN_ID_PORTEN_TOKEN: ' t ',
    });
    expect(c).toEqual({
      appsBaseUrl: 'https://apps.example',
      platformBaseUrl: 'https://platform.example',
      appId: 'skd/app',
      idPortenToken: 't',
    });
  });
});

describe('openMeldingInstance — phase 1 (exchange + create)', () => {
  it('returns not-configured (no external call) when the gate is closed', async () => {
    delete process.env.ALTINN_EU_RESIDENT;
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    expect(await openMeldingInstance('974760673')).toEqual({
      ok: false,
      reason: 'not-configured',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns the pinned pointer + the continuation handle', async () => {
    stubSequence();
    const opened = await openMeldingInstance('974760673');
    expect(opened).toEqual({
      ok: true,
      partyId: '51234',
      instanceGuid: GUID,
      handle: {
        altinnToken: 'altinn-token',
        instanceUrl: `https://skd.apps.tt02.altinn.no/skd/mva-melding-innsending-etm2/instances/51234/${GUID}`,
        envelopeElementId: ELEMENT,
      },
    });
  });

  it('maps a 403 on instance creation (missing Altinn role) to auth-failed', async () => {
    stubSequence({ create: () => new Response('', { status: 403 }) });
    expect(await openMeldingInstance('974760673')).toEqual({ ok: false, reason: 'auth-failed' });
  });

  it('maps exchange 401/403 to auth-failed but a platform outage (5xx) to error', async () => {
    stubSequence({ exchange: () => new Response('', { status: 401 }) });
    expect(await openMeldingInstance('974760673')).toEqual({ ok: false, reason: 'auth-failed' });
    stubSequence({ exchange: () => new Response('', { status: 503 }) });
    expect(await openMeldingInstance('974760673')).toEqual({ ok: false, reason: 'error' });
  });

  it('rejects a non-pinned instance id (path-traversal material) as invalid-response', async () => {
    stubSequence({
      create: () => Response.json({ id: `../evil/${GUID}`, data: INSTANCE.data }, { status: 201 }),
    });
    expect(await openMeldingInstance('974760673')).toEqual({
      ok: false,
      reason: 'invalid-response',
    });
  });

  it('maps an instance without the innsending data element to invalid-response', async () => {
    stubSequence({ create: () => Response.json({ id: `5/${GUID}`, data: [] }, { status: 201 }) });
    expect(await openMeldingInstance('974760673')).toEqual({
      ok: false,
      reason: 'invalid-response',
    });
  });

  it('maps a network throw to error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('boom'))),
    );
    expect(await openMeldingInstance('974760673')).toEqual({ ok: false, reason: 'error' });
  });
});

describe('the full two-phase sequence — as the route action drives it', () => {
  it('runs exchange → create → envelope PUT → melding POST → process/next ×2, in order', async () => {
    const calls = stubSequence();
    const { opened, done } = await submitBothPhases();
    expect(opened.ok).toBe(true);
    expect(done).toEqual({ ok: true });
    const base = `https://skd.apps.tt02.altinn.no/skd/mva-melding-innsending-etm2/instances/51234/${GUID}`;
    expect(calls).toEqual([
      'GET https://platform.tt02.altinn.no/authentication/api/v1/exchange/id-porten',
      'POST https://skd.apps.tt02.altinn.no/skd/mva-melding-innsending-etm2/instances',
      `PUT ${base}/data/${ELEMENT}`,
      `POST ${base}/data?dataType=mvamelding`,
      `PUT ${base}/process/next`,
      `PUT ${base}/process/next`,
    ]);
  });

  it('maps the app validation 409 at process/next to rejected (phase 2)', async () => {
    stubSequence({ next: () => new Response('', { status: 409 }) });
    const { done } = await submitBothPhases();
    expect(done).toEqual({ ok: false, reason: 'rejected' });
  });

  it('maps an expired token at upload to auth-failed (phase 2)', async () => {
    stubSequence({ envelope: () => new Response('', { status: 401 }) });
    const { done } = await submitBothPhases();
    expect(done).toEqual({ ok: false, reason: 'auth-failed' });
  });
});
