import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { addØre, øre, subØre, ZERO } from '../money/ore.js';
import { MVA_STATUSES, type MvaStatus, chargesOutputVat } from '../vat/status.js';
import { honestNumber } from './honest-number.js';

const kr = (n: number) => øre(n * 100); // kroner → øre, for readable fixtures

describe('honestNumber — "what\'s actually yours"', () => {
  it('matches the experience-principles §6 example (200k in → ~135k spendable)', () => {
    const r = honestNumber({
      income: kr(200_000),
      outputVatCollected: kr(40_000),
      deductibleInputVat: ZERO,
      estimatedTax: kr(25_000),
      mvaStatus: 'registered_standard',
    });
    expect(r.vatHeld).toBe(kr(40_000));
    expect(r.spendable).toBe(kr(135_000));
    expect(r.rawRemainder).toBe(kr(135_000));
  });

  it('nets deductible input VAT off the VAT held', () => {
    const r = honestNumber({
      income: kr(200_000),
      outputVatCollected: kr(40_000),
      deductibleInputVat: kr(10_000),
      estimatedTax: ZERO,
      mvaStatus: 'registered_standard',
    });
    expect(r.vatHeld).toBe(kr(30_000));
    expect(r.spendable).toBe(kr(170_000));
  });

  it('holds no VAT in a refund position (deductible exceeds output)', () => {
    const r = honestNumber({
      income: kr(50_000),
      outputVatCollected: kr(1_000),
      deductibleInputVat: kr(5_000),
      estimatedTax: ZERO,
      mvaStatus: 'registered_standard',
    });
    expect(r.vatHeld).toBe(ZERO); // you're owed a refund, not holding money
    expect(r.spendable).toBe(kr(50_000));
  });

  it('holds no VAT when zero-rated (output is 0, input still deductible)', () => {
    const r = honestNumber({
      income: kr(80_000),
      outputVatCollected: ZERO,
      deductibleInputVat: kr(4_000),
      estimatedTax: kr(10_000),
      mvaStatus: 'registered_zero_rated',
    });
    expect(r.vatHeld).toBe(ZERO);
    expect(r.spendable).toBe(kr(70_000));
  });

  it.each(['under_threshold', 'unntatt'] as const)(
    'holds no VAT when not registered (%s), even if VAT amounts are passed',
    (mvaStatus) => {
      const r = honestNumber({
        income: kr(120_000),
        outputVatCollected: kr(30_000), // ignored — an unregistered org charged none
        deductibleInputVat: kr(5_000),
        estimatedTax: kr(20_000),
        mvaStatus,
      });
      expect(r.vatHeld).toBe(ZERO);
      expect(r.spendable).toBe(kr(100_000));
    },
  );

  it('floors spendable at zero when liabilities exceed income (and exposes the negative remainder)', () => {
    const r = honestNumber({
      income: kr(1_000),
      outputVatCollected: ZERO,
      deductibleInputVat: ZERO,
      estimatedTax: kr(5_000),
      mvaStatus: 'under_threshold',
    });
    expect(r.spendable).toBe(ZERO);
    expect(r.rawRemainder).toBe(kr(-4_000));
  });

  // ── Properties (fast-check): the safety guarantees the reveal rests on ──
  const øreArb = fc.integer({ min: 0, max: 5_000_000_00 }).map((n) => øre(n));
  const statusArb = fc.constantFrom<MvaStatus>(...MVA_STATUSES);
  const inputArb = fc.record({
    income: øreArb,
    outputVatCollected: øreArb,
    deductibleInputVat: øreArb,
    estimatedTax: øreArb,
    mvaStatus: statusArb,
  });

  it('property: spendable is never negative and never exceeds income', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const r = honestNumber(input);
        expect(r.spendable >= ZERO).toBe(true);
        expect(r.spendable <= input.income).toBe(true);
        expect(r.vatHeld >= ZERO).toBe(true);
      }),
    );
  });

  it('property: rawRemainder is exactly income − vatHeld − estimatedTax', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const r = honestNumber(input);
        expect(r.rawRemainder).toBe(subØre(subØre(input.income, r.vatHeld), input.estimatedTax));
      }),
    );
  });

  it('property: nothing is lost — when solvent, income = spendable + vatHeld + estimatedTax', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const r = honestNumber(input);
        if (r.rawRemainder >= ZERO) {
          expect(addØre(addØre(r.spendable, r.vatHeld), r.estimatedTax)).toBe(input.income);
        }
      }),
    );
  });

  it('property: an unregistered org always holds zero VAT', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const r = honestNumber(input);
        if (!chargesOutputVat(input.mvaStatus)) expect(r.vatHeld).toBe(ZERO);
      }),
    );
  });
});
