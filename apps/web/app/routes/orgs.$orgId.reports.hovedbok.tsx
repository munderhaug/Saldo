/**
 * Hovedbok — the account picker for the per-account drill-down (feat-reporting, build-spec §8.9). Lists
 * the accounts with posted movement in the year, each linking to its kontospesifikasjon. This is the
 * explicit depth-on-demand surface (experience-principles §4.2). Deterministic — NOT an AI system. Off
 * any shared cache.
 */
import { Link } from 'react-router';
import { z } from 'zod';
import type { Route } from './+types/orgs.$orgId.reports.hovedbok';
import { withUserOrg } from '~/auth/auth.server';
import { listActiveAccounts } from '~/db/reporting.server';
import { readOrgOverview } from '~/db/organizations.server';
import { resolveReportYear } from '~/lib/reporting';
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

export function meta() {
  return [{ title: t('reports.hovedbok.title') }];
}

export function headers() {
  return { 'Cache-Control': 'private, no-store' };
}

export async function loader({ request, params }: Route.LoaderArgs) {
  if (!z.string().uuid().safeParse(params.orgId).success) {
    throw new Response('Not found', { status: 404 });
  }
  const year = resolveReportYear(request);
  const data = await withUserOrg(request, params.orgId, async (tx) => ({
    overview: await readOrgOverview(tx, params.orgId),
    accounts: await listActiveAccounts(tx, year),
  }));
  if (!data.overview) throw new Response('Not found', { status: 404 });
  return { orgId: params.orgId, year, accounts: data.accounts };
}

export default function HovedbokRoute({ loaderData }: Route.ComponentProps) {
  const { orgId, year, accounts } = loaderData;
  return (
    <ReportShell
      title={t('reports.hovedbok.title')}
      year={year}
      basePath={`/orgs/${orgId}/reports/hovedbok`}
      backTo={`/orgs/${orgId}/reports?year=${year}`}
      backLabel={t('reports.back')}
    >
      <p className="text-muted-foreground text-sm">{t('reports.hovedbok.intro')}</p>
      {accounts.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('reports.empty')}</p>
      ) : (
        <Table>
          <TableCaption>
            {t('reports.hovedbok.caption', { count: accounts.length, year })}
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{t('reports.col.account')}</TableHead>
              <TableHead scope="col">{t('reports.hovedbok.col.name')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.map((a) => (
              <TableRow key={a.id}>
                <th scope="row" className="p-2 align-middle">
                  <Link
                    to={`/orgs/${orgId}/reports/hovedbok/${a.id}?year=${year}`}
                    className="text-primary tabular inline-flex min-h-11 items-center underline-offset-4 hover:underline"
                  >
                    {a.number}
                  </Link>
                </th>
                <TableCell>{a.name}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </ReportShell>
  );
}
