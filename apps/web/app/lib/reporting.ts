/**
 * Presentation helpers for the reporting surface (feat-reporting). Keyed labels for the kontoklasse
 * groups and aging buckets (from `~/copy`). The `?year=` resolver lives in `~/lib/fiscal-year`; money
 * is formatted by `~/lib/money-format` — never here.
 *
 * These reports are DETERMINISTIC aggregation over the posted ledger — **NOT an AI system** (EU AI Act
 * Recital 12), so no Art. 50 disclosure applies.
 */
import { type AgingBucket, type Kontoklasse } from '@saldo/domain';
import { t } from '~/copy';

/** Norwegian label for a resultat kontoklasse group (3–8). */
export function kontoklasseLabel(klasse: Kontoklasse): string {
  return t(`reports.klasse.${klasse}`);
}

/** Norwegian label for an aging bucket. */
export function agingBucketLabel(bucket: AgingBucket): string {
  return t(`reports.aging.${bucket}`);
}
