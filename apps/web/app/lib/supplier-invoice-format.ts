/**
 * Presentation helpers for supplier invoices: a keyed status label and a semantic status-badge class.
 * Pure — runs in loaders and in the browser. Money is formatted via the domain `formatKr`, never here.
 * The badge pairs a colour with the text label (never colour alone — WCAG 1.4.1).
 */
import { t } from '~/copy';

/** The lifecycle status as a localized label ("Utkast" / "Bokført"). */
export function supplierInvoiceStatusLabel(status: string): string {
  return status === 'posted' ? t('purchases.status.posted') : t('purchases.status.draft');
}

/** Tailwind classes for the status badge — a semantic colour token plus the always-present text. */
export function supplierInvoiceStatusBadgeClass(status: string): string {
  const base = 'inline-flex items-center rounded px-1.5 py-0.5 text-xs font-text';
  return status === 'posted'
    ? `${base} bg-primary text-primary-foreground`
    : `${base} bg-muted text-muted-foreground`;
}
