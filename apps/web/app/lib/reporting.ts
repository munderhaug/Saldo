/**
 * Presentation helpers for the reporting surface (feat-reporting). Keyed labels for the kontoklasse
 * groups, aging buckets and voucher types (from `~/copy`), plus the `?year=` resolver. The figures
 * themselves are formatted by the domain money helpers — never here.
 *
 * These reports are DETERMINISTIC aggregation over the posted ledger — **NOT an AI system** (EU AI Act
 * Recital 12), so no Art. 50 disclosure applies.
 */
import { type AgingBucket, type Kontoklasse, formatKr, øre } from '@saldo/domain';
import { reportYearSchema } from '~/contracts';
import { t } from '~/copy';

/** Resolve the fiscal year from `?year=` (validated by the contract), defaulting to the current year. */
export function resolveReportYear(request: Request): number {
  const raw = new URL(request.url).searchParams.get('year');
  const parsed = reportYearSchema.safeParse(raw);
  return parsed.success ? parsed.data : new Date().getFullYear();
}

/** Format a plain number of øre as kroner via the domain helper (never raw `toFixed`). */
export function kr(ore: number): string {
  return formatKr(øre(ore));
}

/** Norwegian label for a resultat kontoklasse group (3–8). */
export function kontoklasseLabel(klasse: Kontoklasse): string {
  return t(`reports.klasse.${klasse}`);
}

/** Norwegian label for an aging bucket. */
export function agingBucketLabel(bucket: AgingBucket): string {
  return t(`reports.aging.${bucket}`);
}
