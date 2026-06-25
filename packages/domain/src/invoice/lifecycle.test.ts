import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  INVOICE_KINDS,
  INVOICE_STATUSES,
  type InvoiceStatus,
  canTransition,
  drawsInvoiceNumber,
  isIssued,
  nextStatuses,
} from './lifecycle.js';

const anyStatus = fc.constantFrom<InvoiceStatus>(...INVOICE_STATUSES);

describe('invoice lifecycle — the status machine', () => {
  it('draft can only be issued', () => {
    expect(nextStatuses('draft')).toEqual(['issued']);
    expect(canTransition('draft', 'issued')).toBe(true);
    expect(canTransition('draft', 'paid')).toBe(false);
    expect(canTransition('draft', 'sent')).toBe(false);
  });

  it('paid is terminal — no moves out of it', () => {
    expect(nextStatuses('paid')).toEqual([]);
    for (const s of INVOICE_STATUSES) expect(canTransition('paid', s)).toBe(false);
  });

  it('an issued document can be sent, viewed, paid or fall overdue', () => {
    expect(canTransition('issued', 'sent')).toBe(true);
    expect(canTransition('issued', 'paid')).toBe(true);
    expect(canTransition('issued', 'overdue')).toBe(true);
    // but never back to draft (issued is frozen)
    expect(canTransition('issued', 'draft')).toBe(false);
  });

  it('an overdue document can still be paid or resent', () => {
    expect(canTransition('overdue', 'paid')).toBe(true);
    expect(canTransition('overdue', 'sent')).toBe(true);
  });

  it('never transitions back to draft from any state (append-only after issue)', () => {
    fc.assert(
      fc.property(anyStatus, (from) => {
        expect(canTransition(from, 'draft')).toBe(false);
      }),
    );
  });

  it('canTransition agrees with nextStatuses for every pair', () => {
    fc.assert(
      fc.property(anyStatus, anyStatus, (from, to) => {
        expect(canTransition(from, to)).toBe(nextStatuses(from).includes(to));
      }),
    );
  });

  it('isIssued is true for everything past draft', () => {
    expect(isIssued('draft')).toBe(false);
    for (const s of INVOICE_STATUSES.filter((x) => x !== 'draft')) expect(isIssued(s)).toBe(true);
  });
});

describe('invoice kind — who draws a gapless number', () => {
  it('invoices and credit notes draw a number; quotes never do', () => {
    expect(drawsInvoiceNumber('invoice')).toBe(true);
    expect(drawsInvoiceNumber('credit_note')).toBe(true);
    expect(drawsInvoiceNumber('quote')).toBe(false);
  });

  it('every kind is exactly one of the three', () => {
    expect(new Set(INVOICE_KINDS)).toEqual(new Set(['quote', 'invoice', 'credit_note']));
  });
});
