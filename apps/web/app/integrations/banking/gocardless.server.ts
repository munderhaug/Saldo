/**
 * GoCardless Bank Account Data (PSD2/AIS) client — fetches an account's BOOKED transactions and maps
 * them to the source-agnostic {@link NormalisedBankTx} (build-spec §8.7 / §9, ADR 0047). All money
 * conversion happens in the PURE domain normaliser (`normaliseGoCardlessTx`); this module only does
 * I/O + Zod validation at the boundary. Every payload is validated (`~/contracts` — `goCardless*`),
 * grounded in `db/reference/banking/gocardless-bank-account-data.md` (never memory). Server-only.
 *
 * Expected failures (not configured, auth, rate-limit, network, malformed payload) are returned as a
 * typed result, never thrown — the action maps them to calm, system-owns-fault copy.
 *
 * **Privacy.** Account numbers, balances and transactions are personal + financial data
 * (`.claude/rules/data-handling.md`) and are NEVER logged: on failure we log only the error class +
 * (on success) a COUNT, never a field. Secrets come from {@link bankingConfig} (server env only).
 *
 * **Rate-limit safety (capture §"Rate limits").** A bank may allow as few as ~4 calls/day/account per
 * scope. So a fetch is ONE batch: one token call + one transactions call, pulling the whole window at
 * once. NEVER poll per request or paginate per transaction. A 429 is surfaced as `rate-limited` so the
 * caller can back off; the downstream import is idempotent, so a later retry wastes no quota.
 */
import {
  goCardlessTokenResponse,
  goCardlessTransactionsResponse,
  type GoCardlessTransaction,
} from '~/contracts';
import { normaliseGoCardlessTx, type NormalisedBankTx } from '@saldo/domain';
import { logger } from '~/observability/logger.server';
import { bankingConfig, type BankingConfig } from './config.server';

export type FetchTransactionsResult =
  | { readonly ok: true; readonly transactions: readonly NormalisedBankTx[] }
  | {
      readonly ok: false;
      readonly reason:
        | 'not-configured'
        | 'auth-failed'
        | 'rate-limited'
        | 'error'
        | 'invalid-response';
    };

const TIMEOUT_MS = 30_000;

/** fetch with abort-on-timeout. Throws on network error / timeout (callers map to `error`). */
async function request(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Cache the access token across fetches for its lifetime (capture §"Rate limits": cache the token,
 * don't re-issue on every call — the token endpoint is its own rate-limit scope). Module-scoped on the
 * persistent Node host; keyed by secret id, refreshed a minute before expiry.
 */
let tokenCache: { secretId: string; access: string; expiresAt: number } | null = null;

/** Reset the token cache (tests only — module state must not leak between cases). */
export function resetTokenCacheForTests(): void {
  tokenCache = null;
}

/** Return a valid cached access token, or exchange the secrets for a fresh one. `null` on failure. */
async function getAccessToken(config: BankingConfig): Promise<string | null> {
  const now = Date.now();
  if (
    tokenCache &&
    tokenCache.secretId === config.secretId &&
    tokenCache.expiresAt > now + 60_000
  ) {
    return tokenCache.access;
  }
  let res: Response;
  try {
    res = await request(`${config.baseUrl}/api/v2/token/new/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ secret_id: config.secretId, secret_key: config.secretKey }),
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const parsed = goCardlessTokenResponse.safeParse(await res.json().catch(() => null));
  if (!parsed.success) return null;
  tokenCache = {
    secretId: config.secretId,
    access: parsed.data.access,
    expiresAt: now + parsed.data.access_expires * 1000,
  };
  return parsed.data.access;
}

/** Pick the first unstructured remittance text (string field, then the array), or null. */
function remittanceOf(tx: GoCardlessTransaction): string | null {
  if (tx.remittanceInformationUnstructured) return tx.remittanceInformationUnstructured;
  const arr = tx.remittanceInformationUnstructuredArray;
  return arr && arr.length > 0 ? arr.join(' ') : null;
}

/**
 * Fetch and normalise an account's booked transactions. `accountId` is the opaque GoCardless account
 * id. Transactions that fail money/currency normalisation are skipped (a malformed entry never blocks
 * the rest); the whole response failing its shape is `invalid-response`.
 */
export async function fetchAccountTransactions(
  accountId: string,
): Promise<FetchTransactionsResult> {
  const config = bankingConfig();
  if (!config) return { ok: false, reason: 'not-configured' };

  const access = await getAccessToken(config);
  if (!access) return { ok: false, reason: 'auth-failed' };

  let res: Response;
  try {
    res = await request(
      `${config.baseUrl}/api/v2/accounts/${encodeURIComponent(accountId)}/transactions/`,
      { headers: { authorization: `Bearer ${access}`, accept: 'application/json' } },
    );
  } catch {
    return { ok: false, reason: 'error' };
  }
  if (res.status === 429) return { ok: false, reason: 'rate-limited' };
  if (!res.ok) return { ok: false, reason: 'error' };

  const parsed = goCardlessTransactionsResponse.safeParse(await res.json().catch(() => null));
  if (!parsed.success) return { ok: false, reason: 'invalid-response' };

  const transactions: NormalisedBankTx[] = [];
  for (const tx of parsed.data.transactions.booked) {
    const result = normaliseGoCardlessTx({
      externalId: tx.internalTransactionId ?? tx.transactionId ?? null,
      amount: tx.transactionAmount.amount,
      currency: tx.transactionAmount.currency,
      bookingDate: tx.bookingDate ?? null,
      valueDate: tx.valueDate ?? null,
      remittanceInfo: remittanceOf(tx),
      counterparty: tx.creditorName ?? tx.debtorName ?? null,
    });
    if (result.ok) transactions.push(result.tx);
  }

  // Count only — NEVER the transactions/account number (personal + financial data).
  logger.info(
    { booked: parsed.data.transactions.booked.length, normalised: transactions.length },
    'bank transactions fetched',
  );
  return { ok: true, transactions };
}
