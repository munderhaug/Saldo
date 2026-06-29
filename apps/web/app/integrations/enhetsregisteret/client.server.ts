/**
 * Enhetsregisteret (Brønnøysund) Open Data client — org lookup for onboarding.
 *
 * Open API, no auth/secret (`docs/integrations/enhetsregisteret.md`). Every response is Zod-validated
 * at the boundary (`~/contracts`) before use; the shape is grounded in `db/reference/brreg/`. Expected
 * outcomes (not found, network/timeout, bad payload) are returned as a typed result, never thrown — the
 * loader maps them to calm, system-owns-fault copy.
 */
import type { OrgNr } from '@saldo/domain';
import { enhet, enhetSearchResponse, type Enhet } from '~/contracts';

const BASE_URL = 'https://data.brreg.no/enhetsregisteret/api';
const TIMEOUT_MS = 8000;
const SEARCH_SIZE = 10;
// Polite identifier for an open API (no secret, no PII).
const USER_AGENT = 'Saldo/0.1 org-lookup';

export type OrgNrLookup =
  | { ok: true; enhet: Enhet }
  | { ok: false; reason: 'not-found' }
  | { ok: false; reason: 'rate-limited' }
  | { ok: false; reason: 'error' };

export type NameSearch =
  | { ok: true; matches: Enhet[]; total: number }
  | { ok: false; reason: 'rate-limited' }
  | { ok: false; reason: 'error' };

/** Fetch with an abort-on-timeout. Throws on network error / timeout (callers map to `error`). */
async function fetchBrreg(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json', 'user-agent': USER_AGENT },
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Look up a single unit by (already mod11-validated) org number. */
export async function lookupByOrgNr(org: OrgNr): Promise<OrgNrLookup> {
  let res: Response;
  try {
    res = await fetchBrreg(`${BASE_URL}/enheter/${org}`);
  } catch {
    return { ok: false, reason: 'error' };
  }
  if (res.status === 404) return { ok: false, reason: 'not-found' };
  if (res.status === 429) return { ok: false, reason: 'rate-limited' }; // brreg throttled us
  if (!res.ok) return { ok: false, reason: 'error' };

  const parsed = enhet.safeParse(await res.json().catch(() => null));
  return parsed.success ? { ok: true, enhet: parsed.data } : { ok: false, reason: 'error' };
}

/** Full-text search by company name. Zero matches is a success with an empty list, not an error. */
export async function searchByName(query: string): Promise<NameSearch> {
  const url = `${BASE_URL}/enheter?navn=${encodeURIComponent(query)}&size=${SEARCH_SIZE}`;
  let res: Response;
  try {
    res = await fetchBrreg(url);
  } catch {
    return { ok: false, reason: 'error' };
  }
  if (res.status === 429) return { ok: false, reason: 'rate-limited' }; // brreg throttled us
  if (!res.ok) return { ok: false, reason: 'error' };

  const parsed = enhetSearchResponse.safeParse(await res.json().catch(() => null));
  if (!parsed.success) return { ok: false, reason: 'error' };
  return {
    ok: true,
    matches: parsed.data._embedded?.enheter ?? [],
    total: parsed.data.page.totalElements,
  };
}
