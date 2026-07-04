/**
 * Presentation helpers for sales documents: keyed kind/status labels and a semantic status-badge
 * class. Pure — runs in loaders and in the browser. Money is formatted via the domain `formatKr`,
 * never here. The badge pairs a colour with the text label (never colour alone — WCAG 1.4.1).
 */
import type { InvoiceStatus } from '@saldo/domain';
import { t } from '~/copy';

/** "Tilbud" / "Faktura" / "Kreditnota" from the document kind. */
export function invoiceKindLabel(kind: string): string {
  if (kind === 'quote') return t('invoices.kind.quote');
  if (kind === 'credit_note') return t('invoices.kind.credit_note');
  return t('invoices.kind.invoice');
}

/** The lifecycle status as a localized label. */
export function invoiceStatusLabel(status: string): string {
  switch (status as InvoiceStatus) {
    case 'draft':
      return t('invoices.status.draft');
    case 'issued':
      return t('invoices.status.issued');
    case 'sent':
      return t('invoices.status.sent');
    case 'viewed':
      return t('invoices.status.viewed');
    case 'paid':
      return t('invoices.status.paid');
    case 'overdue':
      return t('invoices.status.overdue');
    default:
      return status;
  }
}

/** Tailwind classes for the status badge — a semantic colour token plus the always-present text. */
export function invoiceStatusBadgeClass(status: string): string {
  const base = 'inline-flex items-center rounded px-1.5 py-0.5 text-xs font-text';
  switch (status as InvoiceStatus) {
    case 'paid':
      return `${base} bg-paid text-paid-foreground`; // the semantic state token, not the brand primary
    case 'overdue':
      return `${base} bg-overdue text-overdue-foreground`;
    case 'draft':
      return `${base} bg-muted text-muted-foreground`;
    default:
      return `${base} bg-secondary text-secondary-foreground`;
  }
}

/** Format an invoice number for display, or an em dash when there is none yet (a draft / quote). */
export function invoiceNumberLabel(invoiceNumber: number | null): string {
  return invoiceNumber === null ? '—' : String(invoiceNumber);
}
