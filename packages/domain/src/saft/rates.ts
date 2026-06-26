/**
 * Numeric MVA rate per SAF-T rate *category*. The SAF-T tax-code list names the category
 * (`Regular rate`, …) but not the percentage, which Skatteetaten sets per year. This mapping is
 * the cited, dated bridge — see `docs/regulatory/mva-rates.md` (raw capture under
 * `db/reference/mva/`). A yearly rate change is a data change here, not a logic change.
 */
import { rate, type Rate } from '../money/ore.js';
import type { RateCategory } from './tax-codes.js';

/** Percentages for 2026 (Skatteetaten). raw-fish ≈ 11.11 % (1/9); confirm before relying on it. */
const PERCENT_BY_CATEGORY: Record<RateCategory, number> = {
  regular: 25,
  'reduced-middle': 15,
  'reduced-low': 12,
  'reduced-raw-fish': 11.11,
  zero: 0,
  none: 0,
};

/** Resolve a SAF-T rate category to a branded multiplier `Rate` (e.g. `regular` → 0.25). */
export function rateForCategory(category: RateCategory): Rate {
  return rate(PERCENT_BY_CATEGORY[category] / 100);
}

/**
 * The MVA-melding `sats` string for a rate category — the Skatteetaten `sats` code list expresses the
 * percentage with a Norwegian comma decimal (`25`, `15`, `12`, `11,11`, `0`), committed under
 * `db/reference/skatt/mva-melding/kodelister/sats.xml`. Codes outside the VAT Act (`none`) carry no
 * rate; they report `0` like the zero rate. This is the presentation form of the same percentages.
 */
const SATS_BY_CATEGORY: Record<RateCategory, string> = {
  regular: '25',
  'reduced-middle': '15',
  'reduced-low': '12',
  'reduced-raw-fish': '11,11',
  zero: '0',
  none: '0',
};

export function satsForCategory(category: RateCategory): string {
  return SATS_BY_CATEGORY[category];
}
