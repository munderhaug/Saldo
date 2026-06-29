/**
 * Fiscal-year resolution — the single home for the `?year=` resolver shared by the reporting, MVA and
 * SAF-T routes (it had drifted into four inline copies plus the reporting one). Validates the query
 * param via the reporting contract and defaults to the current calendar year.
 */
import { reportYearSchema } from '~/contracts';

/** Resolve the fiscal year from `?year=` (validated by the contract), defaulting to the current year. */
export function resolveYear(request: Request): number {
  const raw = new URL(request.url).searchParams.get('year');
  const parsed = reportYearSchema.safeParse(raw);
  return parsed.success ? parsed.data : new Date().getFullYear();
}
