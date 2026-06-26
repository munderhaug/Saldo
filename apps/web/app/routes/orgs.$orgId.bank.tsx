/**
 * Bank accounts — the banking-import landing surface (build-spec §8.7, feat-banking-import). Lists the
 * org's bank accounts; each links to its detail + import page. Account numbers are personal/financial
 * data, so the page stays off any shared cache. Reconciliation (matching transactions to vouchers) is
 * the downstream task — this surface is import + register only.
 */
import { Link } from 'react-router';
import { z } from 'zod';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import type { Route } from './+types/orgs.$orgId.bank';
import { withUserOrg } from '~/auth/auth.server';
import { listBankAccounts, type BankAccountListRow } from '~/db/bank.server';
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

export function meta() {
  return [{ title: t('bank.title') }];
}

/** Bank accounts hold financial data (account numbers); keep the list off any shared cache. */
export function headers() {
  return { 'Cache-Control': 'private, no-store' };
}

export async function loader({ request, params }: Route.LoaderArgs) {
  if (!z.string().uuid().safeParse(params.orgId).success) {
    throw new Response('Not found', { status: 404 });
  }
  const accounts = await withUserOrg(request, params.orgId, (tx) => listBankAccounts(tx));
  return { orgId: params.orgId, accounts };
}

const column = createColumnHelper<BankAccountListRow>();

export default function BankRoute({ loaderData }: Route.ComponentProps) {
  const { orgId, accounts } = loaderData;

  const columns = [
    column.accessor('label', {
      header: () => t('bank.col.label'),
      cell: (info) => (
        <Link
          to={`/orgs/${orgId}/bank/${info.row.original.id}`}
          className="text-primary underline-offset-4 hover:underline"
        >
          {info.getValue()}
          {info.row.original.isLinked ? (
            <span className="text-muted-foreground ml-2 text-xs">({t('bank.linked')})</span>
          ) : null}
        </Link>
      ),
    }),
    column.accessor('accountNumber', {
      header: () => t('bank.col.account'),
      cell: (info) => info.getValue() ?? '—',
    }),
    column.accessor('transactionCount', {
      header: () => t('bank.col.transactions'),
      cell: (info) => info.getValue(),
    }),
  ];

  const table = useReactTable({ data: accounts, columns, getCoreRowModel: getCoreRowModel() });

  return (
    <main className="mx-auto grid max-w-3xl gap-6 p-6 sm:p-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="font-serif text-3xl tracking-tight">{t('bank.title')}</h1>
          <p className="text-muted-foreground">{t('bank.intro')}</p>
        </div>
        <Link
          to={`/orgs/${orgId}/bank/new`}
          className="bg-primary text-primary-foreground font-text inline-flex min-h-11 items-center rounded-md px-4 py-2 text-sm"
        >
          {t('bank.new')}
        </Link>
      </header>

      {accounts.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('bank.empty.body')}</p>
      ) : (
        <Table>
          <TableCaption>{t('bank.listCaption', { count: accounts.length })}</TableCaption>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => (
                  <TableHead key={header.id} scope="col">
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className={
                      cell.column.id === 'transactionCount'
                        ? 'tabular text-right'
                        : cell.column.id === 'accountNumber'
                          ? 'tabular'
                          : undefined
                    }
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Link
        to={`/orgs/${orgId}`}
        className="text-primary font-text inline-flex min-h-11 w-fit items-center text-sm underline-offset-4 hover:underline"
      >
        {t('bank.back')}
      </Link>
    </main>
  );
}
