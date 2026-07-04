/**
 * Reskontro med aldersfordeling — per-contact open AR bucketed by age (feat-reporting, build-spec §8.9).
 * PURE: the query layer reads the org's OPEN invoices (issued, not yet paid) reusing the invoice
 * lifecycle + the reconciliation `matched_voucher_id` settlement state — NOT a new model; this only
 * buckets them. The per-contact total is the customer's outstanding balance; summed across contacts it
 * reconciles to the AR control account (kundefordringer, konto 1500) for the invoice-driven flow
 * (issue → exact settlement → paid), which the integration test proves. A manual voucher posted
 * directly to 1500, or a partial settlement, can introduce a reconciliation difference vs the control
 * account — surfacing that difference is a follow-up (`reskontro-control-reconciliation`).
 *
 * Sign: a plain invoice is a positive receivable; a credit note is negative (it reduces what the
 * customer owes), so the signed sum still ties out. Age is measured from each item's due date to
 * `asOf` (overdue is positive); a missing due date is treated as not-yet-due.
 */
import { type Øre, ZERO, addØre, sumØre } from '../money/ore.js';
import { isoDayOrdinal } from '../time/iso-date.js';

/** An open receivable item the query layer hands us: one issued, unpaid invoice (or credit note). */
export interface OpenReceivable {
  /** Contact row id, or null for a one-off invoice typed without a saved contact. */
  readonly contactId: string | null;
  readonly contactName: string; // personal: a customer name may be a natural person (ENK)
  /** Signed outstanding: + for an invoice, − for a credit note. Integer øre. */
  readonly amountØre: Øre;
  /** Due date, ISO `YYYY-MM-DD`; null → bucketed as not-yet-due (current). */
  readonly dueDate: string | null;
}

/** Aging buckets by days past due. */
export type AgingBucket = 'current' | 'd1_30' | 'd31_60' | 'd61_90' | 'd90plus';

/** The buckets in display order. */
export const AGING_BUCKETS: readonly AgingBucket[] = [
  'current',
  'd1_30',
  'd31_60',
  'd61_90',
  'd90plus',
];

export type AgingTotals = Readonly<Record<AgingBucket, Øre>>;

export interface ContactReskontro {
  readonly contactId: string | null;
  readonly contactName: string;
  readonly buckets: AgingTotals;
  readonly totalØre: Øre;
}

export interface ReskontroReport {
  /** One row per contact with an open balance, sorted by contact name. */
  readonly contacts: readonly ContactReskontro[];
  readonly totals: AgingTotals;
  readonly totalØre: Øre;
}

const EMPTY_BUCKETS: AgingTotals = {
  current: ZERO,
  d1_30: ZERO,
  d31_60: ZERO,
  d61_90: ZERO,
  d90plus: ZERO,
};

/** The aging bucket for a due date relative to `asOf` (both ISO). Unparseable/missing → current. */
export function agingBucket(dueDate: string | null, asOf: string): AgingBucket {
  if (dueDate === null) return 'current';
  const due = isoDayOrdinal(dueDate);
  const ref = isoDayOrdinal(asOf);
  if (due === null || ref === null) return 'current';
  const daysOverdue = ref - due;
  if (daysOverdue <= 0) return 'current';
  if (daysOverdue <= 30) return 'd1_30';
  if (daysOverdue <= 60) return 'd31_60';
  if (daysOverdue <= 90) return 'd61_90';
  return 'd90plus';
}

/** A grouping key that keeps contact-less one-offs separate by name. */
function groupKey(item: OpenReceivable): string {
  return item.contactId !== null ? `id:${item.contactId}` : `name:${item.contactName}`;
}

function addBucket(buckets: AgingTotals, bucket: AgingBucket, amount: Øre): AgingTotals {
  return { ...buckets, [bucket]: addØre(buckets[bucket], amount) };
}

/** Bucket open receivables per contact by age, as of `asOf` (ISO). Pure. */
export function bucketReskontro(items: readonly OpenReceivable[], asOf: string): ReskontroReport {
  const byContact = new Map<
    string,
    { contactId: string | null; contactName: string; buckets: AgingTotals }
  >();

  for (const item of items) {
    const key = groupKey(item);
    const existing = byContact.get(key) ?? {
      contactId: item.contactId,
      contactName: item.contactName,
      buckets: EMPTY_BUCKETS,
    };
    existing.buckets = addBucket(existing.buckets, agingBucket(item.dueDate, asOf), item.amountØre);
    byContact.set(key, existing);
  }

  const contacts: ContactReskontro[] = [...byContact.values()]
    .map((c) => ({
      contactId: c.contactId,
      contactName: c.contactName,
      buckets: c.buckets,
      totalØre: sumØre(AGING_BUCKETS.map((b) => c.buckets[b])),
    }))
    .sort((a, b) => a.contactName.localeCompare(b.contactName, 'nb'));

  const totals: AgingTotals = AGING_BUCKETS.reduce(
    (acc, b) => ({ ...acc, [b]: sumØre(contacts.map((c) => c.buckets[b])) }),
    EMPTY_BUCKETS,
  );

  return {
    contacts,
    totals,
    totalØre: sumØre(contacts.map((c) => c.totalØre)),
  };
}
