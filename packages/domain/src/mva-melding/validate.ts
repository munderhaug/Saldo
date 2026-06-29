/**
 * MVA-melding validation — the grounded subset check that proves a generated melding before it is
 * relied on, the same precedent as `peppol/validate` (a local, deterministic gate ahead of the
 * onboarding-gated authority validator). PURE: it checks a built {@link MvaMelding} against the schema's
 * structural rules + the cited code/rate lists + the exact ledger tie-out, and returns a typed verdict.
 * It does NOT replace Skatteetaten's XSD/validation API (wired fail-closed, exercised at onboarding).
 *
 * Money ties are exact integer-øre comparisons (never float). Each finding carries a rule id grounded in
 * the schema element it constrains, so a failure points at the actual rule.
 */
import { sumØre } from '../money/ore.js';
import type { SaftTaxCode } from '../saft/tax-codes.js';
import type { VatCode } from '../posting/types.js';
import {
  type MvaMelding,
  MVA_KATEGORIER,
  isMeldingReportable,
  reportsGrunnlag,
} from './melding.js';

export interface MvaViolation {
  readonly rule: string;
  readonly message: string;
}
export interface MvaValidation {
  readonly ok: boolean;
  readonly violations: readonly MvaViolation[];
}

/** The committed `sats` code list (`db/reference/skatt/mva-melding/kodelister/sats.xml`). */
const VALID_SATS = new Set(['0', '11,11', '12', '15', '25']);
const ORG_NR = /^\d{9}$/;
const DIGITS = /^\d+$/;

/**
 * Validate a melding against the enforced subset. Collects every violation (not fail-fast) so the whole
 * list can be surfaced. `codeIndex` is the committed SAF-T code map (the same one generation used).
 */
export function validateMvaMelding(
  melding: MvaMelding,
  codeIndex: ReadonlyMap<VatCode, SaftTaxCode>,
): MvaValidation {
  const v: MvaViolation[] = [];
  const fail = (rule: string, message: string): void => void v.push({ rule, message });

  // ── Header ─────────────────────────────────────────────────────────────────────────────────────
  if (!ORG_NR.test(melding.orgNr))
    fail('MVA-ORG', 'skattepliktig.organisasjonsnummer must be exactly 9 digits.');
  if (!MVA_KATEGORIER.includes(melding.kategori))
    fail('MVA-KAT', `meldingskategori "${melding.kategori}" is not a known category.`);
  if (melding.kid !== undefined && !DIGITS.test(melding.kid))
    fail('MVA-KID', 'betalingsinformasjon.kundeIdentifikasjonsnummer (KID) must be digits.');

  // ── Lines ──────────────────────────────────────────────────────────────────────────────────────
  for (const line of melding.lines) {
    const saft = codeIndex.get(line.mvaKode);
    if (!saft) {
      fail('MVA-KODE', `mvaKode "${line.mvaKode}" is not a committed SAF-T VAT code.`);
      continue;
    }
    if (line.sats !== undefined && !VALID_SATS.has(line.sats))
      fail('MVA-SATS', `sats "${line.sats}" is not in the committed sats code list.`);
    // A no-VAT-treatment / outside-scope code (0/6/7/20) is not a return figure and must not appear on
    // the melding at all (lockstep with the generator, which skips them).
    if (!isMeldingReportable(saft)) {
      fail(
        'MVA-KODE-SCOPE',
        `mvaKode "${line.mvaKode}" is a no-VAT-treatment / outside-scope code and must not appear on the melding.`,
      );
      continue;
    }
    // grunnlag/sats presence must match the code's basis-reporting nature (the sign rule).
    const expectsGrunnlag = reportsGrunnlag(saft);
    if (expectsGrunnlag && (line.grunnlagØre === undefined || line.sats === undefined))
      fail('MVA-GRUNNLAG', `mvaKode "${line.mvaKode}" must carry a grunnlag and sats.`);
    if (!expectsGrunnlag && (line.grunnlagØre !== undefined || line.sats !== undefined))
      fail(
        'MVA-GRUNNLAG',
        `mvaKode "${line.mvaKode}" is a pure input-deduction code and must carry only merverdiavgift.`,
      );
  }

  // ── The tie-out (exact øre): fastsatt = Σ line merverdiavgift = output − deductible input ─────────
  const lineSum = sumØre(melding.lines.map((l) => l.merverdiavgiftØre));
  if (lineSum !== melding.fastsattØre)
    fail(
      'MVA-TIEOUT',
      'fastsattMerverdiavgift must equal the signed sum of every line merverdiavgift.',
    );

  return { ok: v.length === 0, violations: v };
}
