/**
 * SAF-T Financial export aggregation (feat-saft-export, build-spec §8 / Phase 8). Reads one fiscal
 * year's POSTED ledger + the parties register into the {@link SaftFinancialInput} the pure
 * `@saldo/domain` generator (`generateSaftFinancial`) composes — exactly like `aggregateVatByCode` /
 * `aggregateAccountBalances`, READ-ONLY (it books nothing). Read through `withUserOrg` (membership
 * proven) + RLS: every unfiltered read returns only the current tenant's rows because each table here
 * is FORCE-RLS scoped to `app.current_org`. Server-only.
 *
 * Three reads, all posted-only (drafts excluded), assembled into the export input:
 *  - **account masters** — per account, opening (Σdebit−Σcredit on postings in prior years) and closing
 *    (through the export year end); only accounts with activity up to year end appear;
 *  - **transactions** — every posted voucher in the year, with its postings as journal lines (account
 *    number + kontoklasse + the SAF-T VAT code, when present);
 *  - **parties** — the customers/suppliers register from `contact`.
 * The economic side of a posting is its account's kontoklasse (`account.type`), source-grounded — never
 * a hardcoded account number. Figures stay integer øre; the domain ties them out (`saftBalances`).
 */
import { and, asc, eq, isNotNull, sql } from 'drizzle-orm';
import {
  øre,
  type SaftFinancialInput,
  type SaftLineInput,
  type SaftPartyInput,
} from '@saldo/domain';
import type { AccountNo, OrgNr, VatCode } from '@saldo/domain';
import type { OrgTx } from '../auth/middleware.js';
import { account, contact, fiscalPeriod, posting, vatCode, voucher } from './schema.js';

/** SUM(bigint) returns numeric; postgres.js hands it back as a string. */
const toNum = (value: string | null): number => Number(value ?? 0);

/** Per-account opening (prior years) + closing (through year end) net balances, posted-only. */
async function readAccountBalances(
  tx: OrgTx,
  year: number,
): Promise<SaftFinancialInput['accounts']> {
  const rows = await tx
    .select({
      number: account.number,
      name: account.name,
      opening: sql<string>`coalesce(sum(
        case when ${fiscalPeriod.year} < ${year} then ${posting.debitOre} - ${posting.creditOre} else 0 end
      ), 0)::bigint`,
      closing: sql<string>`coalesce(sum(${posting.debitOre} - ${posting.creditOre}), 0)::bigint`,
    })
    .from(posting)
    .innerJoin(voucher, eq(voucher.id, posting.voucherId))
    .innerJoin(fiscalPeriod, eq(fiscalPeriod.id, voucher.periodId))
    .innerJoin(account, eq(account.id, posting.accountId))
    .where(and(isNotNull(voucher.postedAt), sql`${fiscalPeriod.year} <= ${year}`))
    .groupBy(account.number, account.name)
    .orderBy(asc(account.number));

  return rows.map((r) => ({
    number: r.number as AccountNo,
    name: r.name,
    openingØre: øre(toNum(r.opening)),
    closingØre: øre(toNum(r.closing)),
  }));
}

/** Every posted voucher in `year`, with its postings flattened to rows (one row per line). */
async function readTransactionLines(
  tx: OrgTx,
  year: number,
): Promise<SaftFinancialInput['transactions']> {
  const rows = await tx
    .select({
      voucherId: voucher.id,
      voucherType: voucher.type,
      date: sql<string>`to_char(${voucher.postedAt}, 'YYYY-MM-DD')`,
      accountNumber: account.number,
      accountType: account.type,
      accountName: account.name,
      debitOre: posting.debitOre,
      creditOre: posting.creditOre,
      vatCode: vatCode.code,
    })
    .from(posting)
    .innerJoin(voucher, eq(voucher.id, posting.voucherId))
    .innerJoin(fiscalPeriod, eq(fiscalPeriod.id, voucher.periodId))
    .innerJoin(account, eq(account.id, posting.accountId))
    .leftJoin(vatCode, eq(vatCode.id, posting.vatCodeId))
    .where(and(isNotNull(voucher.postedAt), eq(fiscalPeriod.year, year)))
    .orderBy(asc(voucher.postedAt), asc(voucher.id), asc(posting.id));

  // Group the flat rows into one transaction per voucher (rows arrive grouped by the ORDER BY).
  const byVoucher = new Map<
    string,
    SaftFinancialInput['transactions'][number] & { lines: SaftLineInput[] }
  >();
  for (const r of rows) {
    let txn = byVoucher.get(r.voucherId);
    if (!txn) {
      txn = { voucherId: r.voucherId, voucherType: r.voucherType, date: r.date, lines: [] };
      byVoucher.set(r.voucherId, txn);
    }
    // A posting is debit XOR credit — the SQL CHECK `(debit_ore = 0) <> (credit_ore = 0)` guarantees
    // exactly one positive side, so `debit > 0` unambiguously picks the side.
    const debit = toNum(String(r.debitOre));
    const line: SaftLineInput = {
      accountNumber: r.accountNumber as AccountNo,
      accountType: r.accountType as SaftLineInput['accountType'],
      side: debit > 0 ? 'debit' : 'credit',
      amountØre: øre(debit > 0 ? debit : toNum(String(r.creditOre))),
      description: r.accountName,
      ...(r.vatCode !== null ? { vatCode: r.vatCode as VatCode } : {}),
    };
    txn.lines.push(line);
  }
  return [...byVoucher.values()];
}

/** The customers/suppliers register (`contact`) split by role into the two SAF-T party lists. */
async function readParties(
  tx: OrgTx,
): Promise<{ customers: SaftPartyInput[]; suppliers: SaftPartyInput[] }> {
  const rows = await tx
    .select({
      id: contact.id,
      name: contact.name,
      orgNr: contact.orgNr,
      addressLine: contact.addressLine,
      postalCode: contact.postalCode,
      city: contact.city,
      countryCode: contact.countryCode,
      isCustomer: contact.isCustomer,
      isSupplier: contact.isSupplier,
    })
    .from(contact)
    .orderBy(asc(contact.name));

  const toParty = (r: (typeof rows)[number]): SaftPartyInput => ({
    // SAF-T Customer/SupplierID is SAFmiddle1textType (≤35 chars); a hyphenated UUID is 36, so strip
    // the hyphens (→32). Still stable and unique — the contact id is the AR/AP subledger key.
    id: r.id.replace(/-/g, ''),
    name: r.name,
    ...(r.orgNr !== null ? { orgNr: r.orgNr as OrgNr } : {}),
    ...(r.addressLine !== null ? { addressLine: r.addressLine } : {}),
    ...(r.postalCode !== null ? { postalCode: r.postalCode } : {}),
    ...(r.city !== null ? { city: r.city } : {}),
    countryCode: r.countryCode,
  });

  return {
    customers: rows.filter((r) => r.isCustomer).map(toParty),
    suppliers: rows.filter((r) => r.isSupplier).map(toParty),
  };
}

/**
 * Read the full SAF-T Financial export input for `year` (account masters + posted transactions + the
 * parties register), scoped to the current tenant by RLS. The pure generator turns this into the
 * XSD-valid document; this layer does no mapping beyond the øre cast.
 */
export async function readSaftFinancial(tx: OrgTx, year: number): Promise<SaftFinancialInput> {
  const [accounts, transactions, parties] = await Promise.all([
    readAccountBalances(tx, year),
    readTransactionLines(tx, year),
    readParties(tx),
  ]);
  return { accounts, transactions, customers: parties.customers, suppliers: parties.suppliers };
}
