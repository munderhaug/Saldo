/**
 * Skatteetaten MVA-melding **validation API** configuration (feat-mva-melding, build-spec §8.8 / §9).
 * Read DIRECTLY from `process.env` (the same precedent as the banking/llm config surfaces), secrets
 * server-only and NEVER logged.
 *
 * The validation API is **free but onboarding-gated**: it needs Maskinporten/ID-porten scopes granted
 * to the system supplier, so it is an OPTIONAL integration — with it off, the local grounded validator
 * (`validateMvaMelding`) + the `mva:validate` gate still prove generation. Submission (Altinn) is the
 * separate `feat-altinn-mva-submission`.
 *
 * **Residency gate (fail-closed).** A melding carries financial data and must never leave the EU/EEA
 * (`.claude/rules/data-handling.md`). Skatteetaten is an EU authority, but the client still fails
 * closed: it is enabled ONLY when the operator asserts EU residency via `SKATT_EU_RESIDENT=true` AND a
 * bearer token + base URL are set; otherwise {@link skatteetatenConfig} returns `null` and the client
 * refuses (no external call). Same posture as the banking (ADR 0047) and email (ADR 0045) surfaces.
 */

/** Skatteetaten's validation host is environment-specific (test vs prod); no default is assumed. */
export interface SkatteetatenConfig {
  /** Bearer token (Maskinporten access token) for the validation endpoint. */
  readonly token: string;
  /** Validation API base URL, trailing slash trimmed. */
  readonly baseUrl: string;
}

/** The Skatteetaten-relevant slice of the env (the input to the pure residency gate). */
export interface SkatteetatenEnv {
  readonly SKATT_EU_RESIDENT?: 'true' | undefined;
  readonly SKATT_VALIDATION_TOKEN?: string | undefined;
  readonly SKATT_VALIDATION_BASE_URL?: string | undefined;
}

/**
 * PURE residency gate (unit-testable without the env singleton): resolve a config, or `null` when the
 * client is off / blocked — when the EU-residency assertion is missing (fail-closed) or the token / base
 * URL is unset.
 */
export function resolveSkatteetatenConfig(e: SkatteetatenEnv): SkatteetatenConfig | null {
  if (e.SKATT_EU_RESIDENT !== 'true') return null;
  const token = e.SKATT_VALIDATION_TOKEN?.trim();
  const baseUrl = e.SKATT_VALIDATION_BASE_URL?.trim();
  if (!token || !baseUrl) return null;
  return { token, baseUrl: baseUrl.replace(/\/+$/, '') };
}

/** The configured validation backend from the process env, or `null` when off / blocked by the gate. */
export function skatteetatenConfig(): SkatteetatenConfig | null {
  return resolveSkatteetatenConfig({
    SKATT_EU_RESIDENT: process.env.SKATT_EU_RESIDENT?.trim() === 'true' ? 'true' : undefined,
    SKATT_VALIDATION_TOKEN: process.env.SKATT_VALIDATION_TOKEN?.trim() || undefined,
    SKATT_VALIDATION_BASE_URL: process.env.SKATT_VALIDATION_BASE_URL?.trim() || undefined,
  });
}
