import net from 'node:net';

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
 * the EU/EEA (`data-handling.md`). An **on-prem** endpoint (loopback / private / link-local / ULA /
 * `.internal` / `.local`) is the operator's own infra and is allowed by default; any **off-box** host
 * ships image bytes to a third party, so it is enabled ONLY when the operator explicitly confirms EU
 * residency via `LLM_EU_RESIDENT=true`. Anything we cannot cleanly classify (a malformed URL, or an
 * encoded/obfuscated numeric host such as `0x7f.0.0.1` / `2130706433` / `127.1`) yields `null` — the
 * feature stays off rather than risk leaking bytes. A gate, not a reminder (review 2026-06-28, H6).
 *
 * The host classifier validates the host as an IP *value* (via `node:net`), not by string-matching the
 * textual hostname — so IPv4-mapped IPv6, `0.0.0.0`, and link-local/metadata ranges are classified
 * correctly instead of slipping through. Resolving a DNS *name* to its address at request time is the
 * deliberate next increment; for a named host the operator's EU-residency attestation is the control.
 */
export interface LlmConfig {
  /** Base URL of the OpenAI-compatible endpoint, trailing slash trimmed (e.g. `http://localhost:11434/v1`). */
  readonly baseUrl: string;
  /** Bearer key. For local Ollama this is a placeholder (`ollama`); a hosted endpoint needs a real key. */
  readonly apiKey: string;
  /** Model id to request (e.g. `qwen2.5-vl`). */
  readonly model: string;
}

/** The subset of the environment the LLM config reads — injected so the resolver is pure & testable. */
export interface LlmEnv {
  readonly LLM_BASE_URL?: string | undefined;
  readonly LLM_API_KEY?: string | undefined;
  readonly LLM_MODEL?: string | undefined;
  readonly LLM_EU_RESIDENT?: string | undefined;
}

type HostClass = 'on-prem' | 'off-box' | 'invalid';

/** True for an IPv4 the operator runs themselves (loopback / private / link-local / unspecified). */
function isPrivateOrLocalIpv4(ip: string): boolean {
  const o = ip.split('.').map(Number);
  const [a, b] = o;
  if (a === undefined || b === undefined) return false;
  if (a === 0) return true; // 0.0.0.0/8 — "this host"
  if (a === 127) return true; // loopback 127.0.0.0/8
  if (a === 10) return true; // private 10.0.0.0/8
  if (a === 192 && b === 168) return true; // private 192.168.0.0/16
  if (a === 172 && b >= 16 && b <= 31) return true; // private 172.16.0.0/12
  if (a === 169 && b === 254) return true; // link-local 169.254.0.0/16 (incl. cloud metadata)
  return false;
}

/** True for an IPv6 the operator runs themselves (loopback / unspecified / ULA / link-local). */
function isPrivateOrLocalIpv6(ip: string): boolean {
  const x = ip.toLowerCase();
  if (x === '::1' || x === '::') return true; // loopback / unspecified
  if (/^f[cd][0-9a-f]{2}:/.test(x)) return true; // unique-local fc00::/7 (fc.. / fd..)
  if (/^fe[89ab][0-9a-f]:/.test(x)) return true; // link-local fe80::/10
  return false;
}

/**
 * If `h` is an IPv4-mapped IPv6 address, return the embedded IPv4 in dotted form, else null. The
 * WHATWG URL parser compresses `::ffff:127.0.0.1` to the hex form `::ffff:7f00:1`, so accept both the
 * dotted and the hex shapes — otherwise a mapped loopback/private target would slip past as "off-box".
 */
function mappedIpv4(h: string): string | null {
  const dotted = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i.exec(h);
  if (dotted) return dotted[1]!;
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(h);
  if (hex) {
    const hi = parseInt(hex[1]!, 16);
    const lo = parseInt(hex[2]!, 16);
    return `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`;
  }
  return null;
}

/**
 * Classify a URL hostname for the residency gate. Fail-closed: a host we cannot cleanly reason about
 * is `'invalid'` (→ the feature stays off). IP literals are parsed and classified by their actual
 * range; only genuine DNS names reach `'off-box'`.
 */
function classifyHost(rawHost: string): HostClass {
  const h = rawHost.toLowerCase().replace(/^\[|\]$/g, ''); // strip IPv6 URL brackets
  if (!h) return 'invalid';

  // Operator-run names (not third parties).
  if (h === 'localhost' || h.endsWith('.localhost')) return 'on-prem';
  if (h.endsWith('.internal') || h.endsWith('.local')) return 'on-prem';

  // IPv4-mapped IPv6 (::ffff:127.0.0.1, or its compressed hex form) → classify the embedded IPv4.
  const candidate = mappedIpv4(h) ?? h;

  const version = net.isIP(candidate); // 0 when not a canonical IP literal
  if (version === 4) return isPrivateOrLocalIpv4(candidate) ? 'on-prem' : 'off-box';
  if (version === 6) return isPrivateOrLocalIpv6(candidate) ? 'on-prem' : 'off-box';

  // Not a canonical IP. A host that starts with a digit but is not a valid IP is a malformed/encoded
  // IP attempt (decimal `2130706433`, octal `0177.0.0.1`, hex `0x7f.0.0.1`, short `127.1`): reject it
  // outright rather than hand it to the OS resolver, which might expand it to a private address.
  if (/^[0-9]/.test(h)) return 'invalid';

  // A real DNS name → a third party unless the operator confirms EU residency.
  return 'off-box';
}

/** Resolve the LLM backend from an injected env, or `null` when unset / blocked by the residency gate. */
export function resolveLlmConfig(env: LlmEnv): LlmConfig | null {
  const baseUrl = env.LLM_BASE_URL?.trim();
  if (!baseUrl) return null;
  let hostname: string;
  try {
    hostname = new URL(baseUrl).hostname;
  } catch {
    return null; // a malformed URL can't be reasoned about — fail closed.
  }
  const hostClass = classifyHost(hostname);
  if (hostClass === 'invalid') return null; // unclassifiable host — fail closed.
  // Residency: an off-box endpoint needs an explicit EU-residency confirmation, or the feature is off.
  if (hostClass === 'off-box' && env.LLM_EU_RESIDENT?.trim() !== 'true') return null;
  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    apiKey: env.LLM_API_KEY?.trim() || 'ollama',
    model: env.LLM_MODEL?.trim() || 'qwen2.5-vl',
  };
}

/** The configured LLM backend, or `null` when unset or blocked by the residency gate. */
export function llmConfig(): LlmConfig | null {
  return resolveLlmConfig(process.env);
}
