/**
 * MVA-melding (VAT return) generation — PURE. Composes the posted ledger, already aggregated per SAF-T
 * VAT code by the query layer (the domain stays I/O-free, exactly like `honestNumberFromLedger`), into
 * the Skatteetaten `mvaMeldingDto` model. Money stays integer **øre** here; rounding to whole kroner
 * happens only at the XML/presentation boundary (`./xml.ts`).
 *
 * The melding is **read-only** over the ledger — it books nothing. Every figure traces to a posting:
 *  - `grunnlag` per code = the net basis on the revenue/cost lines carrying it (query layer);
 *  - `merverdiavgift` per code = the signed VAT on that code's klasse-2 VAT-account legs (output +,
 *    deductible input −);
 *  - `fastsattMerverdiavgift` = Σ `merverdiavgift` = `outputVatCollected − deductibleInputVat`, the same
 *    quantity the honest-number reveal uses. No divergent re-derivation.
 *
 * The MVA-status fork (hard invariant) decides whether a melding exists: an unregistered org files none.
 * Grounded in `docs/regulatory/mva-melding.md` + the committed schema; codes/rates are never memorised.
 */
import { type Øre, ZERO, sumØre } from '../money/ore.js';
import { chargesOutputVat, type MvaStatus } from '../vat/status.js';
import { type SaftTaxCode } from '../saft/tax-codes.js';
import { satsForCategory } from '../saft/rates.js';
import type { VatCode } from '../posting/types.js';
import type { OrgNr } from '../ids/org-nr.js';
import type { MvaTerm } from './term.js';

/** The melding's `meldingskategori` (committed XSD enum). An ordinary ENK files `alminnelig`. */
export const MVA_KATEGORIER = [
  'alminnelig',
  'primaernaering',
  'kompensasjon',
  'omvendtAvgiftsplikt',
  'eHandel',
] as const;
export type MvaKategori = (typeof MVA_KATEGORIER)[number];

/**
 * One ledger aggregate per SAF-T VAT code for the term — produced by the query layer. `grunnlagØre` is
 * the net basis (revenue klasse-3 credit−debit / cost klasse 4–7 debit−credit) on the lines carrying
 * the code; `merverdiavgiftØre` is the signed VAT on the code's klasse-2 legs.
 */
export interface VatCodeAggregate {
  readonly code: VatCode;
  readonly grunnlagØre: Øre;
  readonly merverdiavgiftØre: Øre;
}

/** Constant metadata the ledger can't supply — the filing org, term and KID. */
export interface MvaMeldingMeta {
  readonly orgNr: OrgNr;
  readonly year: number;
  readonly term: MvaTerm;
  readonly mvaStatus: MvaStatus;
  /** KID for a payable (`betalingsinformasjon`); omit for a refund or when not yet allocated. */
  readonly kid?: string;
  /** Defaults to `alminnelig`. */
  readonly kategori?: MvaKategori;
}

/** One `mvaSpesifikasjonslinje`. `grunnlagØre`/`sats` are present only for basis-reporting codes. */
export interface MvaMeldingLine {
  readonly mvaKode: VatCode;
  readonly grunnlagØre?: Øre;
  readonly sats?: string;
  readonly merverdiavgiftØre: Øre;
}

export interface MvaMelding {
  readonly orgNr: OrgNr;
  readonly year: number;
  readonly term: MvaTerm;
  readonly kategori: MvaKategori;
  readonly kid?: string;
  readonly lines: readonly MvaMeldingLine[];
  /** Sum fastsatt merverdiavgift for the term = Σ line `merverdiavgift` (positive = payable). */
  readonly fastsattØre: Øre;
}

/**
 * `under_threshold`/`unntatt` orgs file no VAT return — the generator returns `registered: false`
 * rather than an empty melding, so the caller renders the "not registered" state, never a zero return.
 */
export type MvaMeldingResult =
  | { readonly registered: false }
  | { readonly registered: true; readonly melding: MvaMelding };

/**
 * Whether a code is reportable on the MVA-melding at all. The no-VAT-treatment / outside-scope codes
 * (0, 6, 7, 20 — SAF-T `direction='none'` AND `rateCategory='none'`) carry neither output VAT nor a
 * deduction, so they are not VAT-return figures and must NOT surface as a melding line (a non-zero
 * acquisition basis on code 0/20 would otherwise leak a bogus sats-0 grunnlag line). Everything with a
 * VAT treatment — output turnover, zero-rated/exempt sales, input deduction, reverse-charge basis — is
 * reportable. Derived from the committed SAF-T classification, never a code-number list.
 */
export function isMeldingReportable(code: SaftTaxCode): boolean {
  return !(code.direction === 'none' && code.rateCategory === 'none');
}

/**
 * For a REPORTABLE code (see {@link isMeldingReportable}), whether it reports a `grunnlag` (basis) line.
 * Pure domestic input-deduction codes (1, 11–15) report only the deducted VAT amount; every other
 * reportable code — output turnover, zero-rated/exempt sales, and the reverse-charge basis codes —
 * reports a basis. Derived from the SAF-T classification (direction + reverse-charge flag), never a
 * code-number list. Matches the committed example exactly.
 */
export function reportsGrunnlag(code: SaftTaxCode): boolean {
  return !(code.direction === 'input' && !code.reverseCharge);
}

/**
 * Generate the melding model from the per-code ledger aggregates. Zero rows (no basis, no VAT) are
 * dropped; lines are ordered by numeric code for a deterministic document. Throws on a code absent from
 * the SAF-T index — that is a data-integrity error (the ledger only stores provisioned codes), surfaced
 * loudly rather than silently mismapped.
 */
export function generateMvaMelding(
  aggregates: readonly VatCodeAggregate[],
  meta: MvaMeldingMeta,
  codeIndex: ReadonlyMap<VatCode, SaftTaxCode>,
): MvaMeldingResult {
  if (!chargesOutputVat(meta.mvaStatus)) return { registered: false };

  const lines: MvaMeldingLine[] = [];
  for (const agg of aggregates) {
    if (agg.grunnlagØre === ZERO && agg.merverdiavgiftØre === ZERO) continue;
    const saft = codeIndex.get(agg.code);
    if (!saft) throw new Error(`MVA-melding: unknown SAF-T VAT code "${agg.code}"`);
    // A no-VAT-treatment / outside-scope code (0/6/7/20) is not a return figure — skip it even if it
    // carries a non-zero acquisition basis (review §5: don't leak a sats-0 grunnlag line).
    if (!isMeldingReportable(saft)) continue;

    const line: MvaMeldingLine = reportsGrunnlag(saft)
      ? {
          mvaKode: agg.code,
          grunnlagØre: agg.grunnlagØre,
          sats: satsForCategory(saft.rateCategory),
          merverdiavgiftØre: agg.merverdiavgiftØre,
        }
      : { mvaKode: agg.code, merverdiavgiftØre: agg.merverdiavgiftØre };
    lines.push(line);
  }

  lines.sort((a, b) => Number(a.mvaKode) - Number(b.mvaKode));
  const fastsattØre = sumØre(lines.map((l) => l.merverdiavgiftØre));

  return {
    registered: true,
    melding: {
      orgNr: meta.orgNr,
      year: meta.year,
      term: meta.term,
      kategori: meta.kategori ?? 'alminnelig',
      ...(meta.kid !== undefined ? { kid: meta.kid } : {}),
      lines,
      fastsattØre,
    },
  };
}
