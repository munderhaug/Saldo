import { Link } from 'react-router';
import { z } from 'zod';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import type { Route } from './+types/orgs.$orgId.contacts';
import { withUserOrg } from '~/auth/auth.server';
import { listContacts, type ContactListRow } from '~/db/contacts.server';
import { contactRoleLabel } from '~/lib/contact-format';
import { formatOrgNr, mvaStatusLabel } from '~/lib/org-format';
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
  return [{ title: t('contacts.title') }];
}

/** Contacts hold an ENK's personal data (name/address/org-nr); keep the list off any shared cache. */
export function headers() {
  return { 'Cache-Control': 'private, no-store' };
}

export async function loader({ request, params }: Route.LoaderArgs) {
  if (!z.string().uuid().safeParse(params.orgId).success) {
    throw new Response('Not found', { status: 404 });
  }
  const contacts = await withUserOrg(request, params.orgId, (tx) => listContacts(tx));
  return { orgId: params.orgId, contacts };
}

const column = createColumnHelper<ContactListRow>();

export default function ContactsRoute({ loaderData }: Route.ComponentProps) {
  const { orgId, contacts } = loaderData;

  const columns = [
    column.accessor('name', {
      header: () => t('contacts.col.name'),
      cell: (info) => (
        <Link
          to={`/orgs/${orgId}/contacts/${info.row.original.id}`}
          className="text-primary underline-offset-4 hover:underline"
        >
          {info.getValue()}
        </Link>
      ),
    }),
    column.display({
      id: 'role',
      header: () => t('contacts.col.role'),
      cell: (info) => contactRoleLabel(info.row.original.isCustomer, info.row.original.isSupplier),
    }),
    column.accessor('orgNr', {
      header: () => t('contacts.col.orgnr'),
      cell: (info) => {
        const value = info.getValue();
        return value ? formatOrgNr(value) : '—';
      },
    }),
    column.accessor('mvaStatus', {
      header: () => t('contacts.col.mva'),
      cell: (info) => mvaStatusLabel(info.getValue()),
    }),
    column.accessor('city', {
      header: () => t('contacts.col.place'),
      cell: (info) => info.getValue() ?? '—',
    }),
  ];

  const table = useReactTable({
    data: contacts,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <main className="mx-auto grid max-w-3xl gap-6 p-6 sm:p-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="font-serif text-3xl tracking-tight">{t('contacts.title')}</h1>
          <p className="text-muted-foreground">{t('contacts.intro')}</p>
        </div>
        <Link
          to={`/orgs/${orgId}/contacts/new`}
          className="bg-primary text-primary-foreground font-text inline-flex min-h-11 items-center rounded-md px-4 py-2 text-sm"
        >
          {t('contacts.new')}
        </Link>
      </header>

      {contacts.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('contacts.empty.body')}</p>
      ) : (
        <Table>
          <TableCaption>{t('contacts.listCaption', { count: contacts.length })}</TableCaption>
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
                    className={cell.column.id === 'orgNr' ? 'tabular' : undefined}
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
        {t('contacts.back')}
      </Link>
    </main>
  );
}
