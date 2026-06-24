/**
 * LLM backend configuration — read lazily from the server environment (server-only). The receipt-
 * extraction surface is an **optional integration**: when `LLM_BASE_URL` is unset the feature stays
 * disabled, with **no external default** (ADR 0009 — the shipped product can run with zero external
 * LLM calls; the default backend is a LOCAL Ollama/vLLM the operator points this at).
 *
 * Read directly from `process.env` (not the Zod `env.ts`) so the client stays usable in unit tests
 * and early boot without the full app-config parse — the same precedent as `logger.server.ts`. Secrets
 * come from the server env only and are NEVER logged (`.claude/rules/integrations.md`).
 *
 * **Residency gate (mechanical, fail-closed).** Receipt images are personal data and must never leave
 * the EU/EEA (`data-handling.md`). An **on-prem** endpoint (loopback / private / `.internal` / `.local`)
 * is the operator's own infra and is allowed by default; any **other** host ships image bytes off-box,
 * so it is enabled ONLY when the operator explicitly confirms EU residency via `LLM_EU_RESIDENT=true`.
 * Without that confirmation a remote endpoint yields `null` (the feature stays off) rather than silently
 * exfiltrating — a gate, not a reminder.
 */
export interface LlmConfig {
  /** Base URL of the OpenAI-compatible endpoint, trailing slash trimmed (e.g. `http://localhost:11434/v1`). */
  readonly baseUrl: string;
  /** Bearer key. For local Ollama this is a placeholder (`ollama`); a hosted endpoint needs a real key. */
  readonly apiKey: string;
  /** Model id to request (e.g. `qwen2.5-vl`). */
  readonly model: string;
}

/** A host the operator runs themselves — loopback, RFC1918 private, or an internal/local name. */
function isOnPremHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h === '::1' || h.startsWith('127.')) return true;
  if (h.endsWith('.internal') || h.endsWith('.local')) return true;
  if (/^10\./.test(h) || /^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  return false;
}

/** The configured LLM backend, or `null` when unset or blocked by the residency gate. */
export function llmConfig(): LlmConfig | null {
  const baseUrl = process.env.LLM_BASE_URL?.trim();
  if (!baseUrl) return null;
  let hostname: string;
  try {
    hostname = new URL(baseUrl).hostname;
  } catch {
    return null; // a malformed URL can't be reasoned about — fail closed.
  }
  // Residency: a non-on-prem endpoint needs an explicit EU-residency confirmation, or the feature is off.
  if (!isOnPremHost(hostname) && process.env.LLM_EU_RESIDENT?.trim() !== 'true') {
    return null;
  }
  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    apiKey: process.env.LLM_API_KEY?.trim() || 'ollama',
    model: process.env.LLM_MODEL?.trim() || 'qwen2.5-vl',
  };
}
