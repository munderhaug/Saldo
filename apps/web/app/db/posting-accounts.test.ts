import { describe, expect, it } from 'vitest';
import {
  OPENING_ACCOUNTS,
  OWNER_ACCOUNTS,
  POSTING_ACCOUNTS,
  POSTING_VAT_CODES,
  REVERSE_CHARGE_ACCOUNTS,
  REVERSE_CHARGE_OUTPUT_CODES,
  SALES_INVOICE_ACCOUNTS,
  SETTLEMENT_ACCOUNTS,
  SUPPLIER_INVOICE_ACCOUNTS,
} from './posting.server.js';
import { STANDARD_ACCOUNTS, STANDARD_VAT_CODES } from './provisioning.server.js';

/**
 * Source-grounding guard (ADR 0034, hard invariant): every account number and VAT code the manual
 * voucher path designates must actually exist in the committed SAF-T lists — so the designations are
 * verified against the source, never carried in memory. Provisioning seeds the WHOLE committed lists
 * into a fresh org, so anything present here is present on every org the path posts against.
 */
describe('designated posting accounts/codes are source-grounded', () => {
  const accountNumbers = new Set(STANDARD_ACCOUNTS.map((a) => a.number));
  const vatCodes = new Set(STANDARD_VAT_CODES.map((c) => c.code));

  const designatedAccounts = [
    ...Object.values(POSTING_ACCOUNTS.income),
    ...Object.values(POSTING_ACCOUNTS.expense),
  ];

  it.each(designatedAccounts)('account %s exists in the committed kontoplan', (number) => {
    expect(accountNumbers.has(number)).toBe(true);
  });

  it.each(Object.values(POSTING_VAT_CODES))('VAT code %s exists in the committed list', (code) => {
    expect(vatCodes.has(code)).toBe(true);
  });

  it('designates accounts of the kontoklasse each posting role needs', () => {
    const typeOf = (number: string) => STANDARD_ACCOUNTS.find((a) => a.number === number)?.type;
    // Income: receivable is an asset, revenue is revenue, output VAT is a liability.
    expect(typeOf(POSTING_ACCOUNTS.income.receivable)).toBe('asset');
    expect(typeOf(POSTING_ACCOUNTS.income.revenue)).toBe('revenue');
    expect(typeOf(POSTING_ACCOUNTS.income.outputVat)).toBe('equity_liability');
    // Expense: cost is an expense, input VAT is a liability, payable is a liability.
    expect(typeOf(POSTING_ACCOUNTS.expense.cost)).toBe('expense');
    expect(typeOf(POSTING_ACCOUNTS.expense.inputVat)).toBe('equity_liability');
    expect(typeOf(POSTING_ACCOUNTS.expense.payable)).toBe('equity_liability');
  });

  it('designates VAT codes of the right direction', () => {
    const dirOf = (code: string) => STANDARD_VAT_CODES.find((c) => c.code === code)?.direction;
    expect(dirOf(POSTING_VAT_CODES.output)).toBe('output');
    expect(dirOf(POSTING_VAT_CODES.input)).toBe('input');
  });

  // ── Sales-invoice AR posting (feat-invoice-ledger-posting) ──
  const salesInvoiceAccounts = [
    SALES_INVOICE_ACCOUNTS.receivable,
    ...Object.values(SALES_INVOICE_ACCOUNTS.outputVatByRate),
  ];

  it.each(salesInvoiceAccounts)(
    'sales-invoice account %s exists in the committed kontoplan',
    (number) => {
      expect(accountNumbers.has(number)).toBe(true);
    },
  );

  it('designates an asset receivable and liability output-VAT accounts by rate', () => {
    const typeOf = (number: string) => STANDARD_ACCOUNTS.find((a) => a.number === number)?.type;
    expect(typeOf(SALES_INVOICE_ACCOUNTS.receivable)).toBe('asset');
    for (const number of Object.values(SALES_INVOICE_ACCOUNTS.outputVatByRate)) {
      expect(typeOf(number)).toBe('equity_liability');
    }
  });

  // ── Bank-payment settlement posting (feat-reconciliation) ──
  it.each(Object.values(SETTLEMENT_ACCOUNTS))(
    'settlement account %s exists in the committed kontoplan',
    (number) => {
      expect(accountNumbers.has(number)).toBe(true);
    },
  );

  it('settles bank against an asset bank account and the AR/AP liability/asset', () => {
    const typeOf = (number: string) => STANDARD_ACCOUNTS.find((a) => a.number === number)?.type;
    expect(typeOf(SETTLEMENT_ACCOUNTS.bank)).toBe('asset'); // 1920 Bankinnskudd
    expect(typeOf(SETTLEMENT_ACCOUNTS.receivable)).toBe('asset'); // 1500 Kundefordringer
    expect(typeOf(SETTLEMENT_ACCOUNTS.payable)).toBe('equity_liability'); // 2400 Leverandørgjeld
  });

  // ── Reverse-charge dual-leg posting (vat-reverse-charge) ──
  const reverseChargeAccounts = Object.values(REVERSE_CHARGE_ACCOUNTS).flatMap((kind) => [
    ...Object.values(kind.output),
    ...Object.values(kind.input),
  ]);

  it.each(reverseChargeAccounts)(
    'reverse-charge VAT account %s exists in the committed kontoplan',
    (number) => {
      expect(accountNumbers.has(number)).toBe(true);
    },
  );

  it('designates the reverse-charge VAT accounts as liabilities (klasse 2)', () => {
    const typeOf = (number: string) => STANDARD_ACCOUNTS.find((a) => a.number === number)?.type;
    for (const number of reverseChargeAccounts) {
      expect(typeOf(number)).toBe('equity_liability');
    }
  });

  it('the self-account output codes exist and are output-direction (counted on the MVA basis)', () => {
    const dirOf = (code: string) => STANDARD_VAT_CODES.find((c) => c.code === code)?.direction;
    for (const code of Object.values(REVERSE_CHARGE_OUTPUT_CODES)) {
      expect(vatCodes.has(code)).toBe(true);
      expect(dirOf(code)).toBe('output');
    }
  });

  it('sources output accounts from the 270x range and input accounts from the 271x range', () => {
    // Source-grounded sanity: every self-account (output) leg books to 2704–2709, every deduction
    // (input) leg to 2714–2718 — the committed reverse-charge VAT accounts (db/reference/saf-t).
    for (const kind of Object.values(REVERSE_CHARGE_ACCOUNTS)) {
      for (const number of Object.values(kind.output)) expect(number).toMatch(/^270[4-9]$/);
      for (const number of Object.values(kind.input)) expect(number).toMatch(/^271[4-8]$/);
    }
  });

  // ── Supplier-invoice AP posting (feat-supplier-invoices) ──
  it.each(Object.values(SUPPLIER_INVOICE_ACCOUNTS))(
    'supplier-invoice account %s exists in the committed kontoplan',
    (number) => {
      expect(accountNumbers.has(number)).toBe(true);
    },
  );

  it('designates a liability supplier payable and an input-VAT account', () => {
    const typeOf = (number: string) => STANDARD_ACCOUNTS.find((a) => a.number === number)?.type;
    expect(typeOf(SUPPLIER_INVOICE_ACCOUNTS.payable)).toBe('equity_liability'); // 2400 Leverandørgjeld
    expect(typeOf(SUPPLIER_INVOICE_ACCOUNTS.inputVat)).toBe('equity_liability'); // 2710 Inngående mva
  });

  // ── Owner-economy events: drawings / outlay / mileage / diett (feat-supplier-invoices) ──
  const ownerAccounts = [
    OWNER_ACCOUNTS.drawings,
    OWNER_ACCOUNTS.equity,
    OWNER_ACCOUNTS.bank,
    OWNER_ACCOUNTS.inputVat,
    ...Object.values(OWNER_ACCOUNTS.cost),
  ];

  it.each(ownerAccounts)('owner-event account %s exists in the committed kontoplan', (number) => {
    expect(accountNumbers.has(number)).toBe(true);
  });

  it('designates owner equity (klasse 2) against a bank asset and expense cost accounts', () => {
    const typeOf = (number: string) => STANDARD_ACCOUNTS.find((a) => a.number === number)?.type;
    expect(typeOf(OWNER_ACCOUNTS.drawings)).toBe('equity_liability'); // 2060 Uttak kontanter
    expect(typeOf(OWNER_ACCOUNTS.equity)).toBe('equity_liability'); // 2062 Innskudd kontanter
    expect(typeOf(OWNER_ACCOUNTS.bank)).toBe('asset'); // 1920 Bankinnskudd
    for (const number of Object.values(OWNER_ACCOUNTS.cost)) {
      expect(typeOf(number)).toBe('expense'); // 7798 / 7100 / 7160
    }
  });

  // ── Opening balance (feat-opening-balances) ──
  const openingAccounts = [
    ...Object.values(OPENING_ACCOUNTS.own),
    ...Object.values(OPENING_ACCOUNTS.owe),
    OPENING_ACCOUNTS.equity,
  ];

  it.each(openingAccounts)('opening account %s exists in the committed kontoplan', (number) => {
    expect(accountNumbers.has(number)).toBe(true);
  });

  it('opens ASSETS on the own side and LIABILITIES on the owe side, plugged to equity', () => {
    const typeOf = (number: string) => STANDARD_ACCOUNTS.find((a) => a.number === number)?.type;
    for (const number of Object.values(OPENING_ACCOUNTS.own)) {
      expect(typeOf(number)).toBe('asset'); // 1920 / 1500 / 1250
    }
    for (const number of Object.values(OPENING_ACCOUNTS.owe)) {
      expect(typeOf(number)).toBe('equity_liability'); // 2400 / 2740
    }
    expect(typeOf(OPENING_ACCOUNTS.equity)).toBe('equity_liability'); // 2050 Annen egenkapital
  });
});
