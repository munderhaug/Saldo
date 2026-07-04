/**
 * Sales-invoice line + document math (build-spec §8.4). Pure: given a line's quantity, net unit price
 * and SAF-T VAT code — plus the org's MVA status — it derives the per-line net / VAT / gross and the
 * document totals, and decides whether the line may be sold at all. It REUSES the per-line VAT engine
 * (`checkVatLine` / `line-treatment`), so the registration HARD BLOCK is the same one the ledger uses:
 * an org that doesn't charge output VAT cannot put an output-VAT (or fritatt) line on an invoice. The
 * client mirrors this for instant feedback, but the action + SQL are authoritative (client is UX only).
 *
 * Money stays integer øre: a line net is `mulRate(unitPrice, quantity)` and the VAT is
 * `mulRate(net, rate)` — the single sanctioned multiply-and-round-once helper (money.md), never raw
 * `* /` on money. A quantity is a non-negative *multiplier* applied to the unit price, so it is the
 * domain's `Rate` (e.g. 2,5 timer → `rate(2.5)`); the DB stores it as an exact `numeric`, so a
 * fractional quantity introduces no binary-float drift and the money is only ever the rounded result.
 */
import { addØre, mulRate, sumØre, ZERO, type Øre, type Rate, rate } from '../money/ore.js';
import { withMod10ControlDigit, type Kid } from '../ids/kid.js';
import { rateForCategory } from '../saft/rates.js';
import type { RateCategory, SaftTaxCode } from '../saft/tax-codes.js';
import { checkVatLine, type VatLineReason, type VatTreatment } from '../vat/line-treatment.js';
import type { MvaStatus } from '../vat/status.js';

/**
 * A line quantity: a non-negative multiplier applied to the unit price (1 stk → `rate(1)`, 2,5 timer
 * → `rate(2.5)`). It is the domain's {@link Rate}, so the line net flows through `mulRate` — the one
 * sanctioned multiply-and-round helper — rather than raw money arithmetic. Construct via {@link quantity}.
 */
export type Quantity = Rate;

/** Construct a {@link Quantity} from a unit count (e.g. `2.5`). Throws on a negative / non-finite count. */
export function quantity(units: number): Quantity {
  return rate(units);
}

/**
 * Net amount of a line = `unit price × quantity`, rounded once (half away from zero) via `mulRate` —
 * the sole sanctioned money-rounding boundary (money.md), never raw `* /` on øre.
 */
export function lineNet(unitPriceNet: Øre, q: Quantity): Øre {
  return mulRate(unitPriceNet, q);
}

/**
 * Why a sales line is rejected: a VAT-engine registration block, an input code on a sale, or a
 * buyer-self-account (reverse-charge purchase) code on a sale. The reverse-charge *advisory*
 * (`reverse-charge-deferred`) is never produced here — the sales gate decides every reverse-charge
 * code (allow the domestic RC sale, block the purchase ones), so it is excluded from the union.
 */
export type SalesLineReason =
  | Exclude<VatLineReason, 'reverse-charge-deferred'>
  | 'input-code-not-a-sale'
  | 'reverse-charge-not-a-sale';

/** A sales line's VAT verdict — `ok: false` is a HARD BLOCK the action must honour. */
export interface SalesLineVerdict {
  readonly ok: boolean;
  readonly treatment: VatTreatment;
  readonly reason?: SalesLineReason;
}

/**
 * The sales-side gate: may a line carrying `code` be sold by an org in `status`? Builds on the shared
 * `checkVatLine` registration gate (output-VAT / fritatt require registration) and adds the
 * sales-specific rules:
 *  - an **input-deductible** code is a purchase code, never a sale → blocked even for a registered org;
 *  - a **reverse-charge** code is a SALE only for the domestic omvendt-avgiftsplikt code (51,
 *    `direction === 'output'`): the seller invoices net and the BUYER self-accounts both legs, so it
 *    posts revenue at net — a legitimate sale. Every other reverse-charge code (goods/services bought
 *    from abroad, gold/emission allowances — 81/82/86/87/91/92) is a BUYER self-account code that
 *    belongs on a purchase voucher's dual leg, NEVER on a sales document → blocked here.
 * Exempt (unntatt) and technical no-VAT codes pass for any status.
 */
export function checkSalesLine(status: MvaStatus, code: SaftTaxCode): SalesLineVerdict {
  const base = checkVatLine(status, code);
  if (base.treatment === 'input-deductible') {
    return { ok: false, treatment: base.treatment, reason: 'input-code-not-a-sale' };
  }
  if (base.treatment === 'reverse-charge') {
    return code.direction === 'output'
      ? { ok: true, treatment: base.treatment } // code 51 — domestic reverse-charge sale, revenue at net
      : { ok: false, treatment: base.treatment, reason: 'reverse-charge-not-a-sale' };
  }
  // Every other treatment carries at most a registration block; the reverse-charge advisory was
  // handled above, so it can never reach here (narrowed out of the reason union).
  return base.reason !== undefined && base.reason !== 'reverse-charge-deferred'
    ? { ok: base.ok, treatment: base.treatment, reason: base.reason }
    : { ok: base.ok, treatment: base.treatment };
}

/** A computed invoice line: its money split, the rate that produced the VAT, and the sales verdict. */
export interface ComputedLine {
  readonly net: Øre;
  readonly vat: Øre;
  readonly gross: Øre;
  readonly vatRate: Rate;
  readonly rateCategory: RateCategory;
  readonly treatment: VatTreatment;
  readonly verdict: SalesLineVerdict;
}

/**
 * Compute one line. VAT is charged only for an actual **output-VAT** treatment — a zero-rated, exempt
 * or no-VAT line adds nothing, and an org that may not charge output VAT yields a blocking `verdict`
 * (its caller must refuse to issue). The net is always computed (it is revenue regardless of VAT).
 */
export function computeLine(
  status: MvaStatus,
  code: SaftTaxCode,
  unitPriceNet: Øre,
  q: Quantity,
): ComputedLine {
  const verdict = checkSalesLine(status, code);
  const net = lineNet(unitPriceNet, q);
  const vatRate = rateForCategory(code.rateCategory);
  // VAT is charged only on a PERMITTED output-VAT line — a blocked line (e.g. an unregistered org on a
  // 25 % code) yields no chargeable VAT, so the figure can never mislead before the action refuses it.
  const vat = verdict.ok && verdict.treatment === 'output-vat' ? mulRate(net, vatRate) : ZERO;
  return {
    net,
    vat,
    gross: addØre(net, vat),
    vatRate,
    rateCategory: code.rateCategory,
    treatment: verdict.treatment,
    verdict,
  };
}

/** Document totals — line nets summed; VAT computed once per rate category (ADR 0054). */
export interface InvoiceTotals {
  readonly net: Øre;
  readonly vat: Øre;
  readonly gross: Øre;
}

/** True when a computed line actually charges output VAT (it contributes to its category's VAT base). */
function chargesVat(l: ComputedLine): boolean {
  return l.verdict.ok && l.treatment === 'output-vat';
}

/**
 * Sum computed lines into document totals. The VAT is CATEGORY-LEVEL (EN 16931 BR-CO-17, ADR 0054):
 * rounded once per rate category from the category's charging base — never the sum of the per-line
 * roundings, which drifts up to ±½ øre per extra line and fails the EHF validator.
 */
export function invoiceTotals(lines: readonly ComputedLine[]): InvoiceTotals {
  const net = sumØre(lines.map((l) => l.net));
  const vat = sumØre(vatBreakdown(lines).map((b) => b.vat));
  return { net, vat, gross: addØre(net, vat) };
}

/** One row of the per-rate VAT summary (the «MVA-grunnlag» block on the document). */
export interface VatBucket {
  readonly rateCategory: RateCategory;
  readonly base: Øre;
  readonly vat: Øre;
}

/** SAF-T category order for the per-rate VAT summary — regular first, then descending, ending no-VAT. */
const RATE_CATEGORY_ORDER: readonly RateCategory[] = [
  'regular',
  'reduced-middle',
  'reduced-low',
  'reduced-raw-fish',
  'zero',
  'none',
];

/**
 * The VAT summary grouped by rate category, in the SAF-T category order, omitting empty categories.
 * The base is the net subject to that rate; the VAT is the category's CHARGING base × rate, rounded
 * once (BR-CO-17, ADR 0054) — a non-charging line (zero-rated / exempt / reverse-charge sale sharing
 * the category) contributes to the base display but never to the VAT.
 */
export function vatBreakdown(lines: readonly ComputedLine[]): readonly VatBucket[] {
  return RATE_CATEGORY_ORDER.map((rateCategory): VatBucket => {
    const inBucket = lines.filter((l) => l.rateCategory === rateCategory);
    const chargingBase = sumØre(inBucket.filter(chargesVat).map((l) => l.net));
    return {
      rateCategory,
      base: sumØre(inBucket.map((l) => l.net)),
      vat: mulRate(chargingBase, rateForCategory(rateCategory)),
    };
  }).filter((b) => b.base !== ZERO || b.vat !== ZERO);
}

/**
 * A FROZEN line of an already-issued document, as it is rendered (PDF / EHF). The net + VAT are the
 * amounts stored at issue (the domain derived them once via {@link computeLine}); the rate category is
 * resolved from the line's SAF-T VAT code. Presentation NEVER recomputes money from unit prices —
 * re-deriving could diverge from the immutable figures the customer was invoiced (ledger is the record).
 */
export interface FrozenLine {
  readonly net: Øre;
  readonly vat: Øre;
  readonly rateCategory: RateCategory;
}

/**
 * The per-rate «MVA-grunnlag» block for an ISSUED document, computed from the FROZEN line amounts —
 * never re-derived from unit prices. Same categories/order and the same CATEGORY-LEVEL rounding as
 * {@link vatBreakdown} (ADR 0054), so the rendered breakdown ties out to the document's frozen totals
 * exactly. A frozen line's stored non-zero VAT marks it as charging (the only frozen signal that
 * survives a later MVA-status change; a charging line whose VAT rounds to 0 øre would need a sub-2-øre
 * net — not a real price). Each bucket carries the category's `Rate` for the percentage display.
 */
export function frozenVatBreakdown(
  lines: readonly FrozenLine[],
): readonly (VatBucket & { readonly vatRate: Rate })[] {
  return RATE_CATEGORY_ORDER.map((rateCategory) => {
    const inBucket = lines.filter((l) => l.rateCategory === rateCategory);
    const chargingBase = sumØre(inBucket.filter((l) => l.vat !== ZERO).map((l) => l.net));
    return {
      rateCategory,
      vatRate: rateForCategory(rateCategory),
      base: sumØre(inBucket.map((l) => l.net)),
      vat: mulRate(chargingBase, rateForCategory(rateCategory)),
    };
  }).filter((b) => b.base !== ZERO || b.vat !== ZERO);
}

/**
 * Presentation boundary: format a VAT {@link Rate} as a Norwegian percentage (0.25 -> "25 %",
 * 0.1111 -> "11,11 %"). Float math is acceptable HERE (display only); trailing zeros are trimmed so a
 * whole percentage shows no decimals. The non-breaking space before "%" follows Norwegian typography.
 */
export function formatVatRate(r: Rate): string {
  const percent = (r as number) * 100;
  return `${percent.toLocaleString('nb-NO', { maximumFractionDigits: 2 })}\u00A0%`;
}

/**
 * Deterministic per-invoice KID: the gapless invoice number, zero-padded to at least `minBodyDigits`,
 * plus a mod10 control digit (the common Norwegian default). Deterministic and pure — the same number
 * always yields the same KID — so reconciliation can recover the invoice from a payment's KID.
 */
export function invoiceKid(invoiceNumber: number, minBodyDigits = 6): Kid {
  if (!Number.isInteger(invoiceNumber) || invoiceNumber <= 0) {
    throw new RangeError(`Invoice number must be a positive integer, got ${invoiceNumber}`);
  }
  return withMod10ControlDigit(String(invoiceNumber).padStart(minBodyDigits, '0'));
}
