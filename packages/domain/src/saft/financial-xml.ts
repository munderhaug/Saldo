/**
 * SAF-T Financial XML serialization (Norwegian SAF-T Financial schema v1.10). PURE: maps the generated
 * {@link SaftFinancial} model onto the committed schema's element tree (`AuditFile` →
 * `Header`/`MasterFiles`/`GeneralLedgerEntries`) and serializes it. Element names, ORDER, the
 * `xs:choice` balance/amount groups and the namespace are grounded in the committed schema
 * (`db/reference/saf-t/schema/`), never memorised — XSD validity is asserted by `pnpm saft:validate`.
 *
 * Amounts render in the schema's `SAFmonetaryType` (2-decimal kroner) via {@link amount}; the model
 * holds exact integer øre and the conversion is integer-safe (øre IS hundredths of a krone — no float
 * rounding). Well-formedness is checked at the app/script boundary (fast-xml-parser + xmllint), exactly
 * as `peppol/ubl` and `mva-melding/xml` pair with a boundary check.
 */
import { escapeXml as esc } from '../xml/escape.js';
import type { Øre } from '../money/ore.js';
import type {
  SaftFinancial,
  SaftAccountMaster,
  SaftBalance,
  SaftEntryLine,
  SaftJournal,
  SaftPartyInput,
  SaftTaxCodeMaster,
  SaftTransaction,
} from './financial.js';

export const SAFT_NAMESPACE = 'urn:StandardAuditFile-Taxation-Financial:NO';

/** The SAF-T Financial standard major version this export targets (committed schema v1.10). */
const AUDIT_FILE_VERSION = '1.0';

/** Identity of the generating accounting system (Header software fields). */
export interface SaftSystemInfo {
  readonly softwareCompanyName: string;
  readonly softwareId: string;
  readonly softwareVersion: string;
  /** ISO date `YYYY-MM-DD` the file was created — injected (the domain is clock-free). */
  readonly dateCreated: string;
}

/** A leaf element `<tag>escaped</tag>`. */
function el(tag: string, value: string | number): string {
  return `<${tag}>${esc(String(value))}</${tag}>`;
}

/**
 * Integer øre → `SAFmonetaryType` (2-decimal). Integer-safe: kroner and the øre remainder are taken
 * with integer division/modulo, so no float decimal is ever formed. Negative is signed (`-5.00`).
 */
function amount(øre: Øre): string {
  const n = Number(øre);
  const neg = n < 0;
  const abs = neg ? -n : n;
  const kr = (abs - (abs % 100)) / 100;
  const rem = abs % 100;
  return `${neg ? '-' : ''}${kr}.${String(rem).padStart(2, '0')}`;
}

/** `<AmountStructure>` with only the required `<Amount>` (default-currency export). */
function amountEl(tag: string, øre: Øre): string {
  return `<${tag}>${el('Amount', amount(øre))}</${tag}>`;
}

/** The debit/credit balance element pair for an account's opening/closing `xs:choice`. */
function balanceEl(prefix: 'Opening' | 'Closing', b: SaftBalance): string {
  const tag = b.side === 'debit' ? `${prefix}DebitBalance` : `${prefix}CreditBalance`;
  return el(tag, amount(b.amountØre));
}

function accountXml(a: SaftAccountMaster): string {
  return [
    '<Account>',
    el('AccountID', a.id),
    el('AccountDescription', a.description),
    a.standardId !== undefined ? el('StandardAccountID', a.standardId) : '',
    el('AccountType', 'GL'),
    balanceEl('Opening', a.opening),
    balanceEl('Closing', a.closing),
    '</Account>',
  ].join('');
}

/** A party (customer/supplier) — `CompanyStructure` fields then the `*ID`. Address is required (≥1). */
function partyXml(p: SaftPartyInput, idTag: 'CustomerID' | 'SupplierID'): string {
  const addressParts = [
    p.addressLine !== undefined ? el('StreetName', p.addressLine) : '',
    p.city !== undefined ? el('City', p.city) : '',
    p.postalCode !== undefined ? el('PostalCode', p.postalCode) : '',
    el('Country', p.countryCode),
  ].join('');
  return [
    idTag === 'CustomerID' ? '<Customer>' : '<Supplier>',
    p.orgNr !== undefined ? el('RegistrationNumber', p.orgNr) : '',
    el('Name', p.name),
    `<Address>${addressParts}</Address>`,
    el(idTag, p.id),
    idTag === 'CustomerID' ? '</Customer>' : '</Supplier>',
  ].join('');
}

function taxCodeXml(c: SaftTaxCodeMaster): string {
  return [
    '<TaxCodeDetails>',
    el('TaxCode', c.code),
    el('Description', c.description),
    el('TaxPercentage', c.percent),
    el('Country', 'NO'),
    el('StandardTaxCode', c.standardCode),
    el('BaseRate', '100'),
    '</TaxCodeDetails>',
  ].join('');
}

function lineXml(l: SaftEntryLine): string {
  const taxInfo =
    l.tax !== undefined
      ? [
          '<TaxInformation>',
          el('TaxType', 'MVA'),
          el('TaxCode', l.tax.code),
          el('TaxPercentage', l.tax.percent),
          amountEl('TaxAmount', l.tax.amountØre),
          '</TaxInformation>',
        ].join('')
      : '';
  return [
    '<Line>',
    el('RecordID', l.recordId),
    el('AccountID', l.accountId),
    l.customerId !== undefined ? el('CustomerID', l.customerId) : '',
    l.supplierId !== undefined ? el('SupplierID', l.supplierId) : '',
    el('Description', l.description),
    amountEl(l.side === 'debit' ? 'DebitAmount' : 'CreditAmount', l.amountØre),
    taxInfo,
    '</Line>',
  ].join('');
}

function transactionXml(t: SaftTransaction): string {
  return [
    '<Transaction>',
    el('TransactionID', t.id),
    el('Period', t.period),
    el('PeriodYear', t.periodYear),
    el('TransactionDate', t.date),
    el('Description', t.description),
    el('SystemEntryDate', t.date),
    el('GLPostingDate', t.date),
    ...t.lines.map(lineXml),
    '</Transaction>',
  ].join('');
}

function journalXml(j: SaftJournal): string {
  return [
    '<Journal>',
    el('JournalID', j.id),
    el('Description', j.description),
    el('Type', j.type),
    ...j.transactions.map(transactionXml),
    '</Journal>',
  ].join('');
}

/** Serialize a {@link SaftFinancial} model to an XSD-valid SAF-T Financial `AuditFile` document. */
export function buildSaftXml(model: SaftFinancial, system: SaftSystemInfo): string {
  const { company } = model;
  const contactPerson = splitName(company.name);

  const header = [
    '<Header>',
    el('AuditFileVersion', AUDIT_FILE_VERSION),
    el('AuditFileCountry', 'NO'),
    el('AuditFileDateCreated', system.dateCreated),
    el('SoftwareCompanyName', system.softwareCompanyName),
    el('SoftwareID', system.softwareId),
    el('SoftwareVersion', system.softwareVersion),
    '<Company>',
    el('RegistrationNumber', company.orgNr),
    el('Name', company.name),
    `<Address>${el('Country', 'NO')}</Address>`,
    `<Contact><ContactPerson>${el('FirstName', contactPerson.first)}${el(
      'LastName',
      contactPerson.last,
    )}</ContactPerson></Contact>`,
    '</Company>',
    el('DefaultCurrencyCode', 'NOK'),
    '<SelectionCriteria>',
    el('SelectionStartDate', `${company.year}-01-01`),
    el('SelectionEndDate', `${company.year}-12-31`),
    '</SelectionCriteria>',
    el('TaxAccountingBasis', 'A'),
    '</Header>',
  ].join('');

  const masterFiles = [
    '<MasterFiles>',
    `<GeneralLedgerAccounts>${model.accounts.map(accountXml).join('')}</GeneralLedgerAccounts>`,
    model.customers.length > 0
      ? `<Customers>${model.customers.map((c) => partyXml(c, 'CustomerID')).join('')}</Customers>`
      : '',
    model.suppliers.length > 0
      ? `<Suppliers>${model.suppliers.map((s) => partyXml(s, 'SupplierID')).join('')}</Suppliers>`
      : '',
    model.taxCodes.length > 0
      ? `<TaxTable><TaxTableEntry>${el('TaxType', 'MVA')}${el(
          'Description',
          'Merverdiavgift',
        )}${model.taxCodes.map(taxCodeXml).join('')}</TaxTableEntry></TaxTable>`
      : '',
    '</MasterFiles>',
  ].join('');

  const entries = [
    '<GeneralLedgerEntries>',
    el('NumberOfEntries', model.numberOfEntries),
    amountValue('TotalDebit', model.totalDebitØre),
    amountValue('TotalCredit', model.totalCreditØre),
    ...model.journals.map(journalXml),
    '</GeneralLedgerEntries>',
  ].join('');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<AuditFile xmlns="${SAFT_NAMESPACE}">`,
    header,
    masterFiles,
    entries,
    '</AuditFile>',
  ].join('');
}

/** `TotalDebit`/`TotalCredit` are bare `SAFmonetaryType`, not an AmountStructure. */
function amountValue(tag: string, øre: Øre): string {
  return el(tag, amount(øre));
}

/** Split a name into first/last for a `PersonNameStructure` (both required). Single token → reused. */
function splitName(name: string): { first: string; last: string } {
  const trimmed = name.trim();
  const idx = trimmed.lastIndexOf(' ');
  if (idx <= 0) return { first: trimmed, last: trimmed };
  return { first: trimmed.slice(0, idx), last: trimmed.slice(idx + 1) };
}
