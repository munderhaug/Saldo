import { Link } from 'react-router';
import { Money } from '~/components/money';
import { z } from 'zod';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import type { Route } from './+types/orgs.$orgId.products';
import { withUserOrg } from '~/auth/auth.server';
import { listProducts, type ProductListRow } from '~/db/products.server';
import { productKindLabel } from '~/lib/product-format';
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
  return [{ title: t('products.title') }];
}

export function headers() {
  return { 'Cache-Control': 'private, no-store' };
}

export async function loader({ request, params }: Route.LoaderArgs) {
  if (!z.string().uuid().safeParse(params.orgId).success) {
    throw new Response('Not found', { status: 404 });
  }
  const products = await withUserOrg(request, params.orgId, (tx) => listProducts(tx));
  return { orgId: params.orgId, products };
}

const column = createColumnHelper<ProductListRow>();

export default function ProductsRoute({ loaderData }: Route.ComponentProps) {
  const { orgId, products } = loaderData;

  const columns = [
    column.accessor('name', {
      header: () => t('products.col.name'),
      cell: (info) => (
        <Link
          to={`/orgs/${orgId}/products/${info.row.original.id}`}
          className="text-primary underline-offset-4 hover:underline"
        >
          {info.getValue()}
        </Link>
      ),
    }),
    column.accessor('kind', {
      header: () => t('products.col.kind'),
      cell: (info) => productKindLabel(info.getValue()),
    }),
    column.accessor('unit', { header: () => t('products.col.unit') }),
    column.accessor('unitPriceOre', {
      header: () => t('products.col.price'),
      cell: (info) => <Money ore={info.getValue()} />,
    }),
  ];

  const table = useReactTable({
    data: products,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <main className="mx-auto grid max-w-3xl gap-6 p-6 sm:p-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="font-serif text-3xl tracking-tight">{t('products.title')}</h1>
          <p className="text-muted-foreground">{t('products.intro')}</p>
        </div>
        <Link
          to={`/orgs/${orgId}/products/new`}
          className="bg-primary text-primary-foreground font-text inline-flex min-h-11 items-center rounded-md px-4 py-2 text-sm"
        >
          {t('products.new')}
        </Link>
      </header>

      {products.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('products.empty.body')}</p>
      ) : (
        <Table>
          <TableCaption>{t('products.listCaption', { count: products.length })}</TableCaption>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    scope="col"
                    className={header.column.id === 'unitPriceOre' ? 'text-right' : undefined}
                  >
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
                    className={cell.column.id === 'unitPriceOre' ? 'tabular text-right' : undefined}
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
        {t('products.back')}
      </Link>
    </main>
  );
}
