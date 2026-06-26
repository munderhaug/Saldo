/**
 * Skatteetaten MVA-melding **validation API** client (feat-mva-melding, build-spec §8.8 / §9). Submits a
 * generated melding XML and maps the `valideringsresultat` to a typed verdict. All I/O + Zod validation
 * live here; the domain core makes no external calls. Every payload is validated at the boundary
 * (`~/contracts` — `valideringsresultat`), grounded in the committed example, never memory.
 *
 * **Fail-closed.** With the integration off (no EU-residency assertion / token / base URL — see
 * {@link skatteetatenConfig}) the client returns `not-configured` and makes NO external call. Expected
 * failures (auth, network, malformed response) are returned as a typed result, never thrown, so the
 * caller maps them to calm copy. This is NOT submission — Altinn 3 filing is `feat-altinn-mva-submission`.
 *
 * **Privacy.** A melding carries financial data; on failure we log only the error class, never the XML
 * or any figure. The bearer token comes from {@link skatteetatenConfig} (server env only).
 */
import { XMLParser } from 'fast-xml-parser';
import { NO_DEVIATIONS, valideringsresultat } from '~/contracts';
import { logger } from '~/observability/logger.server';
import { skatteetatenConfig } from './config.server';

export type ValidateResult =
  | {
      readonly ok: true;
      readonly approved: boolean;
      /** Display-only deviation text for the user's own session — may carry figure-level detail; NEVER log it. */
      readonly deviations: string;
    }
  | {
      readonly ok: false;
      /** `error` covers both a network failure and a timeout/abort (both safely retryable — read-only). */
      readonly reason: 'not-configured' | 'auth-failed' | 'error' | 'invalid-response';
    };

const TIMEOUT_MS = 30_000;

/**
 * PROVISIONAL — the validation endpoint path is a best-effort guess; the real path is confirmed at
 * Skatteetaten onboarding (ADR 0050). Verify against the published API contract before enabling in prod;
 * there is no committed capture to cite yet precisely because the API is onboarding-gated.
 */
const VALIDATION_PATH = '/api/mva/melding/validering';

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

/** Render the deviation node as readable text (`"ingen avvik"` or the serialized deviation). */
function deviationText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (value == null) return '';
  return JSON.stringify(value);
}

/**
 * Validate a melding XML against Skatteetaten's validation API. `approved` is true only when the result
 * reports no deviations (`avvikVedMeldingslevering === "ingen avvik"`); otherwise the deviations text is
 * returned for display. Off / blocked → `not-configured` with no external call (fail-closed).
 */
export async function validateMeldingWithSkatteetaten(xml: string): Promise<ValidateResult> {
  const config = skatteetatenConfig();
  if (!config) return { ok: false, reason: 'not-configured' };

  let res: Response;
  try {
    res = await request(`${config.baseUrl}${VALIDATION_PATH}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.token}`,
        'content-type': 'application/xml',
        accept: 'application/xml',
      },
      body: xml,
    });
  } catch {
    return { ok: false, reason: 'error' };
  }
  if (res.status === 401 || res.status === 403) return { ok: false, reason: 'auth-failed' };
  if (!res.ok) return { ok: false, reason: 'error' };

  const body = await res.text().catch(() => null);
  if (body === null) return { ok: false, reason: 'invalid-response' };

  const parser = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true });
  let root: unknown;
  try {
    root = parser.parse(body) as { valideringsresultat?: unknown };
  } catch {
    return { ok: false, reason: 'invalid-response' };
  }
  const parsed = valideringsresultat.safeParse(
    (root as { valideringsresultat?: unknown }).valideringsresultat,
  );
  // A document with no verdict field is malformed — reject it rather than read it as "not approved".
  if (!parsed.success || parsed.data.avvikVedMeldingslevering === undefined)
    return { ok: false, reason: 'invalid-response' };

  const deviations = deviationText(parsed.data.avvikVedMeldingslevering);
  const approved = deviations === NO_DEVIATIONS;
  // Log only the verdict — never the XML or any figure (financial data).
  logger.info({ approved }, 'mva-melding validated with Skatteetaten');
  return { ok: true, approved, deviations };
}
