/**
 * Catalogue pricing — the net→gross preview for a catalogue item's unit price (build-spec §8.3).
 *
 * A catalogue item stores a net unit price (excl. VAT) in øre; given the VAT rate its chosen SAF-T
 * code carries, this derives the VAT amount and the gross (incl. VAT) for an at-a-glance preview in
 * the catalogue form and (later) on a prefilled invoice line. Pure: the single sanctioned way to
 * apply a rate is `mulRate` (round half away from zero, computed once) — never float math (money.md).
 * This intentionally mirrors the net/vat/gross split `posting/derive.ts` uses, kept here as a
 * presentation-level helper so the catalogue surface need not pull in the posting machinery.
 */
import { addØre, mulRate, type Øre, type Rate } from '../money/ore.js';

/** A unit price decomposed into its net, VAT, and gross (incl. VAT) parts — all integer øre. */
export interface GrossBreakdown {
  readonly net: Øre;
  readonly vat: Øre;
  readonly gross: Øre;
}

/**
 * Split a net unit price into `{ net, vat, gross }` at a given VAT rate.
 * `vat = round(net × rate)` (once, half away from zero); `gross = net + vat`.
 */
export function grossFromNet(net: Øre, vatRate: Rate): GrossBreakdown {
  const vat = mulRate(net, vatRate);
  return { net, vat, gross: addØre(net, vat) };
}
