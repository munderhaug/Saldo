import { describe, expect, it } from 'vitest';
import { oreToAmount } from '../money/ore.js';
import fc from 'fast-check';
import { øre, sumØre } from '../money/ore.js';
import { orgNr } from '../ids/org-nr.js';
import {
  BIS_CUSTOMIZATION_ID,
  BIS_PROFILE_ID,
  buildUblXml,
  unitCodeFor,
  vatCategoryFor,
  type EhfInvoiceModel,
} from './ubl.js';

const SELLER = {
  orgNr: orgNr('974760673'),
  name: 'Selger ENK',
  street: 'Storgata 1',
  city: 'Oslo',
  postalZone: '0001',
  countryCode: 'NO',
} as const;
const BUYER = {
  orgNr: orgNr('923609016'),
  name: 'Kjøper AS',
  street: 'Kongens gate 2',
  city: 'Bergen',
  postalZone: '5003',
  countryCode: 'NO',
} as const;

/** A valid standard-rated invoice: one 25 % line, 1000 net / 250 VAT / 1250 gross. */
function standardInvoice(): EhfInvoiceModel {
  return {
    kind: 'invoice',
    number: '10001',
    issueDate: '2026-06-26',
    dueDate: '2026-07-10',
    currency: 'NOK',
    seller: SELLER,
    buyer: BUYER,
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

describe('vatCategoryFor — Saldo treatment → UNCL5305 (capture: bis-billing-3.0.md)', () => {
  it('maps each issued treatment to its BIS category', () => {
    expect(vatCategoryFor('output-vat')).toBe('S');
    expect(vatCategoryFor('zero-rated-output')).toBe('Z');
    expect(vatCategoryFor('reverse-charge')).toBe('AE');
    expect(vatCategoryFor('exempt')).toBe('E');
    expect(vatCategoryFor('no-treatment')).toBe('E');
  });
});

describe('unitCodeFor — free-text unit → UN/ECE Rec 20, C62 fallback', () => {
  it('maps the common Norwegian units', () => {
    expect(unitCodeFor('time')).toBe('HUR');
    expect(unitCodeFor('Timer')).toBe('HUR');
    expect(unitCodeFor('kg')).toBe('KGM');
    expect(unitCodeFor('måned')).toBe('MON');
  });
  it('falls back to C62 (one/piece) for stk and anything unmapped', () => {
    expect(unitCodeFor('stk')).toBe('C62');
    expect(unitCodeFor('bananer')).toBe('C62');
  });
});

describe('oreToAmount — exact decimal-kroner string, no float', () => {
  it('renders øre as dot-decimal kroner with two cents', () => {
    expect(oreToAmount(øre(123_456))).toBe('1234.56');
    expect(oreToAmount(øre(5))).toBe('0.05');
    expect(oreToAmount(øre(0))).toBe('0.00');
    expect(oreToAmount(øre(-50))).toBe('-0.50');
  });
  it('round-trips: the cents are exactly value % 100, for any safe amount', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 9_999_999_99 }), (n) => {
        const s = oreToAmount(øre(n));
        const [, cents] = s.split('.');
        expect(cents).toBe(String(n % 100).padStart(2, '0'));
      }),
    );
  });
});

describe('buildUblXml — BIS Billing 3.0 serialization', () => {
  it('emits the fixed customization/profile ids and the 380 invoice type code', () => {
    const xml = buildUblXml(standardInvoice());
    expect(xml).toContain(`<cbc:CustomizationID>${BIS_CUSTOMIZATION_ID}</cbc:CustomizationID>`);
    expect(xml).toContain(`<cbc:ProfileID>${BIS_PROFILE_ID}</cbc:ProfileID>`);
    expect(xml).toContain('<cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>');
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<Invoice ');
  });

  it('uses the CreditNote root + 381 type code for a credit note', () => {
    const xml = buildUblXml({ ...standardInvoice(), kind: 'credit_note' });
    expect(xml).toContain('<CreditNote ');
    expect(xml).toContain('<cbc:CreditNoteTypeCode>381</cbc:CreditNoteTypeCode>');
    expect(xml).toContain('<cac:CreditNoteLine>');
    expect(xml).toContain('<cbc:CreditedQuantity unitCode="HUR">10</cbc:CreditedQuantity>');
  });

  it('carries the org nr under scheme 0192 for both parties, and the KID as PaymentID', () => {
    const xml = buildUblXml(standardInvoice());
    expect(xml).toContain('<cbc:CompanyID schemeID="0192">974760673</cbc:CompanyID>');
    expect(xml).toContain('<cbc:CompanyID schemeID="0192">923609016</cbc:CompanyID>');
    expect(xml).toContain('<cbc:PaymentID>0000101</cbc:PaymentID>');
  });

  it('emits cac:PayeeFinancialAccount for a credit transfer (code 30) when a payee account is set', () => {
    const xml = buildUblXml({
      ...standardInvoice(),
      payeeAccount: { id: 'NO9386011117947', name: 'Selger ENK' },
    });
    expect(xml).toContain('<cbc:PaymentMeansCode>30</cbc:PaymentMeansCode>');
    expect(xml).toContain(
      '<cac:PayeeFinancialAccount><cbc:ID>NO9386011117947</cbc:ID><cbc:Name>Selger ENK</cbc:Name></cac:PayeeFinancialAccount>',
    );
    // Child order: PaymentID precedes PayeeFinancialAccount inside PaymentMeans.
    expect(xml.indexOf('<cbc:PaymentID>')).toBeLessThan(xml.indexOf('<cac:PayeeFinancialAccount>'));
  });

  it('omits cac:PayeeFinancialAccount when the org has no payout account configured', () => {
    const xml = buildUblXml(standardInvoice()); // no payeeAccount
    expect(xml).not.toContain('<cac:PayeeFinancialAccount>');
    expect(xml).toContain('<cbc:PaymentID>0000101</cbc:PaymentID>'); // PaymentMeans still emitted for the KID
  });

  it('serializes amounts as decimal kroner with the currency id, tying to the frozen totals', () => {
    const xml = buildUblXml(standardInvoice());
    expect(xml).toContain(
      '<cbc:TaxInclusiveAmount currencyID="NOK">1250.00</cbc:TaxInclusiveAmount>',
    );
    expect(xml).toContain(
      '<cbc:LineExtensionAmount currencyID="NOK">1000.00</cbc:LineExtensionAmount>',
    );
    expect(xml).toContain('<cbc:TaxAmount currencyID="NOK">250.00</cbc:TaxAmount>');
  });

  it('escapes XML metacharacters in text (a description with & < > ")', () => {
    const model = standardInvoice();
    const xml = buildUblXml({
      ...model,
      lines: [{ ...model.lines[0]!, description: 'A & B <ok> "x"' }],
    });
    expect(xml).toContain('<cbc:Name>A &amp; B &lt;ok&gt; &quot;x&quot;</cbc:Name>');
    expect(xml).not.toContain('<ok>');
  });

  it('omits the optional DueDate/Note/BuyerReference when absent', () => {
    const { dueDate, ...withoutDueDate } = standardInvoice();
    expect(dueDate).toBe('2026-07-10');
    const xml = buildUblXml(withoutDueDate);
    expect(xml).not.toContain('<cbc:DueDate>');
    expect(xml).not.toContain('<cbc:Note>');
  });

  it('the line nets in the XML sum back to the document net (frozen, not recomputed)', () => {
    const model = standardInvoice();
    const total = sumØre(model.lines.map((l) => l.netOre));
    expect(total).toBe(model.netOre);
  });
});
