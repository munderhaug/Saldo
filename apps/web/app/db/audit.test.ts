import { describe, expect, it } from 'vitest';
import { auditEntityTable, type AuditAction } from './audit.server.js';

// Pure unit test (no Docker). The TS union is the closed set of consequential acts; the SQL CHECKs
// (`audit_log_action_check`, `audit_log_entity_table_check`) enforce the FORMAT. This locks the two
// together: every union member must pass the SQL regexes and derive a plausible entity table, so a
// future action can't be added in TS in a shape the database would refuse (or vice versa drift).
describe('audit actions — the closed set matches the SQL format', () => {
  const ACTIONS: readonly AuditAction[] = [
    'voucher.posted',
    'invoice.issued',
    'invoice.sent',
    'invoice.paid',
    'supplier_invoice.posted',
    'bank_transaction.reconciled',
    'contact.created',
    'contact.updated',
    'product.created',
    'product.updated',
    'organization.created',
    'organization.updated',
  ];

  it("every action is 'entity.act' per the audit_log_action_check regex", () => {
    for (const action of ACTIONS) {
      expect(action).toMatch(/^[a-z_]+\.[a-z_]+$/);
    }
  });

  it('the derived entity table is the action prefix and passes audit_log_entity_table_check', () => {
    for (const action of ACTIONS) {
      const table = auditEntityTable(action);
      expect(table).toMatch(/^[a-z_]+$/);
      expect(action.startsWith(`${table}.`)).toBe(true);
    }
    expect(auditEntityTable('supplier_invoice.posted')).toBe('supplier_invoice');
  });
});
