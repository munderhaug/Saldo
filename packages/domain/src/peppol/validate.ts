/**
 * EHF / PEPPOL BIS Billing 3.0 business-rule validation (the subset captured in
 * `db/reference/peppol/bis-billing-3.0.md`). PURE: it checks a built {@link EhfInvoiceModel} against
 * the mandatory-presence + document-money rules and returns a typed verdict — it does NOT replace the
 * full VEFA Schematron (deferred to `feat-peppol-send`). XML *well-formedness* is checked separately at
 * the app boundary (the model is well-formed by construction in `buildUblXml`).
 *
 * Each finding carries the BIS/EN 16931 rule id so a failure points at the actual rule, exactly as the
 * VEFA validator reports. Money ties are exact integer-øre comparisons (never float).
 */
import { addØre, isZeroØre, mulRate, rate, sumØre } from '../money/ore.js';
import type { EhfInvoiceModel, UnclVatCategory } from './ubl.js';

/** A single rule violation — the BIS rule id plus a human-legible message. */
export interface EhfViolation {
  readonly rule: string;
  readonly message: string;
}

export interface EhfValidation {
  readonly ok: boolean;
  readonly violations: readonly EhfViolation[];
}

const isBlank = (s: string | undefined): boolean => s === undefined || s.trim() === '';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_CURRENCY = /^[A-Z]{3}$/;

/**
 * Validate a model against the enforced BIS subset. Collects every violation (not fail-fast) so a
 * caller can surface the whole list, like the VEFA report. `ok` is true only when none fire.
 */
export function validateEhf(model: EhfInvoiceModel): EhfValidation {
  const v: EhfViolation[] = [];
  const fail = (rule: string, message: string): void => void v.push({ rule, message });

  // ── Mandatory presence ───────────────────────────────────────────────────────────────────────
  if (isBlank(model.number)) fail('BR-02', 'Invoice number (cbc:ID) is required.');
  if (!ISO_DATE.test(model.issueDate))
    fail('BR-03', 'Issue date is required and must be an ISO date (YYYY-MM-DD).');
  if (!ISO_CURRENCY.test(model.currency))
    fail('BR-05', 'Document currency code is required (ISO 4217, 3 letters).');
  if (isBlank(model.seller.name)) fail('BR-06', 'Seller name is required.');
  if (isBlank(model.buyer.name)) fail('BR-07', 'Buyer name is required.');
  // The mandatory postal-address field per EN 16931 is the COUNTRY code (BR-09 seller / BR-11 buyer);
  // city (BT-37/BT-52) is recommended, not individually rule-mandated, so we do not block on it.
  if (isBlank(model.seller.countryCode ?? 'NO'))
    fail('BR-09', 'Seller postal address must contain a country code.');
  if (isBlank(model.buyer.countryCode ?? 'NO'))
    fail('BR-11', 'Buyer postal address must contain a country code.');
  if (isBlank(model.seller.orgNr))
    fail('BR-CO-26', 'Seller legal registration id (org nr, scheme 0192) is required.');
  if (model.lines.length === 0) fail('BR-16', 'An invoice must have at least one line.');

  // ── Document money rules (exact øre ties) ──────────────────────────────────────────────────────
  const lineSum = sumØre(model.lines.map((l) => l.netOre));
  if (lineSum !== model.netOre)
    fail('BR-CO-10', 'Sum of line net amounts must equal the document net (LineExtensionAmount).');
  const subtotalVat = sumØre(model.taxSubtotals.map((s) => s.vatOre));
  if (subtotalVat !== model.vatOre)
    fail('BR-CO-14', 'Sum of VAT breakdown amounts must equal the document VAT total.');
  if (addØre(model.netOre, model.vatOre) !== model.grossOre)
    fail('BR-CO-15', 'Tax-inclusive amount must equal net + VAT total.');

  // ── Per-category breakdown ties (taxable base = Σ line nets in that category) ───────────────────
  const categories = new Set<UnclVatCategory>(model.taxSubtotals.map((s) => s.category));
  for (const category of categories) {
    const base = sumØre(model.lines.filter((l) => l.vatCategory === category).map((l) => l.netOre));
    const declared = sumØre(
      model.taxSubtotals.filter((s) => s.category === category).map((s) => s.baseOre),
    );
    if (base !== declared)
      fail(
        `BR-${category}-08`,
        `VAT category ${category}: taxable base must equal the sum of its line nets.`,
      );
  }
  // A standard-rate (S) subtotal must carry VAT; a zero/exempt/reverse-charge one must not.
  for (const s of model.taxSubtotals) {
    if (s.category === 'S' && isZeroØre(s.vatOre) && !isZeroØre(s.baseOre))
      fail('BR-S-09', 'A standard-rated (S) VAT subtotal with a non-zero base must carry VAT.');
    if (s.category !== 'S' && !isZeroØre(s.vatOre))
      fail(`BR-${s.category}-09`, `A ${s.category} VAT subtotal must have a zero VAT amount.`);
    // BR-CO-17: the category VAT amount must equal the taxable base × rate (rounded to the øre). This
    // is the magnitude check BR-S-09 (direction only) misses — a declared VAT of 1 øre on a 25 % base
    // passes BR-S-09 but is wrong. Exact integer-øre comparison via the same round-half-away-from-zero
    // `mulRate` the engine uses. For a 0 % category (Z/E/AE) the expectation is 0, consistent with the
    // BR-{cat}-09 zero check above.
    const expectedVat = mulRate(s.baseOre, rate(s.percent / 100));
    if (expectedVat !== s.vatOre)
      fail(
        'BR-CO-17',
        `VAT category ${s.category}: VAT amount must equal the taxable base × ${s.percent} %.`,
      );
  }

  return { ok: v.length === 0, violations: v };
}
