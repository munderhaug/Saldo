/**
 * Audit-trail persistence — the bokføringsforskrift sporbarhet record (ADR 0062; the table lives in
 * `db/migrations/*_audit_log.sql`). Every consequential write records WHO did it: `recordAuditEvent`
 * is called in the SAME tenant transaction as the write (the ai_provenance convention, ADR 0037), so
 * the act and its attribution commit atomically — and the append-only grant (INSERT/SELECT, no
 * UPDATE/DELETE) keeps the trail immutable at the privilege level.
 *
 * Data minimisation (`.claude/rules/data-handling.md`): a row is actor · action · entity linkage ONLY.
 * The audited values (amounts, names) stay in the entity rows — joinable, never duplicated here.
 * Server-only.
 */
import type { OrgTx } from '../auth/middleware.js';
import { auditLog } from './schema.js';

/**
 * The closed set of consequential acts — `entity.act`, where the prefix IS the audited table (the SQL
 * CHECK enforces the format; this union enforces the set). Drafts are deliberately absent: a mutable
 * draft is not part of the books — the act that matters is the post/issue/send that freezes it.
 */
export type AuditAction =
  | 'voucher.posted'
  | 'invoice.issued'
  | 'invoice.sent'
  | 'invoice.paid'
  | 'supplier_invoice.posted'
  | 'bank_transaction.reconciled'
  | 'contact.created'
  | 'contact.updated'
  | 'product.created'
  | 'product.updated'
  | 'organization.created'
  | 'organization.updated';

export interface AuditEvent {
  readonly organizationId: string;
  /** The authenticated user who performed the act (from `withUserOrg`'s ctx — never client input). */
  readonly actorUserId: string;
  readonly action: AuditAction;
  /** The audited row — its table is the action's prefix, so linkage can never drift from the act. */
  readonly entityId: string;
}

/** The table an action audits — the `entity.` prefix, by construction. */
export function auditEntityTable(action: AuditAction): string {
  return action.slice(0, action.indexOf('.'));
}

/**
 * Record one consequential act, in the caller's tenant-scoped transaction (RLS scopes it to the org).
 * Call it right after the write it attests to, inside the same `withUserOrg`/`withOrgTx` callback —
 * the event must never commit without its write, nor the write without its event.
 */
export async function recordAuditEvent(tx: OrgTx, event: AuditEvent): Promise<void> {
  await tx.insert(auditLog).values({
    organizationId: event.organizationId,
    actorUserId: event.actorUserId,
    action: event.action,
    entityTable: auditEntityTable(event.action),
    entityId: event.entityId,
  });
}
