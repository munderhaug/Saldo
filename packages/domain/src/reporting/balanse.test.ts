import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { øre, addØre } from '../money/ore.js';
import type { AccountNo } from '../posting/types.js';
import type { LedgerAccountBalance } from './account-balance.js';
import { buildResultat } from './resultat.js';
import { buildBalanse } from './balanse.js';

const bal = (number: string, debit: number, credit: number): LedgerAccountBalance => ({
  number: number as AccountNo,
  name: number,
  debitØre: øre(debit),
  creditØre: øre(credit),
});

/**
 * Accumulate a list of balanced vouchers (debitAccount, creditAccount, amount) into per-account
 * debit/credit totals — the way the SQL aggregation does. The whole ledger balances by construction, so
 * the balanse must balance (eiendeler = egenkapital og gjeld + årsresultat).
 */
function ledgerFromVouchers(
  vouchers: ReadonlyArray<{ debit: string; credit: string; amount: number }>,
): LedgerAccountBalance[] {
  const acc = new Map<string, { debit: number; credit: number }>();
  const bump = (n: string, d: number, c: number) => {
    const cur = acc.get(n) ?? { debit: 0, credit: 0 };
    acc.set(n, { debit: cur.debit + d, credit: cur.credit + c });
  };
  for (const v of vouchers) {
    bump(v.debit, v.amount, 0);
    bump(v.credit, 0, v.amount);
  }
  return [...acc.entries()].map(([number, { debit, credit }]) => bal(number, debit, credit));
}

describe('buildBalanse', () => {
  it('a simple year balances: eiendeler = gjeld/egenkapital + årsresultat', () => {
    // Sale: debit 1500 125 000, credit 3000 100 000 + 2700 25 000.
    const balances = [bal('1500', 125_000, 0), bal('3000', 0, 100_000), bal('2700', 0, 25_000)];
    const resultat = buildResultat(balances);
    const b = buildBalanse(balances, resultat.aarsresultatØre);
    expect(b.eiendelerØre).toBe(øre(125_000));
    expect(b.egenkapitalGjeldØre).toBe(øre(25_000)); // output VAT owed
    expect(b.aarsresultatØre).toBe(øre(100_000));
    expect(b.sumEgenkapitalGjeldØre).toBe(øre(125_000));
    expect(b.differanseØre).toBe(øre(0));
    expect(b.balanserer).toBe(true);
  });

  it('only klasse 1 / klasse 2 accounts appear on the two sides', () => {
    const balances = [bal('1920', 50_000, 0), bal('2400', 0, 50_000), bal('3000', 0, 0)];
    const b = buildBalanse(balances, øre(0));
    expect(b.eiendeler.map((l) => l.number)).toEqual(['1920']);
    expect(b.egenkapitalGjeld.map((l) => l.number)).toEqual(['2400']);
  });

  it('places klasse-8 disposition accounts (privatuttak) on the equity side, and still balances', () => {
    // Sale 125 000 (AR/revenue/VAT) then an owner draw: privatuttak 8980 30 000 out of the bank.
    const balances = [
      bal('1500', 125_000, 0),
      bal('1920', 0, 30_000),
      bal('3000', 0, 100_000),
      bal('2700', 0, 25_000),
      bal('8980', 30_000, 0), // privatuttak — equity disposition
    ];
    const resultat = buildResultat(balances);
    const b = buildBalanse(balances, resultat.aarsresultatØre);
    expect(resultat.aarsresultatØre).toBe(øre(100_000)); // privatuttak NOT in the result
    expect(b.egenkapitalGjeld.map((l) => l.number)).toContain('8980');
    expect(b.balanserer).toBe(true); // eiendeler 95 000 = (VAT 25 000 − privatuttak 30 000) + 100 000
    expect(b.eiendelerØre).toBe(øre(95_000));
  });

  it('any balanced ledger balances, with årsresultat from the resultat (property)', () => {
    const account = fc
      .tuple(
        fc.constantFrom('1', '2', '3', '4', '5', '6', '7', '8'),
        fc.integer({ min: 0, max: 50 }),
      )
      .map(([k, n]) => `${k}${String(n).padStart(3, '0')}`);
    const voucherArb = fc.record({
      debit: account,
      credit: account,
      amount: fc.nat(2_000_000),
    });
    fc.assert(
      fc.property(fc.array(voucherArb, { maxLength: 40 }), (vouchers) => {
        const balances = ledgerFromVouchers(vouchers);
        const resultat = buildResultat(balances);
        const b = buildBalanse(balances, resultat.aarsresultatØre);
        expect(b.balanserer).toBe(true);
        expect(b.differanseØre).toBe(øre(0));
        // The result line equals eiendeler − (egenkapital og gjeld).
        expect(addØre(b.egenkapitalGjeldØre, b.aarsresultatØre)).toBe(b.eiendelerØre);
      }),
    );
  });
});
