import { describe, expect, it } from 'vitest';
import { POSTING_ACCOUNTS, POSTING_VAT_CODES, SALES_INVOICE_ACCOUNTS } from './posting.server.js';
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
});
