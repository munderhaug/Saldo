/**
 * Hovedbok / kontospesifikasjon — one account's posted entries with a running balance (feat-reporting,
 * build-spec §8.9). This is THE depth-on-demand exception (experience-principles §4.2): konto/debit/
 * credit are shown here, on the accountant/auditor surface, and nowhere on the everyday surface. The
 * loader reads the account's incoming balance + posted entries; the pure `buildHovedbok` folds the
 * running balance. Deterministic — NOT an AI system. Off any shared cache.
 */
import { z } from 'zod';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { formatIsoDate, buildHovedbok, øre } from '@saldo/domain';
import type { Route } from './+types/orgs.$orgId.reports.hovedbok.$accountId';
import { withUserOrg } from '~/auth/auth.server';
import { readAccountLedger } from '~/db/reporting.server';
import { resolveYear } from '~/lib/fiscal-year';
import { Money, ZeroCell } from '~/components/money';
import { ReportShell } from '~/components/report-shell';
import { t } from '~/copy';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';
import type { MessageKey } from '~/copy';

export function meta({ loaderData }: Route.MetaArgs) {
  return [
    { title: loaderData ? `${loaderData.account.number} ${loaderData.account.name}` : t('reports.hovedbok.title') },
  ];
}

export function headers() {
  return { 'Cache-Control': 'private, no-store' };
}

/** The five voucher types are CHECK-constrained in SQL; map each to its label, fail-safe to 'manual'. */
function voucherTypeLabel(type: string): string {
  const known = ['sales', 'purchase', 'manual', 'bank', 'reversal'];
  const key = (known.includes(type) ? type : 'manual') as
    | 'sales'
    | 'purchase'
    | 'manual'
    | 'bank'
    | 'reversal';
  return t(`reports.voucherType.${key}` satisfies MessageKey);
}

export async function loader({ request, params }: Route.LoaderArgs) {
  if (
    !z.string().uuid().safeParse(params.orgId).success ||
    !z.string().uuid().safeParse(params.accountId).success
  ) {
    throw new Response('Not found', { status: 404 });
  }
  const year = resolveYear(request);
  const ledger = await withUserOrg(request, params.orgId, (tx) =>
    readAccountLedger(tx, params.accountId, year),
  );
  if (!ledger) throw new Response('Not found', { status: 404 });

  const report = buildHovedbok(øre(ledger.openingØre), ledger.entries);
  return {
    orgId: params.orgId,
    year,
    account: ledger.account,
    openingØre: report.openingØre as number,
    closingØre: report.closingØre as number,
    rows: report.rows.map((r) => ({
      voucherId: r.voucherId,
      date: r.date,
      voucherLabel: voucherTypeLabel(r.voucherType),
      debitØre: r.debitØre,
      creditØre: r.creditØre,
      balanceØre: r.balanceØre,
    })),
  };
}

type Row = {
  voucherId: string;
  date: string | null;
  voucherLabel: string;
  debitØre: number;
  creditØre: number;
  balanceØre: number;
};

const column = createColumnHelper<Row>();
const columns = [
  column.accessor('date', {
    header: () => t('reports.hovedbok.col.date'),
    cell: (i) => (i.getValue() ? formatIsoDate(i.getValue()!) : '—'),
  }),
  column.accessor('voucherLabel', { header: () => t('reports.hovedbok.col.voucher') }),
  column.accessor('debitØre', {
    header: () => t('reports.hovedbok.col.debit'),
    cell: (i) => (i.getValue() === 0 ? <ZeroCell /> : <Money ore={i.getValue()} />),
  }),
  column.accessor('creditØre', {
    header: () => t('reports.hovedbok.col.credit'),
    cell: (i) => (i.getValue() === 0 ? <ZeroCell /> : <Money ore={i.getValue()} />),
  }),
  column.accessor('balanceØre', {
    header: () => t('reports.hovedbok.col.balance'),
    cell: (i) => <Money ore={i.getValue()} />,
  }),
];

const NUMERIC = new Set(['debitØre', 'creditØre', 'balanceØre']);

export default function HovedbokAccountRoute({ loaderData }: Route.ComponentProps) {
  const { orgId, year, account, rows, openingØre, closingØre } = loaderData;
  const table = useReactTable({ data: rows, columns, getCoreRowModel: getCoreRowModel() });

  return (
    <ReportShell
      title={`${account.number} ${account.name}`}
      year={year}
      basePath={`/orgs/${orgId}/reports/hovedbok/${account.id}`}
      backTo={`/orgs/${orgId}/reports/hovedbok?year=${year}`}
      backLabel={t('reports.hovedbok.back')}
    >
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('reports.hovedbok.empty', { year })}</p>
      ) : (
        <Table>
          <TableCaption>{t('reports.hovedbok.entries', { count: rows.length, year })}</TableCaption>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    scope="col"
                    className={NUMERIC.has(header.column.id) ? 'text-right' : undefined}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            <TableRow>
              <th scope="row" colSpan={4} className="text-muted-foreground p-2 text-left text-sm">
                {t('reports.hovedbok.opening')}
              </th>
              <TableCell className="tabular text-right">
                <Money ore={openingØre} />
              </TableCell>
            </TableRow>
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className={NUMERIC.has(cell.column.id) ? 'tabular text-right' : undefined}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
            <TableRow className="border-t-2">
              <th scope="row" colSpan={4} className="p-2 text-right text-sm">
                {t('reports.hovedbok.closing')}
              </th>
              <TableCell className="tabular text-right">
                <Money ore={closingØre} />
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      )}
    </ReportShell>
  );
}
