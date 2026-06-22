/**
 * The SAF-T **Standard Tax Codes** model, parsed from the committed code list
 * (`db/reference/saf-t/tax-codes/Standard_Tax_Codes.csv`). VAT codes are NEVER hardcoded from
 * memory (hard invariant, build-spec §4.3): this module turns the official list into typed
 * records, and the rate **category** is mapped to a numeric `Rate` by the cited table in
 * `./rates.ts` (docs/regulatory/mva-rates.md).
 */
import type { VatCode } from '../posting/types.js';

/** The rate *category* a SAF-T code carries; the numeric percentage is resolved in `rates.ts`. */
export type RateCategory =
  | 'regular' // 25 %
  | 'reduced-middle' // 15 %
  | 'reduced-low' // 12 %
  | 'reduced-raw-fish' // 11.11 %
  | 'zero' // 0 % (zero-rated / export / reverse-charge basis)
  | 'none'; // outside the VAT Act / no VAT treatment

/** Which side of the VAT ledger a code belongs to (derived from the code's documented nature). */
export type VatDirection = 'output' | 'input' | 'none';

export interface SaftTaxCode {
  /** SAF-T standard code, e.g. `"3"`. Branded so it is never passed around as a raw string. */
  readonly code: VatCode;
  readonly descriptionNo: string;
  readonly descriptionEn: string;
  readonly rateCategory: RateCategory;
  /** SAF-T "Compensation" flag (kompensasjonsberettiget). */
  readonly compensation: boolean;
  /**
   * Derived input/output/none — the *primary* side, from the committed NOB description (not
   * memorised) and snapshot-tested against the real list. For reverse-charge codes this is the
   * primary leg only; see `reverseCharge`.
   */
  readonly direction: VatDirection;
  /**
   * True for codes where the buyer self-accounts VAT and BOTH an output and an input leg must be
   * posted (snudd avregning / import / foreign services / domestic reverse charge — §4.3). The
   * pure dual-leg derivation lands in Phase 2; until then a caller MUST branch on this flag rather
   * than treat such a code as an ordinary single-leg input/output.
   */
  readonly reverseCharge: boolean;
}

const RATE_CATEGORY_BY_LABEL: Record<string, RateCategory> = {
  '': 'none',
  'Regular rate': 'regular',
  'Reduced rate, middle': 'reduced-middle',
  'Reduced rate, low': 'reduced-low',
  'Reduced rate, raw fish': 'reduced-raw-fish',
  'Zero rate': 'zero',
};

function rateCategoryFromLabel(label: string): RateCategory {
  const category = RATE_CATEGORY_BY_LABEL[label.trim()];
  if (category === undefined) {
    throw new Error(`Unknown SAF-T tax-rate category: "${label}"`);
  }
  return category;
}

/** Classify a code's VAT direction from its (committed) Norwegian description. */
function deriveDirection(descriptionNo: string): VatDirection {
  const s = descriptionNo.toLowerCase();
  if (s.includes('utgående')) return 'output';
  if (
    s.includes('fritatt for merverdiavgift') ||
    s.includes('omvendt avgiftplikt') ||
    s.includes('utførsel')
  ) {
    return 'output';
  }
  // "uten fradragsrett" (no deduction) must be checked before the deductible-input patterns.
  if (s.includes('uten fradragsrett')) return 'none';
  if (
    s.includes('inngående') ||
    s.includes('innførselsmerverdiavgift') ||
    s.includes('med fradragsrett')
  ) {
    return 'input';
  }
  return 'none';
}

/**
 * Detect codes where the buyer self-accounts VAT (both legs): domestic reverse charge, import of
 * goods, foreign services, and emission-allowance/gold purchases. Keyword-derived from the
 * committed NOB descriptions — `innførsel av varer` deliberately excludes `Utførsel` (export) and
 * `innførselsmerverdiavgift` (the plain deductible import-VAT side).
 */
function deriveReverseCharge(descriptionNo: string): boolean {
  const s = descriptionNo.toLowerCase();
  return (
    s.includes('omvendt avgiftplikt') ||
    s.includes('kjøpt fra utlandet') ||
    s.includes('klimakvoter eller gull') ||
    s.includes('innførsel av varer')
  );
}

/**
 * Parse the official `Standard_Tax_Codes.csv` (semicolon-delimited, header:
 * `Code;DescriptionNOB;DescriptionENG;TaxRate;Compensation`). Pure: takes the file contents,
 * does no I/O — the impure layer reads the committed file and passes it in.
 */
export function parseStandardTaxCodes(csv: string): readonly SaftTaxCode[] {
  const lines = csv
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const [, ...rows] = lines; // drop the header
  return rows.map((row) => {
    const cols = row.split(';');
    const code = (cols[0] ?? '').trim();
    const descriptionNo = (cols[1] ?? '').trim();
    const descriptionEn = (cols[2] ?? '').trim();
    const rateLabel = cols[3] ?? '';
    const compensation = (cols[4] ?? '').trim().toUpperCase() === 'TRUE';
    if (code === '') throw new Error(`SAF-T tax-code row has no code: "${row}"`);
    return {
      code: code as VatCode,
      descriptionNo,
      descriptionEn,
      rateCategory: rateCategoryFromLabel(rateLabel),
      compensation,
      direction: deriveDirection(descriptionNo),
      reverseCharge: deriveReverseCharge(descriptionNo),
    };
  });
}

/** Index a parsed list by code for O(1) lookup. */
export function indexTaxCodes(codes: readonly SaftTaxCode[]): ReadonlyMap<VatCode, SaftTaxCode> {
  return new Map(codes.map((c) => [c.code, c]));
}
