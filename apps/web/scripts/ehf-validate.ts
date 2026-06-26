/**
 * EHF / PEPPOL BIS Billing 3.0 validation entrypoint (`pnpm ehf:validate`). Mirrors `saft:validate`:
 * a CI gate that builds a representative e-invoice from the pure generator and validates it locally —
 * XML **well-formedness** (fast-xml-parser) + the enforced **BIS business-rule subset** (`validateEhf`,
 * grounded in `db/reference/peppol/bis-billing-3.0.md`). This is the build-spec §9 "start now" check
 * ahead of the commercial access point (`feat-peppol-send`); it is NOT the full VEFA Schematron.
 *
 * Exit 0 when the sample is well-formed AND rule-clean; 1 otherwise (so CI fails on a generator regression).
 */
import { XMLValidator } from 'fast-xml-parser';
import { buildUblXml, orgNr, validateEhf, øre, type EhfInvoiceModel } from '@saldo/domain';

/** A representative, tied-out standard-rated invoice (the happy path the generator must keep valid). */
function sample(): EhfInvoiceModel {
  return {
    kind: 'invoice',
    number: '10001',
    issueDate: '2026-06-26',
    dueDate: '2026-07-10',
    currency: 'NOK',
    seller: { orgNr: orgNr('974760673'), name: 'Selger ENK', city: 'Oslo', countryCode: 'NO' },
    buyer: { orgNr: orgNr('923609016'), name: 'Kjøper AS', city: 'Bergen', countryCode: 'NO' },
    paymentReference: '0000101',
    lines: [
      {
        id: '1',
        description: 'Konsulenttime',
        quantity: '10',
        unit: 'time',
        unitPriceOre: øre(10_000),
        netOre: øre(100_000),
        vatCategory: 'S',
        vatPercent: 25,
      },
    ],
    taxSubtotals: [{ category: 'S', percent: 25, baseOre: øre(100_000), vatOre: øre(25_000) }],
    netOre: øre(100_000),
    vatOre: øre(25_000),
    grossOre: øre(125_000),
  };
}

function main(): number {
  const model = sample();
  const xml = buildUblXml(model);
  let ok = true;

  const wellFormed = XMLValidator.validate(xml);
  if (wellFormed === true) {
    console.log('✓ ehf:validate — XML is well-formed');
  } else {
    ok = false;
    console.error(`✗ ehf:validate — XML not well-formed: ${wellFormed.err.msg}`);
  }

  const result = validateEhf(model);
  if (result.ok) {
    console.log('✓ ehf:validate — BIS Billing 3.0 subset: no violations');
  } else {
    ok = false;
    for (const v of result.violations) console.error(`✗ ${v.rule}: ${v.message}`);
  }

  if (!ok) {
    console.error(
      'ehf:validate FAILED. Note: this is the enforced subset + well-formedness, NOT the full VEFA ' +
        'Schematron (deferred to feat-peppol-send).',
    );
  }
  return ok ? 0 : 1;
}

process.exit(main());
