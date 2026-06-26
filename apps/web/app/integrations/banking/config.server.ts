/**
 * Banking-import configuration — the GoCardless Bank Account Data (PSD2/AIS) backend (build-spec §8.7 /
 * §9, ADR 0047). Read DIRECTLY from `process.env` (not the Zod `env.ts`) so the surface stays usable in
 * unit tests / early boot, the same precedent as `integrations/llm/config.server.ts` and
 * `observability/logger.server.ts`. The secrets come from the server env only and are NEVER logged.
 *
 * The **live AIS client is an optional integration**: with the secrets unset it is OFF — and camt.054 /
 * CSV file import still works without it, so a self-hoster never needs a GoCardless account.
 *
 * **Residency gate (fail-closed).** Bank transactions are personal + financial data and must never
 * leave the EU/EEA (`.claude/rules/data-handling.md`). GoCardless is an EU provider, but the client
 * still fails closed: it is enabled ONLY when the operator explicitly asserts EU residency via
 * `BANKING_EU_RESIDENT=true` AND both secrets are set; otherwise {@link bankingConfig} returns `null`
 * and the fetch path refuses (no external call). Same posture as the email surface (ADR 0045).
 */

/** The fixed GoCardless Bank Account Data host (capture: db/reference/banking/gocardless-bank-account-data.md). */
export const GOCARDLESS_DEFAULT_BASE_URL = 'https://bankaccountdata.gocardless.com';

export interface BankingConfig {
  readonly secretId: string;
  readonly secretKey: string;
  /** API base URL, trailing slash trimmed. Defaults to the GoCardless EU host. */
  readonly baseUrl: string;
}

/** The banking-relevant slice of the env (the input to the pure residency gate). */
export interface BankingEnv {
  readonly BANKING_EU_RESIDENT?: 'true' | undefined;
  readonly BANKING_GOCARDLESS_SECRET_ID?: string | undefined;
  readonly BANKING_GOCARDLESS_SECRET_KEY?: string | undefined;
  readonly BANKING_GOCARDLESS_BASE_URL?: string | undefined;
}

/**
 * PURE residency gate (unit-testable without the env singleton): resolve a config, or `null` when the
 * live client is off / blocked. Null when the EU-residency assertion is missing (fail-closed, ADR 0047)
 * or either secret is unset.
 */
export function resolveBankingConfig(e: BankingEnv): BankingConfig | null {
  if (e.BANKING_EU_RESIDENT !== 'true') return null;
  const secretId = e.BANKING_GOCARDLESS_SECRET_ID?.trim();
  const secretKey = e.BANKING_GOCARDLESS_SECRET_KEY?.trim();
  if (!secretId || !secretKey) return null;
  const baseUrl = e.BANKING_GOCARDLESS_BASE_URL?.trim() || GOCARDLESS_DEFAULT_BASE_URL;
  return { secretId, secretKey, baseUrl: baseUrl.replace(/\/+$/, '') };
}

/** The configured GoCardless backend from the process env, or `null` when off / blocked by the gate. */
export function bankingConfig(): BankingConfig | null {
  return resolveBankingConfig({
    BANKING_EU_RESIDENT: process.env.BANKING_EU_RESIDENT?.trim() === 'true' ? 'true' : undefined,
    BANKING_GOCARDLESS_SECRET_ID: process.env.BANKING_GOCARDLESS_SECRET_ID?.trim() || undefined,
    BANKING_GOCARDLESS_SECRET_KEY: process.env.BANKING_GOCARDLESS_SECRET_KEY?.trim() || undefined,
    BANKING_GOCARDLESS_BASE_URL: process.env.BANKING_GOCARDLESS_BASE_URL?.trim() || undefined,
  });
}
