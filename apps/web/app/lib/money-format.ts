/**
 * Money presentation — the single home for the `kr` helper that had been copy-pasted into the
 * reporting / MVA / SAF-T / bank routes and the invoice PDF. A plain number of øre is formatted as
 * Norwegian kroner ONLY here, through the domain `formatKr` (never raw `toFixed`).
 */
import { formatKr, øre } from '@saldo/domain';
import { t } from '~/copy';

/** Format a plain number of øre as kroner (no currency unit). */
export function kr(ore: number): string {
  return formatKr(øre(ore));
}

/** Format a plain number of øre as kroner WITH the currency unit appended (e.g. "1 250,00 kr"). */
export function krWithUnit(ore: number): string {
  return `${kr(ore)} ${t('common.currency')}`;
}
