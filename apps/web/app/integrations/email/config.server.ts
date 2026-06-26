/**
 * Transactional-email configuration — derived from the Zod `env.ts` contract (server-only). Invoice
 * delivery (build-spec §8.4) sends through **Postmark in its EU region** (ADR 0045), wired via a
 * provider-agnostic SMTP interface: this module exposes only host/port/credential/from, so the app
 * never names a provider and the choice stays swappable.
 *
 * The email surface is an **optional integration**: with the SMTP credentials unset the feature is OFF,
 * with no external default (same posture as the LLM surface — ADR 0009).
 *
 * **Residency gate (fail-closed).** An invoice email carries personal + financial data and must never
 * leave the EU/EEA (`data-handling.md`, build-spec §11). A send is enabled ONLY when the operator
 * explicitly asserts the EU region via `EMAIL_REGION=eu`; without it, {@link emailConfig} returns `null`
 * and the send path refuses. This is an explicit operator assertion (the SMTP host is provider-agnostic,
 * so the code cannot itself geolocate it) paired with the ADR 0045 go-live step of verifying the
 * configured server IS the provider's EU region. The SMTP credential comes from the server env only and
 * is never logged.
 *
 * The `EMAIL_*` variables are declared in the Zod `env.ts` contract (validated at app boot). This module
 * reads them DIRECTLY from `process.env` rather than importing `~/env`, so the email surface stays usable
 * in unit tests / early boot without the full app-config parse (the same precedent as
 * `integrations/llm/config.server.ts` and `observability/logger.server.ts`).
 */

export interface EmailConfig {
  readonly host: string;
  readonly port: number;
  readonly user: string;
  readonly password: string;
  /** The verified sending address (SPF/DKIM/DMARC-signed at go-live). */
  readonly from: string;
}

/** The email-relevant slice of the validated env (the input to the pure residency gate). */
export interface EmailEnv {
  readonly EMAIL_REGION?: 'eu' | undefined;
  readonly EMAIL_SMTP_HOST?: string | undefined;
  readonly EMAIL_SMTP_PORT?: number | undefined;
  readonly EMAIL_SMTP_USER?: string | undefined;
  readonly EMAIL_SMTP_PASSWORD?: string | undefined;
  readonly EMAIL_FROM?: string | undefined;
}

/**
 * PURE residency gate (unit-testable without the env singleton): resolve a config, or `null` when the
 * feature is off / blocked. Null when the EU-region assertion is missing (fail-closed residency, ADR
 * 0045) or any SMTP field / the from-address is unset.
 */
export function resolveEmailConfig(e: EmailEnv): EmailConfig | null {
  if (e.EMAIL_REGION !== 'eu') return null;
  const { EMAIL_SMTP_HOST, EMAIL_SMTP_PORT, EMAIL_SMTP_USER, EMAIL_SMTP_PASSWORD, EMAIL_FROM } = e;
  if (
    !EMAIL_SMTP_HOST ||
    !EMAIL_SMTP_PORT ||
    !EMAIL_SMTP_USER ||
    !EMAIL_SMTP_PASSWORD ||
    !EMAIL_FROM
  )
    return null;
  return {
    host: EMAIL_SMTP_HOST,
    port: EMAIL_SMTP_PORT,
    user: EMAIL_SMTP_USER,
    password: EMAIL_SMTP_PASSWORD,
    from: EMAIL_FROM,
  };
}

/** The configured email backend from the process env, or `null` when off / blocked by the gate. */
export function emailConfig(): EmailConfig | null {
  const portRaw = process.env.EMAIL_SMTP_PORT?.trim();
  const port = portRaw ? Number(portRaw) : undefined;
  return resolveEmailConfig({
    EMAIL_REGION: process.env.EMAIL_REGION?.trim() === 'eu' ? 'eu' : undefined,
    EMAIL_SMTP_HOST: process.env.EMAIL_SMTP_HOST?.trim() || undefined,
    EMAIL_SMTP_PORT: port !== undefined && Number.isFinite(port) ? port : undefined,
    EMAIL_SMTP_USER: process.env.EMAIL_SMTP_USER?.trim() || undefined,
    EMAIL_SMTP_PASSWORD: process.env.EMAIL_SMTP_PASSWORD?.trim() || undefined,
    EMAIL_FROM: process.env.EMAIL_FROM?.trim() || undefined,
  });
}
