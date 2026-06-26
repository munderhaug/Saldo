import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { validateMeldingWithSkatteetaten } from './validation-client.server';

function stubFetch(handler: (url: string) => Response | Promise<Response>) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string | URL) => Promise.resolve(handler(String(input)))),
  );
}
const xml = (body: string) =>
  new Response(body, { headers: { 'content-type': 'application/xml' } });
const OK_RESULT =
  '<?xml version="1.0"?><valideringsresultat xmlns="no:skatteetaten:fastsetting:avgift:mva:valideringsresultat:v1"><avvikVedMeldingslevering>ingen avvik</avvikVedMeldingslevering></valideringsresultat>';

beforeEach(() => {
  process.env.SKATT_EU_RESIDENT = 'true';
  process.env.SKATT_VALIDATION_TOKEN = 'tok';
  process.env.SKATT_VALIDATION_BASE_URL = 'https://validation.example';
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.SKATT_EU_RESIDENT;
  delete process.env.SKATT_VALIDATION_TOKEN;
  delete process.env.SKATT_VALIDATION_BASE_URL;
});

describe('validateMeldingWithSkatteetaten', () => {
  it('returns not-configured (no external call) when the residency gate is closed', async () => {
    delete process.env.SKATT_EU_RESIDENT;
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    expect(await validateMeldingWithSkatteetaten('<x/>')).toEqual({
      ok: false,
      reason: 'not-configured',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('reports approved when the result has no deviations', async () => {
    stubFetch(() => xml(OK_RESULT));
    expect(await validateMeldingWithSkatteetaten('<x/>')).toEqual({
      ok: true,
      approved: true,
      deviations: 'ingen avvik',
    });
  });

  it('reports not approved + the deviation text when the result has deviations', async () => {
    stubFetch(() =>
      xml(
        '<valideringsresultat xmlns="no:skatteetaten:fastsetting:avgift:mva:valideringsresultat:v1"><avvikVedMeldingslevering>feil i grunnlag</avvikVedMeldingslevering></valideringsresultat>',
      ),
    );
    const r = await validateMeldingWithSkatteetaten('<x/>');
    expect(r).toEqual({ ok: true, approved: false, deviations: 'feil i grunnlag' });
  });

  it('maps 401/403 to auth-failed', async () => {
    stubFetch(() => new Response('', { status: 403 }));
    expect(await validateMeldingWithSkatteetaten('<x/>')).toEqual({
      ok: false,
      reason: 'auth-failed',
    });
  });

  it('maps a network throw to error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('boom'))),
    );
    expect(await validateMeldingWithSkatteetaten('<x/>')).toEqual({ ok: false, reason: 'error' });
  });

  it('maps an unparseable response to invalid-response', async () => {
    stubFetch(() => xml('not xml <<<'));
    const r = await validateMeldingWithSkatteetaten('<x/>');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('invalid-response');
  });

  it('rejects a result document missing the verdict field (fail-closed)', async () => {
    stubFetch(() =>
      xml(
        '<valideringsresultat xmlns="no:skatteetaten:fastsetting:avgift:mva:valideringsresultat:v1"></valideringsresultat>',
      ),
    );
    const r = await validateMeldingWithSkatteetaten('<x/>');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('invalid-response');
  });
});
