/**
 * Altinn 3 MVA-melding **submission** configuration (feat-altinn-mva-submission, ADR 0063,
 * build-spec §8.8/§9 Phase 9). Read DIRECTLY from `process.env` (the skatteetaten/banking/llm
 * precedent), secrets server-only and NEVER logged.
 *
 * Submission is **onboarding-gated**: it needs an ID-porten client with the
 * `skatteetaten:mvameldinginnsending` scope and (in tt02) a Tenor test user with signing rights.
 * Until that onboarding exists, the operator supplies the ID-porten bearer to exchange via env —
 * the same posture as `SKATT_VALIDATION_TOKEN` (ADR 0050); the per-user ID-porten OIDC round-trip
 * is the onboarding follow-on (`docs/integrations/altinn-mva-innsending.md`).
 *
 * **Residency gate (fail-closed).** A melding carries financial data and must never leave the
 * EU/EEA (`.claude/rules/data-handling.md`). Altinn/Skatteetaten are Norwegian authorities, but the
 * client still fails closed: enabled ONLY when the operator asserts `ALTINN_EU_RESIDENT=true` AND
 * every endpoint + the token are set; otherwise {@link altinnConfig} returns `null` and the client
 * refuses (no external call). Same posture as banking (ADR 0047) / email (ADR 0045) / skatteetaten.
 */

/** Endpoints are environment-specific (tt02 vs prod); no default is assumed. */
export interface AltinnConfig {
  /** The Altinn apps host, e.g. `https://skd.apps.tt02.altinn.no` (trailing slash trimmed). */
  readonly appsBaseUrl: string;
  /** The Altinn platform host (token exchange), e.g. `https://platform.tt02.altinn.no`. */
  readonly platformBaseUrl: string;
  /** The innsending app id, e.g. `skd/mva-melding-innsending-etm2` (prod id confirmed at onboarding). */
  readonly appId: string;
  /** The ID-porten bearer to exchange for an Altinn token (operator-supplied until OIDC onboarding). */
  readonly idPortenToken: string;
}

/** The Altinn-relevant slice of the env (the input to the pure residency gate). */
export interface AltinnEnv {
  readonly ALTINN_EU_RESIDENT?: 'true' | undefined;
  readonly ALTINN_APPS_BASE_URL?: string | undefined;
  readonly ALTINN_PLATFORM_BASE_URL?: string | undefined;
  readonly ALTINN_APP_ID?: string | undefined;
  readonly ALTINN_ID_PORTEN_TOKEN?: string | undefined;
}

/**
 * PURE residency gate (unit-testable without the env singleton): resolve a config, or `null` when
 * the client is off / blocked — the EU-residency assertion missing (fail-closed) or any endpoint /
 * the token unset.
 */
export function resolveAltinnConfig(e: AltinnEnv): AltinnConfig | null {
  if (e.ALTINN_EU_RESIDENT !== 'true') return null;
  const appsBaseUrl = e.ALTINN_APPS_BASE_URL?.trim();
  const platformBaseUrl = e.ALTINN_PLATFORM_BASE_URL?.trim();
  const appId = e.ALTINN_APP_ID?.trim();
  const idPortenToken = e.ALTINN_ID_PORTEN_TOKEN?.trim();
  if (!appsBaseUrl || !platformBaseUrl || !appId || !idPortenToken) return null;
  return {
    appsBaseUrl: appsBaseUrl.replace(/\/+$/, ''),
    platformBaseUrl: platformBaseUrl.replace(/\/+$/, ''),
    appId: appId.replace(/^\/+|\/+$/g, ''),
    idPortenToken,
  };
}

/** The configured submission backend from the process env, or `null` when off / blocked by the gate. */
export function altinnConfig(): AltinnConfig | null {
  return resolveAltinnConfig({
    ALTINN_EU_RESIDENT: process.env.ALTINN_EU_RESIDENT?.trim() === 'true' ? 'true' : undefined,
    ALTINN_APPS_BASE_URL: process.env.ALTINN_APPS_BASE_URL?.trim() || undefined,
    ALTINN_PLATFORM_BASE_URL: process.env.ALTINN_PLATFORM_BASE_URL?.trim() || undefined,
    ALTINN_APP_ID: process.env.ALTINN_APP_ID?.trim() || undefined,
    ALTINN_ID_PORTEN_TOKEN: process.env.ALTINN_ID_PORTEN_TOKEN?.trim() || undefined,
  });
}
