/**
 * Presentation helpers for the org-onboarding surface: keyed labels for the MVA status + VAT direction
 * (from `~/copy`), and org-number formatting. Pure — they run in loaders and in the browser.
 */
import { MVA_STATUSES, type MvaStatus } from '@saldo/domain';
import { t } from '~/copy';

/** Narrow a DB `mva_status` string (CHECK-constrained) to the branded union, fail-safe. */
function asMvaStatus(status: string): MvaStatus {
  return (MVA_STATUSES as readonly string[]).includes(status)
    ? (status as MvaStatus)
    : 'under_threshold';
}

export function mvaStatusLabel(status: string): string {
  return t(`orgs.mva.${asMvaStatus(status)}.label`);
}

export function mvaStatusDesc(status: string): string {
  return t(`orgs.mva.${asMvaStatus(status)}.desc`);
}

/** VAT-code direction label (`output` / `input` / anything else → none). */
export function directionLabel(direction: string): string {
  if (direction === 'output') return t('orgs.direction.output');
  if (direction === 'input') return t('orgs.direction.input');
  return t('orgs.direction.none');
}

/** "923609016" → "923 609 016" (presentation only; the stored value stays 9 digits). */
export function formatOrgNr(value: string): string {
  return value.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3');
}
