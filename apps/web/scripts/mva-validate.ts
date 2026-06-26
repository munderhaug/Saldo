/**
 * MVA-melding validation entrypoint (`pnpm mva:validate`). Mirrors `ehf:validate` / `saft:validate`:
 * a CI gate that builds a representative MVA-melding from the pure generator, serializes it, and
 * validates it locally — XML **well-formedness** (fast-xml-parser) + the grounded **schema/sign-rule
 * subset + the exact ledger tie-out** (`validateMvaMelding`, grounded in
 * `db/reference/skatt/mva-melding/`). This is the "start now" check ahead of Skatteetaten's
 * onboarding-gated validation API (wired fail-closed in `app/integrations/skatteetaten/`); it is NOT
 * full XSD validation against the committed schema (that lands with onboarding + egress).
 *
 * Exit 0 when the sample is well-formed AND rule-clean; 1 otherwise (so CI fails on a regression).
 */
import { readFileSync } from 'node:fs';
import { XMLValidator } from 'fast-xml-parser';
import {
  ANNUAL_TERM,
  buildMvaMeldingXml,
  generateMvaMelding,
  indexTaxCodes,
  orgNr,
  parseStandardTaxCodes,
  validateMvaMelding,
  øre,
  type VatCode,
  type VatCodeAggregate,
} from '@saldo/domain';

const codeIndex = indexTaxCodes(
  parseStandardTaxCodes(
    readFileSync(
      new URL('../../../db/reference/saf-t/tax-codes/Standard_Tax_Codes.csv', import.meta.url),
      'utf8',
    ),
  ),
);

const agg = (code: string, g: number, m: number): VatCodeAggregate => ({
  code: code as VatCode,
  grunnlagØre: øre(g),
  merverdiavgiftØre: øre(m),
});

/** A representative term: standard sale, domestic purchase, export, and a cash-neutral reverse charge. */
function sampleAggregates(): VatCodeAggregate[] {
  return [
    agg('3', 200_000_00, 50_000_00 + 2_500_00), // sales output + the reverse-charge self-account leg
    agg('1', 0, -12_000_00), // deductible domestic input VAT
    agg('52', 30_000_00, 0), // zero-rated export turnover
    agg('86', 10_000_00, -2_500_00), // reverse-charge basis + its deduction leg
  ];
}

function main(): number {
  const result = generateMvaMelding(
    sampleAggregates(),
    { orgNr: orgNr('974760673'), year: 2026, term: ANNUAL_TERM, mvaStatus: 'registered_standard' },
    codeIndex,
  );
  if (!result.registered) {
    console.error('✗ mva:validate — generator returned no melding for a registered org');
    return 1;
  }

  let ok = true;
  const xml = buildMvaMeldingXml(result.melding, {
    regnskapssystemsreferanse: 'saldo-sample',
    systemnavn: 'Saldo',
    systemversjon: '0.0.0',
  });

  const wellFormed = XMLValidator.validate(xml);
  if (wellFormed === true) {
    console.log('✓ mva:validate — XML is well-formed');
  } else {
    ok = false;
    console.error(`✗ mva:validate — XML not well-formed: ${wellFormed.err.msg}`);
  }

  const verdict = validateMvaMelding(result.melding, codeIndex);
  if (verdict.ok) {
    console.log('✓ mva:validate — schema subset + sign rule + tie-out: no violations');
  } else {
    ok = false;
    for (const v of verdict.violations) console.error(`✗ ${v.rule}: ${v.message}`);
  }

  if (!ok) {
    console.error(
      'mva:validate FAILED. Note: this is the grounded subset + well-formedness + tie-out, NOT full ' +
        'XSD validation against the committed schema / the Skatteetaten validation API (onboarding-gated).',
    );
  }
  return ok ? 0 : 1;
}

process.exit(main());
