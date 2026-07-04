import { Link } from 'react-router';
import { z } from 'zod';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { formatKr, øre } from '@saldo/domain';
import type { Route } from './+types/orgs.$orgId.purchases';
import { withUserOrg } from '~/auth/auth.server';
import { listSupplierInvoices, type SupplierInvoiceListRow } from '~/db/supplier-invoices.server';
import {
  supplierInvoiceStatusBadgeClass,
  supplierInvoiceStatusLabel,
} from '~/lib/supplier-invoice-format';
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
  return [{ title: t('purchases.title') }];
}

/** Supplier invoices carry personal data (supplier snapshot); keep off any shared cache. */
export function headers() {
  return { 'Cache-Control': 'private, no-store' };
}

export async function loader({ request, params }: Route.LoaderArgs) {
  if (!z.string().uuid().safeParse(params.orgId).success) {
    throw new Response('Not found', { status: 404 });
  }
  const invoices = await withUserOrg(request, params.orgId, (tx) => listSupplierInvoices(tx));
  return { orgId: params.orgId, invoices };
}

const column = createColumnHelper<SupplierInvoiceListRow>();

export default function PurchasesRoute({ loaderData }: Route.ComponentProps) {
  const { orgId, invoices } = loaderData;

  const columns = [
    column.accessor('supplierName', {
      header: () => t('purchases.col.supplier'),
      cell: (info) => (
        <Link
          to={`/orgs/${orgId}/purchases/${info.row.original.id}`}
          className="text-primary underline-offset-4 hover:underline"
        >
          {info.getValue()}
        </Link>
      ),
    }),
    column.accessor('supplierInvoiceNumber', {
      header: () => t('purchases.col.number'),
      cell: (info) => info.getValue() ?? '—',
    }),
    column.accessor('status', {
      header: () => t('purchases.col.status'),
      cell: (info) => (
        <span className={supplierInvoiceStatusBadgeClass(info.getValue())}>
          {supplierInvoiceStatusLabel(info.getValue())}
        </span>
      ),
    }),
    column.accessor('invoiceDate', {
      header: () => t('purchases.col.date'),
      cell: (info) => info.getValue() ?? '—',
    }),
    column.accessor('dueDate', {
      header: () => t('purchases.col.due'),
      cell: (info) => info.getValue() ?? '—',
    }),
    column.accessor('grossOre', {
      header: () => t('purchases.col.total'),
      cell: (info) => `${formatKr(øre(info.getValue()))} ${t('common.currency')}`,
    }),
  ];

  const table = useReactTable({
    data: invoices,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <main className="mx-auto grid max-w-4xl gap-6 p-6 sm:p-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="font-serif text-3xl tracking-tight">{t('purchases.title')}</h1>
          <p className="text-muted-foreground">{t('purchases.intro')}</p>
        </div>
        <Link
          to={`/orgs/${orgId}/purchases/new`}
          className="bg-primary text-primary-foreground font-text inline-flex min-h-11 items-center rounded-md px-4 py-2 text-sm"
        >
          {t('purchases.new')}
        </Link>
      </header>

      {invoices.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('purchases.empty.body')}</p>
      ) : (
        <Table>
          <TableCaption>{t('purchases.listCaption', { count: invoices.length })}</TableCaption>
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
                    className={cell.column.id === 'grossOre' ? 'tabular text-right' : undefined}
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
        {t('purchases.back')}
      </Link>
    </main>
  );
}
