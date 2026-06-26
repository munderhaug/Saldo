/**
 * Bank reconciliation — boundary contract (build-spec §8.7, feat-reconciliation).
 *
 * The reconcile action confirms a HUMAN-chosen match between one imported bank transaction and one
 * open invoice; the server then validates and posts the settlement (ADR 0002: a §5.5 consequential
 * act needs explicit confirmation). Shape + identity only — the amounts, accounts and lifecycle move
 * are all derived server-side from the two referenced rows, never trusted from the form.
 *
 * This contract carries only opaque UUIDs, so no personal data crosses it. The feature's personal-data
 * fields (bank remittance text, counterparty, customer name) live on the row types in
 * `db/reconciliation.server.ts`, tagged `// personal` there (.claude/rules/data-handling.md).
 */
import { z } from 'zod';

/** Confirm that a bank transaction settles an invoice: the two ids the action needs. */
export const confirmMatchInput = z.object({
  bankTransactionId: z.string().uuid('Ugyldig banktransaksjon'),
  invoiceId: z.string().uuid('Ugyldig faktura'),
});
export type ConfirmMatchInput = z.infer<typeof confirmMatchInput>;
