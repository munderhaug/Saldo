/**
 * Saldoavskrivning — declining-balance tax depreciation (sktl. § 14-43; feat-year-end-close,
 * build-spec §8.6/§8.10). Each driftsmiddel (or pooled group) sits in a saldogruppe with a fixed
 * yearly rate; the deduction is `rate × the declining balance`. The rates are DATA keyed by year —
 * the `params.ts` pattern: a yearly change is a new dated capture under `db/reference/skatt/` +
 * a data row here, never a code edit. Grounded in the captured Skatteetaten satser page
 * (`docs/regulatory/saldoavskrivning.md`), never memory; {@link saldoRateFor} fails closed for an
 * uncaptured year.
 *
 * Deliberately NOT modelled yet (no committed source — see the regulatory page): the § 14-40
 * straksfradrag (< 15 000 kr assets), the § 14-47 rest-saldo write-off, and mid-year acquisition
 * rules. The schedule is therefore conservative: it never deducts more than the plain rate.
 */
import { mulRate, rate, subØre, type Rate, type Øre } from '../money/ore.js';

/** The saldogrupper of sktl. § 14-43 (Skatteetaten satser page, 2026 capture). */
export type SaldoGruppe = 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h' | 'i' | 'j';

/** 2026 rates per group. `h` uses the 4 % base rate (husdyrbygg 6 % / ≤20-år 10 % not modelled). */
const RATES_2026: Readonly<Record<SaldoGruppe, Rate>> = {
  a: rate(0.3), // kontormaskiner o.l.
  b: rate(0.2), // ervervet forretningsverdi
  c: rate(0.24), // vogntog, lastebiler, busser, varebiler mv.
  d: rate(0.2), // personbiler, maskiner og inventar mv.
  e: rate(0.14), // skip, rigger mv.
  f: rate(0.12), // fly, helikopter
  g: rate(0.05), // kraftoverførings-/distribusjonsanlegg
  h: rate(0.04), // bygg og anlegg, hoteller mv. (base rate)
  i: rate(0.02), // forretningsbygg
  j: rate(0.1), // tekniske installasjoner i næringsbygg
};

const RATES_BY_YEAR: Readonly<Record<number, Readonly<Record<SaldoGruppe, Rate>>>> = {
  2026: RATES_2026,
};

/** The group's declining-balance rate for a captured year. Fails CLOSED for uncaptured years. */
export function saldoRateFor(group: SaldoGruppe, year: number): Rate {
  const rates = RATES_BY_YEAR[year];
  if (!rates) {
    throw new RangeError(
      `No captured saldoavskrivning rates for ${String(year)} — add the dated capture first`,
    );
  }
  return rates[group];
}

/** One schedule year: the deduction (avskrivning) and the balance carried into the next year. */
export interface SaldoYear {
  readonly year: number;
  readonly openingØre: Øre;
  readonly avskrivningØre: Øre;
  readonly closingØre: Øre;
}

/**
 * The declining-balance schedule from an opening basis: each year deducts `roundØre(rate × opening)`
 * (the one presentation/settlement rounding, per the money rules) and carries the rest. Runs for
 * `years` consecutive years from `firstYear`, applying `firstYear`'s CAPTURED rate to every
 * projected year (a projection, labelled as such by the caller — only `firstYear` must be
 * captured; later real deductions re-read the then-captured rate).
 */
export function saldoSchedule(
  openingØre: Øre,
  group: SaldoGruppe,
  firstYear: number,
  years: number,
): SaldoYear[] {
  const r = saldoRateFor(group, firstYear);
  const schedule: SaldoYear[] = [];
  let opening = openingØre;
  for (let i = 0; i < years; i += 1) {
    const avskrivning = mulRate(opening, r);
    const closing = subØre(opening, avskrivning);
    schedule.push({
      year: firstYear + i,
      openingØre: opening,
      avskrivningØre: avskrivning,
      closingØre: closing,
    });
    opening = closing;
  }
  return schedule;
}
