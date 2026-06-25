/**
 * Sales-document kind + lifecycle (build-spec §8.4). A sales document is one of three kinds and moves
 * through a small, explicit status machine. This is pure policy — the WHICH-transitions-are-legal
 * decision — kept here so the route action, the DB layer, and the UI all agree on one definition
 * rather than each re-deriving it. The append-only / gapless-number guarantees themselves live in SQL
 * (the issuing transaction + the immutability trigger); this module only decides the moves.
 *
 * One uniform machine for all kinds keeps it legible: `draft → issued → sent → viewed → paid`, with
 * `overdue` reachable once issued, and `paid` terminal. The kind only changes what *issuing* does in
 * the data layer (an invoice / credit note draws a gapless number from the per-org counter; a quote
 * does not) and which moves the UI surfaces — not the shape of the machine. A quote is turned into an
 * invoice by creating a new draft that copies its lines (a data operation), never by a status change.
 */

/** The three sales-document kinds. A credit note corrects an issued invoice (append-only: never edit). */
export const INVOICE_KINDS = ['quote', 'invoice', 'credit_note'] as const;
export type InvoiceKind = (typeof INVOICE_KINDS)[number];

/**
 * The document lifecycle. `draft` is the only editable state; everything from `issued` on is frozen
 * (financially immutable) and only the status itself advances. `overdue` is a derived state the
 * system sets when an unpaid issued document passes its due date; `paid` is terminal.
 */
export const INVOICE_STATUSES = ['draft', 'issued', 'sent', 'viewed', 'paid', 'overdue'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

/** Legal forward moves from each status. The empty set marks a terminal state. */
const NEXT: Record<InvoiceStatus, readonly InvoiceStatus[]> = {
  draft: ['issued'],
  issued: ['sent', 'viewed', 'paid', 'overdue'],
  sent: ['viewed', 'paid', 'overdue'],
  viewed: ['paid', 'overdue'],
  overdue: ['sent', 'viewed', 'paid'],
  paid: [],
};

/** The statuses reachable in one move from `from` (empty when `from` is terminal). */
export function nextStatuses(from: InvoiceStatus): readonly InvoiceStatus[] {
  return NEXT[from];
}

/** Whether `from → to` is a legal lifecycle move. The DB/action is authoritative; this gates the UI. */
export function canTransition(from: InvoiceStatus, to: InvoiceStatus): boolean {
  return NEXT[from].includes(to);
}

/** True once a document has been issued (anything past `draft`): financially frozen from here on. */
export function isIssued(status: InvoiceStatus): boolean {
  return status !== 'draft';
}

/** Only invoices and credit notes draw a gapless number when issued; a quote never does (§8.4). */
export function drawsInvoiceNumber(kind: InvoiceKind): boolean {
  return kind === 'invoice' || kind === 'credit_note';
}
