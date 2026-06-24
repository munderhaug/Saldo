import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { eqØre, mulRate, rate, roundØre, øre, ZERO, type Øre } from '../money/ore.js';
import { mapExtractionToProposal } from './map.js';
import type { ExtractionDirection, ExtractionFields } from './types.js';

const STANDARD = rate(0.25);

function fields(over: Partial<ExtractionFields> = {}): ExtractionFields {
  return { direction: 'purchase', net: øre(100_00), vat: øre(25_00), currency: 'NOK', ...over };
}

describe('mapExtractionToProposal — direction → event', () => {
  it('a purchase document maps to an expense', () => {
    const result = mapExtractionToProposal(fields({ direction: 'purchase' }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.proposal.kind).toBe('expense');
  });

  it('a sale document maps to income', () => {
    const result = mapExtractionToProposal(fields({ direction: 'sale' }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.proposal.kind).toBe('income');
  });
});

describe('mapExtractionToProposal — validation gate (rejections are typed, not thrown)', () => {
  it('rejects a non-NOK currency (no FX in this slice)', () => {
    const result = mapExtractionToProposal(fields({ currency: 'EUR' }));
    expect(result).toEqual({ ok: false, reason: 'unsupported-currency' });
  });

  it('rejects a zero net', () => {
    const result = mapExtractionToProposal(fields({ net: ZERO }));
    expect(result).toEqual({ ok: false, reason: 'non-positive-net' });
  });

  it('rejects a negative net', () => {
    const result = mapExtractionToProposal(fields({ net: øre(-1) }));
    expect(result).toEqual({ ok: false, reason: 'non-positive-net' });
  });
});

describe('mapExtractionToProposal — standard-rate sanity signal', () => {
  it('flags vatLooksStandard when the stated VAT is exactly 25 % of net', () => {
    const result = mapExtractionToProposal(fields({ net: øre(200_00), vat: øre(50_00) }));
    expect(result.ok && result.proposal.vatLooksStandard).toBe(true);
  });

  it('does NOT flag a reduced-rate VAT (12 %) as standard — a calm heads-up, not an error', () => {
    const result = mapExtractionToProposal(fields({ net: øre(200_00), vat: øre(24_00) }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.proposal.vatLooksStandard).toBe(false);
      // The rejection is advisory only — the proposal is still produced for the human to confirm.
      expect(result.proposal.net).toBe(øre(200_00));
    }
  });
});

describe('mapExtractionToProposal — properties', () => {
  const directions: ExtractionDirection[] = ['purchase', 'sale'];
  const positiveØre = fc.integer({ min: 1, max: 50_000_000 }).map((n) => øre(n));

  it('for any positive NOK net: ok, kind matches direction, expectedVat = 25 % of net', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...directions),
        positiveØre,
        fc.integer({ min: 0, max: 50_000_000 }).map((n) => øre(n)),
        (direction, net, vat) => {
          const result = mapExtractionToProposal({ direction, net, vat, currency: 'NOK' });
          if (!result.ok) return false;
          const { proposal } = result;
          return (
            proposal.kind === (direction === 'sale' ? 'income' : 'expense') &&
            proposal.net === net &&
            eqØre(proposal.expectedVat, roundØre(mulRate(net, STANDARD))) &&
            proposal.vatLooksStandard === eqØre(vat, mulRate(net, STANDARD))
          );
        },
      ),
    );
  });

  it('never maps a foreign currency, whatever the amounts', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('EUR', 'USD', 'SEK', 'nok', 'NOK '),
        positiveØre,
        (currency, net: Øre) => {
          const result = mapExtractionToProposal({
            direction: 'purchase',
            net,
            vat: ZERO,
            currency,
          });
          return !result.ok && result.reason === 'unsupported-currency';
        },
      ),
    );
  });
});
