import { describe, expect, it } from 'vitest';
import { øre } from '../money/ore.js';
import { TAX_CODE_INDEX as codes } from '../saft/tax-code.fixtures.js';
import { isBalanced } from '../posting/balance.js';
import type { AccountNo, PostingLine, VatCode, Voucher } from '../posting/types.js';
import { runRules } from './types.js';
import { vatLineRule } from './vat-line.js';
import { checkVatActivityLine } from '../vat/activity.js';

const acc = (s: string): AccountNo => s as AccountNo;
const vc = (s: string): VatCode => s as VatCode;
const line = (account: string, debit: number, credit: number, vatCode?: string): PostingLine =>
  vatCode === undefined
    ? { account: acc(account), debit: øre(debit), credit: øre(credit) }
    : { account: acc(account), vatCode: vc(vatCode), debit: øre(debit), credit: øre(credit) };

const errors = (v: Voucher, status: Parameters<typeof vatLineRule>[0]['status']) =>
  vatLineRule({ status, codes })
    .evaluate(v)
    .filter((x) => x.severity === 'error');
const warnings = (v: Voucher, status: Parameters<typeof vatLineRule>[0]['status']) =>
  vatLineRule({ status, codes })
    .evaluate(v)
    .filter((x) => x.severity === 'warning');

describe('vatLineRule — line-level VAT validation over a voucher (ADR 0027)', () => {
  // THE headline case: a registered cultural-sector ENK invoices a taxable teaching fee (code 3)
  // and an unntatt performance fee (code 6, mval § 3-7) on the same voucher. No error.
  it('accepts a mixed taxable + unntatt (§ 3-7) voucher for a registered org', () => {
    const v: Voucher = {
      type: 'sales',
      lines: [
        line('1500', 32_500, 0), // receivable, gross of the whole invoice (uncoded)
        line('3000', 0, 10_000, '3'), // taxable teaching fee, net
        line('2700', 0, 2_500, '3'), // output VAT on the teaching fee
        line('3100', 0, 20_000, '6'), // unntatt performance fee (§ 3-7) — outside the VAT Act
      ],
    };
    expect(isBalanced(v)).toBe(true);
    expect(errors(v, 'registered_standard')).toHaveLength(0);
    expect(warnings(v, 'registered_standard')).toHaveLength(0);
  });

  it('blocks an output-VAT line for an unregistered org, citing why', () => {
    const v: Voucher = {
      type: 'sales',
      lines: [line('1500', 12_500, 0), line('3000', 0, 10_000, '3'), line('2700', 0, 2_500, '3')],
    };
    const errs = errors(v, 'under_threshold');
    expect(errs).toHaveLength(2); // both code-3 lines flagged
    expect(errs[0]?.message).toMatch(/Output VAT requires VAT registration/);
  });

  it('blocks an input-VAT deduction for an unntatt org', () => {
    const v: Voucher = {
      type: 'purchase',
      lines: [line('6000', 10_000, 0, '1'), line('2710', 2_500, 0, '1'), line('2400', 0, 12_500)],
    };
    const errs = errors(v, 'unntatt');
    expect(errs.map((e) => e.message)).toContainEqual(
      expect.stringMatching(/Input-VAT deduction requires VAT registration/),
    );
  });

  it('warns (does not block) on a reverse-charge code for a registered org — deferred to vat-reverse-charge', () => {
    const v: Voucher = { type: 'purchase', lines: [line('6000', 10_000, 0, '86')] };
    expect(errors(v, 'registered_standard')).toHaveLength(0);
    const warns = warnings(v, 'registered_standard');
    expect(warns).toHaveLength(1);
    expect(warns[0]?.message).toMatch(/vat-reverse-charge/);
  });

  it('blocks a "med fradragsrett" reverse-charge code (86) for an unregistered org', () => {
    // The dual-leg posting is deferred, but the deduction claim is decidable now and not allowed.
    const v: Voucher = { type: 'purchase', lines: [line('6000', 10_000, 0, '86')] };
    const errs = errors(v, 'under_threshold');
    expect(errs).toHaveLength(1);
    expect(errs[0]?.message).toMatch(/Input-VAT deduction requires VAT registration/);
  });

  it('errors on a VAT code not present on the committed SAF-T list', () => {
    const v: Voucher = { type: 'sales', lines: [line('3000', 0, 10_000, '999')] };
    const errs = errors(v, 'registered_standard');
    expect(errs).toHaveLength(1);
    expect(errs[0]?.message).toMatch(/Unknown VAT code "999"/);
  });

  it('ignores uncoded lines (manual/bank/settlement)', () => {
    const v: Voucher = {
      type: 'bank',
      lines: [line('1920', 12_500, 0), line('1500', 0, 12_500)],
    };
    expect(vatLineRule({ status: 'under_threshold', codes }).evaluate(v)).toHaveLength(0);
  });

  // Boundary lock (review H7, ADR 0030): the sectoral ACTIVITY gate (checkVatActivityLine — the kap. 3
  // "exempt-sector revenue may never carry output VAT" rule) is intentionally NOT wired into vatLineRule
  // yet. The voucher/posting line model carries no `activity`, so there is nothing to gate on; the gate
  // is sequenced to vat-mixed-activity. A line the activity gate WOULD block therefore passes here today.
  // This test makes the open boundary explicit (mirroring the code-51 lock in vat/activity.test.ts) so
  // wiring it later is a deliberate change, not a silent surprise.
  it('does NOT yet enforce the sectoral activity gate (deferred per ADR 0030)', () => {
    // A registered org charging output VAT (code 3) is registration-legal → vatLineRule passes it.
    const v: Voucher = {
      type: 'sales',
      lines: [line('1500', 12_500, 0), line('3000', 0, 10_000, '3'), line('2700', 0, 2_500, '3')],
    };
    expect(errors(v, 'registered_standard')).toHaveLength(0);
    expect(warnings(v, 'registered_standard')).toHaveLength(0);
    // ...yet IF that revenue belonged to an exempt § 3-2 health activity, the activity gate would block
    // it. vatLineRule has no activity input, so it cannot and does not gate that — the deferred boundary.
    expect(checkVatActivityLine('helse', codes.get(vc('3'))!).ok).toBe(false);
  });

  it('plugs into runRules: an error fails the run, a warning does not', () => {
    const bad: Voucher = { type: 'sales', lines: [line('3000', 0, 10_000, '3')] };
    const rc: Voucher = { type: 'purchase', lines: [line('6000', 10_000, 0, '86')] };
    expect(runRules([vatLineRule({ status: 'under_threshold', codes })], bad).ok).toBe(false);
    const rcResult = runRules([vatLineRule({ status: 'registered_standard', codes })], rc);
    expect(rcResult.ok).toBe(true);
    expect(rcResult.violations).toHaveLength(1);
  });
});
