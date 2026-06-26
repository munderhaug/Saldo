import { z } from 'zod';

/**
 * Zod-validated environment — the one boundary that was still un-Zod'd (the roadmap's env.ts). Parsed
 * once at process start; importing this module fails fast if the app's config is wrong. Only runtime
 * app config lives here: tests build their own connections, and the build never executes this.
 *
 * DATABASE_URL is the **app** connection — it MUST point at the non-owner `saldo_app` role in any real
 * environment so RLS (ADR 0012) actually applies. Migrations run as a separate OWNER connection
 * (dbmate's own DATABASE_URL at deploy time), never through this.
 *
 * No SESSION_SECRET: sessions are opaque random tokens stored only as their SHA-256 (ADR 0020), so
 * there is no cookie to sign; CSRF is SameSite=Lax + an Origin check, not a signed token.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  /** App DB connection (the `saldo_app` role in real environments). */
  DATABASE_URL: z.string().url(),
  /** Canonical app origin — used for the Origin-check CSRF guard and the OIDC redirect base. */
  APP_URL: z.string().url().default('http://localhost:3000'),
  // OIDC (optional). When all three are set the OIDC provider is available; otherwise only the dev
  // email/password provider is. Live BankID/Vipps via Criipto needs egress + a real tenant (deferred).
  OIDC_ISSUER: z.string().url().optional(),
  OIDC_CLIENT_ID: z.string().min(1).optional(),
  OIDC_CLIENT_SECRET: z.string().min(1).optional(),
  // Transactional email (invoice delivery, ADR 0045). Postmark in its EU region, wired through a
  // provider-agnostic SMTP interface (nodemailer) — the app code knows only SMTP + a from-address, so
  // the provider stays swappable. All optional: unset → the email feature is OFF (no external default,
  // same posture as the LLM surface). The **residency pin is mechanical**: a send is refused unless
  // EMAIL_REGION=eu (the operator's explicit EU-residency assertion; ADR 0045 / data-handling.md). The
  // SMTP credential is the Postmark server token; it lives ONLY here in the server env, never logged.
  EMAIL_REGION: z.enum(['eu']).optional(),
  EMAIL_SMTP_HOST: z.string().min(1).optional(),
  EMAIL_SMTP_PORT: z.coerce.number().int().positive().max(65535).optional(),
  EMAIL_SMTP_USER: z.string().min(1).optional(),
  EMAIL_SMTP_PASSWORD: z.string().min(1).optional(),
  EMAIL_FROM: z.string().email().optional(),
  // Banking import — GoCardless Bank Account Data (PSD2/AIS), build-spec §8.7/§9 (ADR 0047). All
  // optional: unset → the live AIS client is OFF (camt.054/CSV import still works). Read DIRECTLY from
  // process.env by integrations/banking/config.server.ts (test-safe, same posture as the LLM/email
  // surfaces). The **residency pin is mechanical**: the live client is refused unless
  // BANKING_EU_RESIDENT=true (the operator's explicit EU-residency assertion; data-handling.md). The
  // GoCardless secret_id/secret_key are credentials — server env only, NEVER logged.
  BANKING_EU_RESIDENT: z.enum(['true']).optional(),
  BANKING_GOCARDLESS_SECRET_ID: z.string().min(1).optional(),
  BANKING_GOCARDLESS_SECRET_KEY: z.string().min(1).optional(),
  // Optional override of the GoCardless host. The default is the residency-verified EU host; an override
  // MUST stay an EU/EEA endpoint (BANKING_EU_RESIDENT is an operator assertion, not a host geolocation).
  BANKING_GOCARDLESS_BASE_URL: z.string().url().optional(),
  // LOG_LEVEL is read directly by the logger (foundational infra; see observability/logger.server.ts).
  // LLM_BASE_URL / LLM_API_KEY / LLM_MODEL / LLM_EU_RESIDENT are read directly by the receipt-extraction
  // client (optional integration; see integrations/llm/config.server.ts). Unset → the AI surface is
  // disabled, with no external default (ADR 0009 — local-first; zero external LLM calls out of the box).
  // A non-on-prem LLM_BASE_URL is enabled only with LLM_EU_RESIDENT=true (the residency gate).
});

export const env = schema.parse(process.env);
export const isProd = env.NODE_ENV === 'production';
export const oidcConfigured = Boolean(
  env.OIDC_ISSUER && env.OIDC_CLIENT_ID && env.OIDC_CLIENT_SECRET,
);
/** The dev email/password provider is available outside production, or until OIDC is configured. */
export const devAuthEnabled = !isProd || !oidcConfigured;
