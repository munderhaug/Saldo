/**
 * Source-grounded ENK income-tax ESTIMATE — the `estimatedTax` the honest-number reveal fences off
 * ("what's actually yours", experience-principles §6). PURE: it composes the cited rate table
 * ({@link taxParamsFor}) over a single input (estimated annual business profit in øre).
 *
 * It is a conservative forskuddsskatt-style "set aside", NOT an assessment. Its simplifying assumptions
 * (single income source; beregnet personinntekt ≈ alminnelig næringsinntekt ≈ profit; klasse 1, full-year,
 * mainland; no formuesskatt) are stated in ADR 0029 and `docs/regulatory/skatt-enk-personskatt.md`. It
 * errs toward setting aside slightly too much. A loss (non-positive profit) yields zero tax.
 */
import { type Øre, ZERO, mulRate, subØre, sumØre } from '../money/ore.js';
import { type TaxParams, taxParamsFor } from './params.js';

export interface IncomeTaxEstimate {
  /** 22 % on alminnelig inntekt = `profit − personfradrag`, floored at 0. */
  readonly alminneligInntektSkatt: Øre;
  /** The five-step bracket tax on personinntekt (≈ profit). */
  readonly trinnskatt: Øre;
  /** 10,8 % på næringsinntekt, with the nedre-grense floor and 25 % phase-in cap. */
  readonly trygdeavgift: Øre;
  /** The amount to set aside: the sum of the three components. */
  readonly total: Øre;
}

/** `max` / `min` on branded øre (comparison only — no money arithmetic). */
function maxØre(a: Øre, b: Øre): Øre {
  return a > b ? a : b;
}
function minØre(a: Øre, b: Øre): Øre {
  return a < b ? a : b;
}

/** 22 % on alminnelig inntekt, after personfradrag (no minstefradrag on næringsinntekt). */
function alminneligInntektSkatt(profit: Øre, p: TaxParams): Øre {
  const taxable = maxØre(ZERO, subØre(profit, p.personfradragØre));
  return mulRate(taxable, p.alminneligInntektRate);
}

/** Marginal trinnskatt: each step taxes only the slice of income inside its band. */
function trinnskatt(personinntekt: Øre, p: TaxParams): Øre {
  const steps = p.trinnskatt;
  const perStep = steps.map((step, i) => {
    const next = steps[i + 1];
    // The band runs from this step's threshold to the next step's (or all income, for the top step).
    const upper = next ? next.thresholdØre : personinntekt;
    const inBand = maxØre(ZERO, subØre(minØre(personinntekt, upper), step.thresholdØre));
    return mulRate(inBand, step.rate);
  });
  return sumØre(perStep);
}

/** Trygdeavgift på næringsinntekt: 0 at/under the nedre grense, else capped at 25 % of the excess. */
function trygdeavgift(personinntekt: Øre, p: TaxParams): Øre {
  if (personinntekt <= p.trygdeavgiftNedreGrenseØre) return ZERO;
  const flat = mulRate(personinntekt, p.trygdeavgiftNæringRate);
  const overFloor = subØre(personinntekt, p.trygdeavgiftNedreGrenseØre);
  const phaseInCap = mulRate(overFloor, p.trygdeavgiftOpptrappingRate);
  return minØre(flat, phaseInCap);
}

/**
 * Estimate an ENK owner's personal income tax for the given year from estimated annual business profit.
 * `personinntekt` (the trinnskatt/trygdeavgift base) is approximated by `profit` per ADR 0029.
 */
export function estimateEnkIncomeTax(profit: Øre, year: number): IncomeTaxEstimate {
  const p = taxParamsFor(year);
  const alm = alminneligInntektSkatt(profit, p);
  const trinn = trinnskatt(profit, p);
  const trygde = trygdeavgift(profit, p);
  return {
    alminneligInntektSkatt: alm,
    trinnskatt: trinn,
    trygdeavgift: trygde,
    total: sumØre([alm, trinn, trygde]),
  };
}
