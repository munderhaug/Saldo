import { data, Link } from 'react-router';
import { z } from 'zod';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import type { Route } from './+types/orgs.$orgId';
import { withUserOrg } from '~/auth/auth.server';
import { buildActiveOrgCookie, readActiveOrg } from '~/lib/active-org.server';
import { isProd } from '~/env';
import { readOrgOverview, type VatCodeRow } from '~/db/organizations.server';
import { directionLabel, formatOrgNr, mvaStatusDesc, mvaStatusLabel } from '~/lib/org-format';
import { t } from '~/copy';
import { Card, CardContent, CardTitle } from '~/components/ui/card';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: loaderData?.org.name ?? t('orgs.title') }];
}

/** This org may hold an ENK's personal data (name/org-nr); keep it off any shared/edge cache. */
export function headers({ loaderHeaders }: Route.HeadersArgs) {
  const h: Record<string, string> = { 'Cache-Control': 'private, no-store' };
  const cookie = loaderHeaders.get('Set-Cookie');
  if (cookie) h['Set-Cookie'] = cookie;
  return h;
}

/**
 * Authed, tenant-scoped overview: `withUserOrg` proves membership (403 otherwise) and sets the RLS
 * tenant context, so the provisioned kontoplan + VAT codes are read scoped to this org. Opening an
 * org is the selection gesture — it persists the active-org context (ADR 0060) AFTER membership is
 * proven, so the cookie only ever names an org the user could open.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  if (!z.string().uuid().safeParse(params.orgId).success) {
    throw new Response('Not found', { status: 404 });
  }
  const overview = await withUserOrg(request, params.orgId, (tx) =>
    readOrgOverview(tx, params.orgId),
  );
  if (!overview) throw new Response('Not found', { status: 404 });
  if (readActiveOrg(request) === params.orgId) return data(overview);
  return data(overview, {
    headers: { 'Set-Cookie': buildActiveOrgCookie(params.orgId, isProd) },
  });
}

const column = createColumnHelper<VatCodeRow>();
const columns = [
  column.accessor('code', { header: () => t('orgs.overview.col.code') }),
  column.accessor('rate', {
    header: () => t('orgs.overview.col.rate'),
    cell: (info) => `${+(Number(info.getValue()) * 100).toFixed(2)} %`,
  }),
  column.accessor('direction', {
    header: () => t('orgs.overview.col.direction'),
    cell: (info) => directionLabel(info.getValue()),
  }),
];

export default function OrgOverviewRoute({ loaderData }: Route.ComponentProps) {
  const { org, vatCodes, accountCount } = loaderData;
  const table = useReactTable({
    data: vatCodes as VatCodeRow[],
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <main className="mx-auto grid max-w-2xl gap-6 p-6 sm:p-10">
      <header className="grid gap-1">
        <h1 className="font-serif text-3xl tracking-tight">{org.name}</h1>
        <p className="text-muted-foreground">
          {t('orgs.overview.ready', { accounts: accountCount, codes: vatCodes.length })}
        </p>
      </header>

      <Card>
        <CardContent className="pt-6">
          <dl className="grid gap-3">
            <Field label={t('orgs.overview.orgNrLabel')}>
              <span className="tabular">{formatOrgNr(org.orgNr)}</span>
            </Field>
            <Field label={t('orgs.overview.mvaLabel')}>
              <span>{mvaStatusLabel(org.mvaStatus)}</span>
              <span className="text-muted-foreground block text-sm">
                {mvaStatusDesc(org.mvaStatus)}
              </span>
            </Field>
          </dl>
        </CardContent>
      </Card>

      <section className="grid gap-3">
        <CardTitle as="h2" className="font-text text-lg">
          {t('orgs.overview.vatTitle')}
        </CardTitle>
        <Table>
          <TableCaption>{t('orgs.overview.vatCaption', { count: vatCodes.length })}</TableCaption>
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
                    className={cell.column.id === 'rate' ? 'tabular' : undefined}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <nav aria-label={t('orgs.overview.registersTitle')} className="grid gap-3">
        <CardTitle as="h2" className="font-text text-lg">
          {t('orgs.overview.registersTitle')}
        </CardTitle>
        <ul className="grid gap-2">
          <li>
            <Link
              to={`/orgs/${org.id}/contacts`}
              className="text-primary font-text inline-flex min-h-11 w-fit items-center text-sm underline-offset-4 hover:underline"
            >
              {t('contacts.title')}
            </Link>
          </li>
          <li>
            <Link
              to={`/orgs/${org.id}/products`}
              className="text-primary font-text inline-flex min-h-11 w-fit items-center text-sm underline-offset-4 hover:underline"
            >
              {t('products.title')}
            </Link>
          </li>
          <li>
            <Link
              to={`/orgs/${org.id}/invoices`}
              className="text-primary font-text inline-flex min-h-11 w-fit items-center text-sm underline-offset-4 hover:underline"
            >
              {t('invoices.title')}
            </Link>
          </li>
          <li>
            <Link
              to={`/orgs/${org.id}/purchases`}
              className="text-primary font-text inline-flex min-h-11 w-fit items-center text-sm underline-offset-4 hover:underline"
            >
              {t('purchases.title')}
            </Link>
          </li>
          <li>
            <Link
              to={`/orgs/${org.id}/owner/new`}
              className="text-primary font-text inline-flex min-h-11 w-fit items-center text-sm underline-offset-4 hover:underline"
            >
              {t('owner.new.title')}
            </Link>
          </li>
          <li>
            <Link
              to={`/orgs/${org.id}/bank`}
              className="text-primary font-text inline-flex min-h-11 w-fit items-center text-sm underline-offset-4 hover:underline"
            >
              {t('bank.title')}
            </Link>
          </li>
          <li>
            <Link
              to={`/orgs/${org.id}/mva`}
              className="text-primary font-text inline-flex min-h-11 w-fit items-center text-sm underline-offset-4 hover:underline"
            >
              {t('mva.title')}
            </Link>
          </li>
          <li>
            <Link
              to={`/orgs/${org.id}/reports`}
              className="text-primary font-text inline-flex min-h-11 w-fit items-center text-sm underline-offset-4 hover:underline"
            >
              {t('reports.title')}
            </Link>
          </li>
          <li>
            <Link
              to={`/orgs/${org.id}/saft`}
              className="text-primary font-text inline-flex min-h-11 w-fit items-center text-sm underline-offset-4 hover:underline"
            >
              {t('saft.title')}
            </Link>
          </li>
          <li>
            <Link
              to={`/orgs/${org.id}/opening`}
              className="text-primary font-text inline-flex min-h-11 w-fit items-center text-sm underline-offset-4 hover:underline"
            >
              {t('opening.title')}
            </Link>
          </li>
          <li>
            <Link
              to={`/orgs/${org.id}/settings`}
              className="text-primary font-text inline-flex min-h-11 w-fit items-center text-sm underline-offset-4 hover:underline"
            >
              {t('settings.title')}
            </Link>
          </li>
        </ul>
      </nav>

      <Link
        to="/orgs"
        className="text-primary font-text inline-flex min-h-11 w-fit items-center text-sm underline-offset-4 hover:underline"
      >
        {t('orgs.overview.back')}
      </Link>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-3 sm:gap-4">
      <dt className="font-text text-muted-foreground text-sm">{label}</dt>
      <dd className="text-sm sm:col-span-2">{children}</dd>
    </div>
  );
}
