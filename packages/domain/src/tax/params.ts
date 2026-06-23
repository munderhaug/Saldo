/**
 * Cited, dated income-tax parameters for an ENK owner — the data behind the honest-number "set aside"
 * estimate. Same pattern as `saft/rates.ts`: the numbers live here (a yearly change is a DATA change +
 * a new dated capture under `db/reference/skatt/`), the logic in `income-estimate.ts` stays year-agnostic.
 *
 * Every figure is from a committed primary source — never model memory (AGENTS.md invariant). See
 * `docs/regulatory/skatt-enk-personskatt.md` and ADR 0029.
 */
import { type Øre, type Rate, rate, øre } from '../money/ore.js';

/** kroner → øre, for readable rate-table figures (the captures are stated in kroner). */
const kr = (n: number): Øre => øre(n * 100);

/** A trinnskatt step: the marginal `rate` that applies to income ABOVE `thresholdØre` (innslagspunkt). */
export interface TrinnBracket {
  readonly thresholdØre: Øre;
  readonly rate: Rate;
}

export interface TaxParams {
  readonly year: number;
  /** Combined rate on a PERSON's alminnelig inntekt = fellesskatt + kommune + fylke (skattevedtak §§ 3-2, 3-8). */
  readonly alminneligInntektRate: Rate;
  /** Personfradrag — deduction in alminnelig inntekt, klasse 1 (skattevedtak § 6-3 → sktl. § 15-4). */
  readonly personfradragØre: Øre;
  /** Trinnskatt steps, ascending by threshold (skattevedtak § 3-1). Marginal rates, not additive. */
  readonly trinnskatt: readonly TrinnBracket[];
  /** Trygdeavgift on næringsinntekt — "høy sats" (avgiftsvedtak § 8). */
  readonly trygdeavgiftNæringRate: Rate;
  /** No trygdeavgift when income is at or below this nedre grense (ftrl. § 23-3 fjerde ledd). */
  readonly trygdeavgiftNedreGrenseØre: Øre;
  /** Trygdeavgift may not exceed this share of income above the nedre grense — opptrapping (ftrl. § 23-3). */
  readonly trygdeavgiftOpptrappingRate: Rate;
}

/**
 * 2026 — Stortingets skattevedtak (FOR-2025-12-18-2747) + avgifter til folketrygden (FOR-2025-12-18-2748)
 * + folketrygdloven § 23-3. Raw: db/reference/skatt/2026-06-23-*.md. Mainland, klasse 1 (see ADR 0029).
 */
const PARAMS_2026: TaxParams = {
  year: 2026,
  alminneligInntektRate: rate(0.22), // 8,25 fellesskatt + 11,35 kommune + 2,40 fylke (§§ 3-2, 3-8)
  personfradragØre: kr(114_540), // § 6-3
  trinnskatt: [
    { thresholdØre: kr(226_100), rate: rate(0.017) }, // § 3-1, trinn 1
    { thresholdØre: kr(318_300), rate: rate(0.04) }, //  trinn 2
    { thresholdØre: kr(725_050), rate: rate(0.137) }, // trinn 3
    { thresholdØre: kr(980_100), rate: rate(0.168) }, // trinn 4
    { thresholdØre: kr(1_467_200), rate: rate(0.178) }, // trinn 5
  ],
  trygdeavgiftNæringRate: rate(0.108), // § 8 (høy sats)
  trygdeavgiftNedreGrenseØre: kr(99_650), // ftrl. § 23-3 fjerde ledd
  trygdeavgiftOpptrappingRate: rate(0.25), // ftrl. § 23-3 fjerde ledd (25 %)
};

const PARAMS_BY_YEAR: Readonly<Record<number, TaxParams>> = {
  2026: PARAMS_2026,
};

/** Tax years with committed, source-grounded parameters. */
export const SUPPORTED_TAX_YEARS: readonly number[] = Object.values(PARAMS_BY_YEAR).map(
  (p) => p.year,
);

/**
 * Resolve the parameters for a tax year. **Fail-closed**: throws for a year with no committed capture —
 * we never estimate tax from un-grounded rates (better no number than an invented one).
 */
export function taxParamsFor(year: number): TaxParams {
  const params = PARAMS_BY_YEAR[year];
  if (!params) {
    throw new RangeError(
      `No committed tax parameters for ${year}. Capture the year's rates under db/reference/skatt/ first.`,
    );
  }
  return params;
}
