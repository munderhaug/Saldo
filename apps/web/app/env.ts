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
