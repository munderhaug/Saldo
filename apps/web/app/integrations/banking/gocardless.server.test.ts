import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAccountTransactions, resetTokenCacheForTests } from './gocardless.server';

/** Committed GoCardless transactions fixture (the same wire shape captured in db/reference/banking/). */
const transactionsFixture = (): unknown =>
  JSON.parse(
    readFileSync(
      new URL(
        '../../../../../db/reference/banking/fixtures/gocardless-transactions-sample.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );

/** Route the two calls a fetch makes: token issue, then the transactions GET. */
function stubFetch(handler: (url: string) => Response | Promise<Response>) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string | URL) => Promise.resolve(handler(String(input)))),
  );
}
const json = (body: unknown, init?: ResponseInit) => new Response(JSON.stringify(body), init);

beforeEach(() => {
  resetTokenCacheForTests(); // module-scoped token cache must not leak between cases
  process.env.BANKING_EU_RESIDENT = 'true';
  process.env.BANKING_GOCARDLESS_SECRET_ID = 'sid';
  process.env.BANKING_GOCARDLESS_SECRET_KEY = 'skey';
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.BANKING_EU_RESIDENT;
  delete process.env.BANKING_GOCARDLESS_SECRET_ID;
  delete process.env.BANKING_GOCARDLESS_SECRET_KEY;
});

describe('fetchAccountTransactions', () => {
  it('returns not-configured when the residency gate is closed', async () => {
    delete process.env.BANKING_EU_RESIDENT;
    expect(await fetchAccountTransactions('acc-1')).toEqual({
      ok: false,
      reason: 'not-configured',
    });
  });

  it('exchanges a token then normalises booked transactions (pending ignored)', async () => {
    stubFetch((url) =>
      url.endsWith('/token/new/')
        ? json({ access: 'tok', access_expires: 86400 })
        : json(transactionsFixture()),
    );
    const result = await fetchAccountTransactions('acc-1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.transactions).toEqual([
      {
        externalId: 'gc-internal-001', // internalTransactionId preferred over transactionId
        amount: 123450,
        currency: 'NOK',
        bookingDate: '2026-06-01',
        valueDate: '2026-06-01',
        remittanceInfo: 'Faktura 42 KID 1234567890128',
        counterparty: 'Kunde AS',
      },
      {
        externalId: 'TX-002', // no internal id → falls back to transactionId
        amount: -9990,
        currency: 'NOK',
        bookingDate: '2026-06-02',
        valueDate: null,
        remittanceInfo: 'Kortkjøp dagligvare', // array joined
        counterparty: 'Leverandør Butikk',
      },
    ]);
  });

  it('maps auth failure, a 429, and a malformed payload to typed reasons', async () => {
    stubFetch(() => json({ error: 'bad' }, { status: 401 }));
    expect(await fetchAccountTransactions('a')).toEqual({ ok: false, reason: 'auth-failed' });

    stubFetch((url) =>
      url.endsWith('/token/new/')
        ? json({ access: 't', access_expires: 1 })
        : json({}, { status: 429 }),
    );
    expect(await fetchAccountTransactions('a')).toEqual({ ok: false, reason: 'rate-limited' });

    stubFetch((url) =>
      url.endsWith('/token/new/')
        ? json({ access: 't', access_expires: 1 })
        : json({ wrong: 'shape' }),
    );
    expect(await fetchAccountTransactions('a')).toEqual({ ok: false, reason: 'invalid-response' });
  });

  it('maps a network error to error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('net'))),
    );
    expect(await fetchAccountTransactions('a')).toEqual({ ok: false, reason: 'auth-failed' });
  });

  it('caches the access token across fetches (one token call, not per request)', async () => {
    const fetchMock = vi.fn((input: string | URL) =>
      Promise.resolve(
        String(input).endsWith('/token/new/')
          ? json({ access: 'tok', access_expires: 86400 })
          : json(transactionsFixture()),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await fetchAccountTransactions('acc-1');
    await fetchAccountTransactions('acc-2');

    const tokenCalls = fetchMock.mock.calls.filter(([u]) => String(u).endsWith('/token/new/'));
    expect(tokenCalls).toHaveLength(1); // second fetch reused the cached token
  });
});
