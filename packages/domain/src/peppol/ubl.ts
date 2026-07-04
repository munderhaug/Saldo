/**
 * EHF / PEPPOL BIS Billing 3.0 generation (build-spec §9, "start now"). PURE: it maps Saldo's FROZEN
 * sales document onto a UBL 2.1 `Invoice` / `CreditNote` and serializes it to XML — no I/O, no clock.
 * It NEVER recomputes money: line nets, VAT and totals are the immutable øre the document was issued
 * with (the renderer echoes them; the ledger is the record). Every identifier scheme, type code and
 * VAT-category mapping comes from the committed capture `db/reference/peppol/bis-billing-3.0.md`, never
 * from memory (hard invariant §4.3).
 *
 * Scope is the documented subset (mandatory fields, the four VAT categories Saldo issues, document
 * money rules) ahead of the commercial access point — the full VEFA Schematron + transmission are
 * `feat-peppol-send` (Phase 9). Validation of a built model is `./validate.ts`.
 */
import { escapeXml as esc } from '../xml/escape.js';
import { oreToAmount, type Øre } from '../money/ore.js';
import type { OrgNr } from '../ids/org-nr.js';
import type { VatTreatment } from '../vat/line-treatment.js';

/** Fixed PEPPOL BIS Billing 3.0 wire identifiers (capture: bis-billing-3.0.md). */
export const BIS_CUSTOMIZATION_ID =
  'urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0';
export const BIS_PROFILE_ID = 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0';
/** ISO 6523 scheme id for a Norwegian organisation number (party + endpoint identifiers). */
const NO_ORGNR_SCHEME = '0192';

/** UNCL5305 VAT category codes Saldo issues (capture: bis-billing-3.0.md). */
export type UnclVatCategory = 'S' | 'Z' | 'E' | 'AE';

/**
 * Map a Saldo line treatment to its BIS VAT category. Treatment-driven (from the committed SAF-T code
 * via `checkSalesLine`), never code-number-driven. `input-deductible` cannot reach a sales document
 * (the sales gate blocks it); it is mapped to `E` defensively rather than thrown, so a malformed caller
 * still yields a document the validator can reject.
 */
export function vatCategoryFor(treatment: VatTreatment): UnclVatCategory {
  switch (treatment) {
    case 'output-vat':
      return 'S';
    case 'zero-rated-output':
      return 'Z';
    case 'reverse-charge':
      return 'AE';
    case 'exempt':
    case 'no-treatment':
    case 'input-deductible':
      return 'E';
  }
}

/** UN/ECE Rec 20 unit code for a free-text Saldo unit; falls back to `C62` (one/piece). */
export function unitCodeFor(unit: string): string {
  switch (unit.trim().toLowerCase()) {
    case 'time':
    case 't':
    case 'timer':
    case 'hour':
    case 'hr':
      return 'HUR';
    case 'dag':
    case 'dager':
    case 'day':
      return 'DAY';
    case 'kg':
    case 'kilo':
      return 'KGM';
    case 'km':
      return 'KMT';
    case 'liter':
    case 'l':
      return 'LTR';
    case 'mnd':
    case 'måned':
    case 'month':
      return 'MON';
    default:
      return 'C62';
  }
}

/** A party (seller or buyer) on the document. Address fields are optional so an incomplete org still
 * produces a document the validator flags (BR-08…BR-11), rather than the builder throwing. */
export interface EhfParty {
  readonly orgNr: OrgNr;
  readonly name: string;
  readonly street?: string;
  readonly city?: string;
  readonly postalZone?: string;
  /** ISO 3166-1 alpha-2 (default `NO`). */
  readonly countryCode?: string;
}

/** One invoice line, with its frozen money and resolved VAT category/rate. */
export interface EhfLine {
  readonly id: string;
  readonly description: string;
  /** Quantity as an exact decimal string (the DB `numeric`), e.g. `"2.5"`. */
  readonly quantity: string;
  readonly unit: string;
  readonly unitPriceOre: Øre;
  /** Frozen line net (line extension amount). */
  readonly netOre: Øre;
  readonly vatCategory: UnclVatCategory;
  /** VAT percent for the category (25, 15, 0…) — display/identifier only; money is never re-derived. */
  readonly vatPercent: number;
}

/** One VAT breakdown row (`cac:TaxSubtotal`) — taxable base + tax for a category/rate, from frozen øre. */
export interface EhfTaxSubtotal {
  readonly category: UnclVatCategory;
  readonly percent: number;
  readonly baseOre: Øre;
  readonly vatOre: Øre;
}

/** The fully-resolved EHF document model (the web layer assembles it from the frozen invoice). */
export interface EhfInvoiceModel {
  readonly kind: 'invoice' | 'credit_note';
  readonly number: string;
  /** ISO calendar date `YYYY-MM-DD`. */
  readonly issueDate: string;
  readonly dueDate?: string;
  /** ISO 4217 currency, e.g. `NOK`. */
  readonly currency: string;
  readonly seller: EhfParty;
  readonly buyer: EhfParty;
  readonly buyerReference?: string;
  /** Payment reference (Saldo's KID), surfaced as `cbc:PaymentID`. */
  readonly paymentReference?: string;
  /** Seller's payee bank account for a credit transfer (PaymentMeansCode 30) — `cac:PayeeFinancialAccount`.
   * `id` is the BBAN/IBAN (cbc:ID); `name` (optional) is the account holder (cbc:Name). */
  readonly payeeAccount?: { readonly id: string; readonly name?: string };
  readonly lines: readonly EhfLine[];
  readonly taxSubtotals: readonly EhfTaxSubtotal[];
  /** Frozen document totals (Σ line net, Σ VAT, gross). */
  readonly netOre: Øre;
  readonly vatOre: Øre;
  readonly grossOre: Øre;
  readonly notes?: string;
}

/** A VAT percent as a UBL numeric string (no trailing-zero noise): 25 → `"25"`, 11.11 → `"11.11"`. */
function percentStr(percent: number): string {
  return String(percent);
}

/** The currency-carrying amount element (UBL amounts require the `currencyID` attribute). */
function amount(tag: string, value: Øre, currency: string): string {
  return `<cbc:${tag} currencyID="${esc(currency)}">${oreToAmount(value)}</cbc:${tag}>`;
}

function partyXml(
  role: 'AccountingSupplierParty' | 'AccountingCustomerParty',
  p: EhfParty,
): string {
  const country = p.countryCode ?? 'NO';
  return [
    `<cac:${role}>`,
    `<cac:Party>`,
    `<cbc:EndpointID schemeID="${NO_ORGNR_SCHEME}">${esc(p.orgNr)}</cbc:EndpointID>`,
    `<cac:PostalAddress>`,
    p.street ? `<cbc:StreetName>${esc(p.street)}</cbc:StreetName>` : '',
    p.city ? `<cbc:CityName>${esc(p.city)}</cbc:CityName>` : '',
    p.postalZone ? `<cbc:PostalZone>${esc(p.postalZone)}</cbc:PostalZone>` : '',
    `<cac:Country><cbc:IdentificationCode>${esc(country)}</cbc:IdentificationCode></cac:Country>`,
    `</cac:PostalAddress>`,
    `<cac:PartyLegalEntity>`,
    `<cbc:RegistrationName>${esc(p.name)}</cbc:RegistrationName>`,
    `<cbc:CompanyID schemeID="${NO_ORGNR_SCHEME}">${esc(p.orgNr)}</cbc:CompanyID>`,
    `</cac:PartyLegalEntity>`,
    `</cac:Party>`,
    `</cac:${role}>`,
  ]
    .filter((s) => s !== '')
    .join('');
}

function taxSubtotalXml(s: EhfTaxSubtotal, currency: string): string {
  return [
    `<cac:TaxSubtotal>`,
    amount('TaxableAmount', s.baseOre, currency),
    amount('TaxAmount', s.vatOre, currency),
    `<cac:TaxCategory>`,
    `<cbc:ID>${s.category}</cbc:ID>`,
    `<cbc:Percent>${percentStr(s.percent)}</cbc:Percent>`,
    `<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>`,
    `</cac:TaxCategory>`,
    `</cac:TaxSubtotal>`,
  ].join('');
}

function lineXml(line: EhfLine, currency: string, isCreditNote: boolean): string {
  const qtyTag = isCreditNote ? 'CreditedQuantity' : 'InvoicedQuantity';
  const lineTag = isCreditNote ? 'CreditNoteLine' : 'InvoiceLine';
  return [
    `<cac:${lineTag}>`,
    `<cbc:ID>${esc(line.id)}</cbc:ID>`,
    `<cbc:${qtyTag} unitCode="${unitCodeFor(line.unit)}">${esc(line.quantity)}</cbc:${qtyTag}>`,
    amount('LineExtensionAmount', line.netOre, currency),
    `<cac:Item>`,
    `<cbc:Name>${esc(line.description)}</cbc:Name>`,
    `<cac:ClassifiedTaxCategory>`,
    `<cbc:ID>${line.vatCategory}</cbc:ID>`,
    `<cbc:Percent>${percentStr(line.vatPercent)}</cbc:Percent>`,
    `<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>`,
    `</cac:ClassifiedTaxCategory>`,
    `</cac:Item>`,
    `<cac:Price>${amount('PriceAmount', line.unitPriceOre, currency)}</cac:Price>`,
    `</cac:${lineTag}>`,
  ].join('');
}

/**
 * Serialize the model to BIS Billing 3.0 XML. Well-formed by construction (every text node + attribute
 * is escaped). The root is `Invoice` or `CreditNote` per `kind`; the document type code follows
 * (380 / 381). Amounts are decimal kroner derived from the frozen øre by exact string assembly.
 */
export function buildUblXml(model: EhfInvoiceModel): string {
  const isCreditNote = model.kind === 'credit_note';
  const root = isCreditNote ? 'CreditNote' : 'Invoice';
  const typeTag = isCreditNote ? 'CreditNoteTypeCode' : 'InvoiceTypeCode';
  const typeCode = isCreditNote ? '381' : '380';
  const ns = [
    `xmlns="urn:oasis:names:specification:ubl:schema:xsd:${root}-2"`,
    `xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"`,
    `xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"`,
  ].join(' ');

  const head = [
    `<cbc:CustomizationID>${BIS_CUSTOMIZATION_ID}</cbc:CustomizationID>`,
    `<cbc:ProfileID>${BIS_PROFILE_ID}</cbc:ProfileID>`,
    `<cbc:ID>${esc(model.number)}</cbc:ID>`,
    `<cbc:IssueDate>${esc(model.issueDate)}</cbc:IssueDate>`,
    model.dueDate ? `<cbc:DueDate>${esc(model.dueDate)}</cbc:DueDate>` : '',
    `<cbc:${typeTag}>${typeCode}</cbc:${typeTag}>`,
    model.notes ? `<cbc:Note>${esc(model.notes)}</cbc:Note>` : '',
    `<cbc:DocumentCurrencyCode>${esc(model.currency)}</cbc:DocumentCurrencyCode>`,
    model.buyerReference
      ? `<cbc:BuyerReference>${esc(model.buyerReference)}</cbc:BuyerReference>`
      : '',
  ]
    .filter((s) => s !== '')
    .join('');

  // cac:PaymentMeans for a credit transfer (code 30). Emit when there is either a payment reference
  // (KID) or a payee account; UBL child order is PaymentMeansCode → PaymentID → PayeeFinancialAccount.
  // PayeeFinancialAccount/cbc:ID (the seller's bank account) is required by BIS for code 30 — emitted
  // whenever the org has configured a payout account (review §5).
  const paymentChildren = [
    `<cbc:PaymentMeansCode>30</cbc:PaymentMeansCode>`,
    model.paymentReference ? `<cbc:PaymentID>${esc(model.paymentReference)}</cbc:PaymentID>` : '',
    model.payeeAccount
      ? [
          `<cac:PayeeFinancialAccount>`,
          `<cbc:ID>${esc(model.payeeAccount.id)}</cbc:ID>`,
          model.payeeAccount.name ? `<cbc:Name>${esc(model.payeeAccount.name)}</cbc:Name>` : '',
          `</cac:PayeeFinancialAccount>`,
        ].join('')
      : '',
  ].filter((s) => s !== '');
  const payment =
    model.paymentReference || model.payeeAccount
      ? [`<cac:PaymentMeans>`, ...paymentChildren, `</cac:PaymentMeans>`].join('')
      : '';

  const taxTotal = [
    `<cac:TaxTotal>`,
    amount('TaxAmount', model.vatOre, model.currency),
    ...model.taxSubtotals.map((s) => taxSubtotalXml(s, model.currency)),
    `</cac:TaxTotal>`,
  ].join('');

  const monetaryTotal = [
    `<cac:LegalMonetaryTotal>`,
    amount('LineExtensionAmount', model.netOre, model.currency),
    amount('TaxExclusiveAmount', model.netOre, model.currency),
    amount('TaxInclusiveAmount', model.grossOre, model.currency),
    amount('PayableAmount', model.grossOre, model.currency),
    `</cac:LegalMonetaryTotal>`,
  ].join('');

  const body = [
    head,
    partyXml('AccountingSupplierParty', model.seller),
    partyXml('AccountingCustomerParty', model.buyer),
    payment,
    taxTotal,
    monetaryTotal,
    ...model.lines.map((l) => lineXml(l, model.currency, isCreditNote)),
  ]
    .filter((s) => s !== '')
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<${root} ${ns}>${body}</${root}>`;
}
