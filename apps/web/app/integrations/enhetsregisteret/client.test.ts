import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { orgNr } from '@saldo/domain';
import { enhet, enhetSearchResponse } from '~/contracts';
import { lookupByOrgNr, searchByName } from './client.server';

/** Load a committed capture from `db/reference/brreg/` — the same source the contract is grounded in. */
function fixture(name: string): unknown {
  const url = new URL(`../../../../../db/reference/brreg/${name}`, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8'));
}

/** Stub global fetch to return one response; pass a string body to simulate a non-JSON payload. */
function mockFetch(body: unknown, init?: ResponseInit): void {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(payload, init))),
  );
}

/** Stub global fetch to reject, simulating a network failure / timeout abort. */
function mockFetchReject(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new Error('network'))),
  );
}

afterEach(() => vi.unstubAllGlobals());

// The captures are the primary source for the shape; assert the contract still accepts them so a
// drift in the live API (re-captured via the regulatory-update skill) trips a test, not production.
describe('contract ↔ db/reference/brreg captures', () => {
  it('parses the full single-unit capture (Equinor, VAT-registered)', () => {
    const parsed = enhet.parse(fixture('enheter-923609016.json'));
    expect(parsed.organisasjonsnummer).toBe('923609016');
    expect(parsed.organisasjonsform.kode).toBe('ASA');
    expect(parsed.registrertIMvaregisteret).toBe(true);
  });

  it('parses the ENK capture (under-threshold, not VAT-registered)', () => {
    const parsed = enhet.parse(fixture('enheter-311000004.json'));
    expect(parsed.organisasjonsform.kode).toBe('ENK');
    expect(parsed.registrertIMvaregisteret).toBe(false);
  });

  it('parses a search envelope with matches', () => {
    const parsed = enhetSearchResponse.parse(fixture('enheter-sok-navn.json'));
    expect(parsed._embedded?.enheter.length).toBeGreaterThan(0);
    expect(parsed.page.totalElements).toBeGreaterThan(0);
  });

  it('parses an empty search envelope (no _embedded)', () => {
    const parsed = enhetSearchResponse.parse(fixture('enheter-sok-tomt.json'));
    expect(parsed._embedded).toBeUndefined();
    expect(parsed.page.totalElements).toBe(0);
  });
});

describe('lookupByOrgNr', () => {
  const equinor = orgNr('923609016');

  it('returns the validated unit on 200', async () => {
    mockFetch(fixture('enheter-923609016.json'), { status: 200 });
    const res = await lookupByOrgNr(equinor);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.enhet.navn).toBe('EQUINOR ASA');
      expect(res.enhet.registrertIMvaregisteret).toBe(true);
    }
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/enheter/923609016'),
      expect.anything(),
    );
  });

  it('maps 404 to not-found', async () => {
    mockFetch(null, { status: 404 });
    expect(await lookupByOrgNr(equinor)).toEqual({ ok: false, reason: 'not-found' });
  });

  it('maps 429 to rate-limited (distinct from a generic error)', async () => {
    mockFetch(null, { status: 429 });
    expect(await lookupByOrgNr(equinor)).toEqual({ ok: false, reason: 'rate-limited' });
  });

  it('maps a 5xx to error', async () => {
    mockFetch(null, { status: 503 });
    expect(await lookupByOrgNr(equinor)).toEqual({ ok: false, reason: 'error' });
  });

  it('maps a network failure to error', async () => {
    mockFetchReject();
    expect(await lookupByOrgNr(equinor)).toEqual({ ok: false, reason: 'error' });
  });

  it('maps a non-JSON / unexpected payload to error', async () => {
    mockFetch('<!doctype html>not json', { status: 200 });
    expect(await lookupByOrgNr(equinor)).toEqual({ ok: false, reason: 'error' });
  });
});

describe('searchByName', () => {
  it('returns matches and the total on 200', async () => {
    mockFetch(fixture('enheter-sok-navn.json'), { status: 200 });
    const res = await searchByName('rema 1000');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.matches.length).toBeGreaterThan(0);
      expect(res.total).toBeGreaterThan(res.matches.length - 1);
    }
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('navn=rema'), expect.anything());
  });

  it('treats zero matches as a success with an empty list (no _embedded)', async () => {
    mockFetch(fixture('enheter-sok-tomt.json'), { status: 200 });
    expect(await searchByName('zzqxnonexistent')).toEqual({ ok: true, matches: [], total: 0 });
  });

  it('maps a 5xx to error', async () => {
    mockFetch(null, { status: 500 });
    expect(await searchByName('rema')).toEqual({ ok: false, reason: 'error' });
  });

  it('maps a network failure to error', async () => {
    mockFetchReject();
    expect(await searchByName('rema')).toEqual({ ok: false, reason: 'error' });
  });
});
