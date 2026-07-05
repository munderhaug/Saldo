import { Link } from 'react-router';
import { formatIsoDate } from '@saldo/domain';
import { Money } from '~/components/money';
import { z } from 'zod';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import type { Route } from './+types/orgs.$orgId.invoices';
import { withUserOrg } from '~/auth/auth.server';
import { listInvoices, type InvoiceListRow } from '~/db/invoices.server';
import {
  invoiceKindLabel,
  invoiceNumberLabel,
  invoiceStatusBadgeClass,
  invoiceStatusLabel,
} from '~/lib/invoice-format';
import { t } from '~/copy';
import { CompanionGuide } from '~/components/companion';
import { companionEnabled } from '~/lib/companion-preference.server';
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
  return [{ title: t('invoices.title') }];
}

/** Sales documents carry personal data (customer snapshot); keep off any shared cache. */
export function headers() {
  return { 'Cache-Control': 'private, no-store' };
}

export async function loader({ request, params }: Route.LoaderArgs) {
  if (!z.string().uuid().safeParse(params.orgId).success) {
    throw new Response('Not found', { status: 404 });
  }
  const invoices = await withUserOrg(request, params.orgId, (tx) => listInvoices(tx));
  return { orgId: params.orgId, invoices, companionOn: companionEnabled(request) };
}

const column = createColumnHelper<InvoiceListRow>();

export default function InvoicesRoute({ loaderData }: Route.ComponentProps) {
  const { orgId, invoices, companionOn } = loaderData;

  const columns = [
    column.accessor('invoiceNumber', {
      header: () => t('invoices.col.number'),
      cell: (info) => (
        <Link
          to={`/orgs/${orgId}/invoices/${info.row.original.id}`}
          className="text-primary underline-offset-4 hover:underline"
        >
          {invoiceNumberLabel(info.getValue())}
        </Link>
      ),
    }),
    column.accessor('kind', {
      header: () => t('invoices.col.kind'),
      cell: (info) => invoiceKindLabel(info.getValue()),
    }),
    column.accessor('customerName', {
      header: () => t('invoices.col.customer'),
      cell: (info) => info.getValue(),
    }),
    column.accessor('status', {
      header: () => t('invoices.col.status'),
      cell: (info) => (
        <span className={invoiceStatusBadgeClass(info.getValue())}>
          {invoiceStatusLabel(info.getValue())}
        </span>
      ),
    }),
    column.accessor('issueDate', {
      header: () => t('invoices.col.issued'),
      cell: (info) => (info.getValue() ? formatIsoDate(info.getValue()!) : '—'),
    }),
    column.accessor('dueDate', {
      header: () => t('invoices.col.due'),
      cell: (info) => (info.getValue() ? formatIsoDate(info.getValue()!) : '—'),
    }),
    column.accessor('grossOre', {
      header: () => t('invoices.col.total'),
      cell: (info) => <Money ore={info.getValue()} />,
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
          <h1 className="font-serif text-3xl tracking-tight">{t('invoices.title')}</h1>
          <p className="text-muted-foreground">{t('invoices.intro')}</p>
        </div>
        <Link
          to={`/orgs/${orgId}/invoices/new`}
          className="bg-primary text-primary-foreground font-text inline-flex min-h-11 items-center rounded-md px-4 py-2 text-sm"
        >
          {t('invoices.new')}
        </Link>
      </header>

      {invoices.length === 0 ? (
        companionOn ? (
          <CompanionGuide
            message={t('invoices.empty.body')}
            redirectTo={`/orgs/${orgId}/invoices`}
          />
        ) : (
          <p className="text-muted-foreground text-sm">{t('invoices.empty.body')}</p>
        )
      ) : (
        <Table>
          <TableCaption>{t('invoices.listCaption', { count: invoices.length })}</TableCaption>
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
        {t('invoices.back')}
      </Link>
    </main>
  );
}
