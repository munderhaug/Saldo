/**
 * Pure ISO-calendar-date helpers — the ONE `YYYY-MM-DD` → UTC-day-ordinal implementation (the
 * reconciliation matcher and the reskontro aging both need day arithmetic; review 2026-07-03 §10
 * de-duplicated their identical copies here). No clock, no timezone: a calendar date is a fact.
 */

/**
 * Parse a strict `YYYY-MM-DD` to a UTC day ordinal (days since epoch), or `null` if malformed —
 * including calendar overflow (e.g. `2026-02-31` rolls into March, so the round-trip check rejects it).
 */
export function isoDayOrdinal(iso: string | null): number | null {
  if (iso === null) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const ms = Date.UTC(year, month - 1, day);
  const back = new Date(ms);
  if (back.getUTCMonth() !== month - 1 || back.getUTCDate() !== day) return null;
  return Math.floor(ms / 86_400_000);
}
