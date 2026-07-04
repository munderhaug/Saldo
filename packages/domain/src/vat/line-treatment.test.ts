import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { SaftTaxCode } from '../saft/tax-codes.js';
import { STANDARD_TAX_CODES as codes, taxCode as code } from '../saft/tax-code.fixtures.js';
import { MVA_STATUSES, type MvaStatus } from './status.js';
import { checkVatLine, deriveVatTreatment, type VatTreatment } from './line-treatment.js';

const REGISTERED = ['registered_standard', 'registered_zero_rated'] as const;
const UNREGISTERED = ['under_threshold', 'unntatt'] as const;
const isRegistered = (s: MvaStatus): boolean =>
  s === 'registered_standard' || s === 'registered_zero_rated';

/** Expected treatment per committed code — hand-derived from the CSV descriptions (the truth). */
const EXPECTED_TREATMENT: Record<string, VatTreatment> = {
  '0': 'no-treatment',
  '1': 'input-deductible',
  '11': 'input-deductible',
  '12': 'input-deductible',
  '13': 'input-deductible',
  '14': 'input-deductible',
  '15': 'input-deductible',
  '20': 'reverse-charge', // import-of-goods basis (no VAT) — part of the deferred import family
  '21': 'reverse-charge',
  '22': 'reverse-charge',
  '3': 'output-vat',
  '31': 'output-vat',
  '32': 'output-vat',
  '33': 'output-vat',
  '5': 'zero-rated-output',
  '51': 'reverse-charge',
  '52': 'zero-rated-output',
  '6': 'exempt',
  '7': 'no-treatment',
  '81': 'reverse-charge',
  '82': 'reverse-charge',
  '83': 'reverse-charge',
  '84': 'reverse-charge',
  '85': 'reverse-charge',
  '86': 'reverse-charge',
  '87': 'reverse-charge',
  '88': 'reverse-charge',
  '89': 'reverse-charge',
  '91': 'reverse-charge',
  '92': 'reverse-charge',
};

/**
 * Reverse-charge codes that *claim* an input deduction ("med fradragsrett") — hand-listed from the
 * committed list. The deduction claim requires registration even though the dual-leg posting is
 * deferred (`vat-reverse-charge`). The complementary "uten fradragsrett" RC codes do not.
 */
const DEDUCTION_CLAIMING_RC: ReadonlySet<string> = new Set(['81', '83', '86', '88', '91']);

/**
 * The sourced spec, stated once independently of the implementation: which codes require VAT
 * registration. Built from the hand-derived `EXPECTED_TREATMENT` table above (not the SUT's
 * classifier), so the exhaustive gate test below is a genuine oracle. Output VAT and fritatt require
 * registration (`mva-registration-threshold.md`, `.claude/rules/vat.md`); input-VAT deduction
 * requires it (same), including a "med fradragsrett" reverse-charge code. Exempt (unntatt),
 * no-treatment, and the non-deduction reverse-charge codes (deferred) are not gated.
 */
const requiresRegistration = (c: SaftTaxCode): boolean => {
  const t = EXPECTED_TREATMENT[c.code];
  return (
    t === 'output-vat' ||
    t === 'zero-rated-output' ||
    t === 'input-deductible' ||
    DEDUCTION_CLAIMING_RC.has(c.code)
  );
};

describe('deriveVatTreatment — classifies every committed SAF-T code', () => {
  it('classifies all 30 codes exactly as the sourced table expects', () => {
    expect(codes).toHaveLength(30);
    for (const c of codes) {
      expect(EXPECTED_TREATMENT[c.code]).toBeDefined(); // table covers the whole list
      expect(deriveVatTreatment(c)).toBe(EXPECTED_TREATMENT[c.code]);
    }
  });

  it('distinguishes unntatt (code 6, exempt) from the technical no-treatment codes (0/7)', () => {
    expect(deriveVatTreatment(code('6'))).toBe('exempt');
    for (const c of ['0', '7']) expect(deriveVatTreatment(code(c))).toBe('no-treatment');
  });

  it('routes every reverse-charge code to the deferred treatment, not output/input', () => {
    for (const c of codes) {
      if (c.reverseCharge) expect(deriveVatTreatment(c)).toBe('reverse-charge');
    }
  });
});

describe('checkVatLine — the registration gate (status × code, exhaustive)', () => {
  it('every committed code × every status agrees with the sourced spec', () => {
    for (const c of codes) {
      const treatment = deriveVatTreatment(c);
      for (const status of MVA_STATUSES) {
        const expectedOk = isRegistered(status) || !requiresRegistration(c);
        const verdict = checkVatLine(status, c);
        expect(verdict.treatment).toBe(treatment);
        expect(verdict.ok, `code ${c.code} (${treatment}) @ ${status}`).toBe(expectedOk);
        if (!verdict.ok) expect(verdict.reason).toBeDefined(); // a block always says why
      }
    }
  });

  it.each(UNREGISTERED)(
    '%s: blocks output VAT, fritatt, and input deduction with a cited reason',
    (status) => {
      expect(checkVatLine(status, code('3'))).toMatchObject({
        ok: false,
        reason: 'output-vat-requires-registration',
      });
      expect(checkVatLine(status, code('52'))).toMatchObject({
        ok: false,
        reason: 'zero-rated-requires-registration',
      });
      expect(checkVatLine(status, code('1'))).toMatchObject({
        ok: false,
        reason: 'input-deduction-requires-registration',
      });
    },
  );

  // ADR 0027 / mval § 3-7: the per-line expressiveness this whole task exists to add.
  it('lets a registered org post an unntatt (§ 3-7) line next to a taxable one', () => {
    expect(checkVatLine('registered_standard', code('6'))).toEqual({
      ok: true,
      treatment: 'exempt',
    });
    expect(checkVatLine('registered_standard', code('3'))).toEqual({
      ok: true,
      treatment: 'output-vat',
    });
  });

  it.each([...MVA_STATUSES])('%s: an unntatt (code 6) line is always valid', (status) => {
    expect(checkVatLine(status, code('6')).ok).toBe(true);
  });

  it('surfaces a non-deduction reverse-charge code (87) as a non-blocking advisory under every status', () => {
    // 87 = foreign service "uten fradragsrett": no deduction claimed, so an unregistered buyer (who
    // owes the output leg but deducts nothing) may use it. Dual-leg posting is still deferred.
    for (const status of MVA_STATUSES) {
      expect(checkVatLine(status, code('87'))).toEqual({
        ok: true,
        treatment: 'reverse-charge',
        reason: 'reverse-charge-deferred',
      });
    }
  });

  it('still gates the input-deduction claim of a "med fradragsrett" reverse-charge code (86)', () => {
    expect(checkVatLine('registered_standard', code('86'))).toEqual({
      ok: true,
      treatment: 'reverse-charge',
      reason: 'reverse-charge-deferred',
    });
    for (const status of UNREGISTERED) {
      expect(checkVatLine(status, code('86'))).toEqual({
        ok: false,
        treatment: 'reverse-charge',
        reason: 'input-deduction-requires-registration',
      });
    }
  });
});

describe('checkVatLine — properties', () => {
  const anyCode = fc.constantFrom<SaftTaxCode>(...codes);
  const anyStatus = fc.constantFrom<MvaStatus>(...MVA_STATUSES);

  it('a fully-registered org is never blocked by any code', () => {
    fc.assert(
      fc.property(anyCode, fc.constantFrom(...REGISTERED), (c, status) => {
        expect(checkVatLine(status, c).ok).toBe(true);
      }),
    );
  });

  it('registration only adds capability — valid-while-unregistered implies valid-while-registered', () => {
    fc.assert(
      fc.property(anyCode, fc.constantFrom(...UNREGISTERED), (c, unreg) => {
        if (checkVatLine(unreg, c).ok) {
          expect(checkVatLine('registered_standard', c).ok).toBe(true);
        }
      }),
    );
  });

  it('exempt and no-treatment lines are valid under every status', () => {
    fc.assert(
      fc.property(anyCode, anyStatus, (c, status) => {
        const t = deriveVatTreatment(c);
        if (t === 'exempt' || t === 'no-treatment') expect(checkVatLine(status, c).ok).toBe(true);
      }),
    );
  });

  it('an unregistered org is blocked iff the code requires registration', () => {
    fc.assert(
      fc.property(anyCode, fc.constantFrom(...UNREGISTERED), (c, unreg) => {
        expect(checkVatLine(unreg, c).ok).toBe(!requiresRegistration(c));
      }),
    );
  });
});
