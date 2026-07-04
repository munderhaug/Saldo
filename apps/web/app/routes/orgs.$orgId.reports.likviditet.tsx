/**
 * Likviditet — a simple cash-position view (feat-reporting, build-spec §8.9; NOT forecasting, which the
 * spec holds out of scope). The loader sums the liquid (konto 19xx) account balances and the open AR
 * total; the pure `buildLiquidity` composes cash on hand and the projected position. Deterministic —
 * NOT an AI system. Off any shared cache.
 */
import { z } from 'zod';
import { ReportTotalRow } from '~/components/report-total-row';
import { buildLiquidity, bucketReskontro, øre } from '@saldo/domain';
import type { Route } from './+types/orgs.$orgId.reports.likviditet';
import { withUserOrg } from '~/auth/auth.server';
import { aggregateAccountBalances, listOpenReceivables } from '~/db/reporting.server';
import { readOrgOverview } from '~/db/organizations.server';
import { resolveYear } from '~/lib/fiscal-year';
import { Money } from '~/components/money';
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
  return [{ title: t('reports.likviditet.title') }];
}

export function headers() {
  return { 'Cache-Control': 'private, no-store' };
}

export async function loader({ request, params }: Route.LoaderArgs) {
  if (!z.string().uuid().safeParse(params.orgId).success) {
    throw new Response('Not found', { status: 404 });
  }
  const year = resolveYear(request);
  const asOf = new Date().toISOString().slice(0, 10);
  const data = await withUserOrg(request, params.orgId, async (tx) => ({
    overview: await readOrgOverview(tx, params.orgId),
    balances: await aggregateAccountBalances(tx, year),
    open: await listOpenReceivables(tx),
  }));
  if (!data.overview) throw new Response('Not found', { status: 404 });

  const receivables = bucketReskontro(data.open, asOf).totalØre;
  const report = buildLiquidity({
    balances: data.balances,
    outstandingReceivablesØre: receivables,
    outstandingPayablesØre: øre(0),
  });
  return {
    orgId: params.orgId,
    year,
    cashAccounts: report.cashAccounts.map((c) => ({
      number: c.number,
      name: c.name,
      amountØre: c.amountØre,
    })),
    cashØre: report.cashØre as number,
    outstandingReceivablesØre: report.outstandingReceivablesØre as number,
    outstandingPayablesØre: report.outstandingPayablesØre as number,
    projectedØre: report.projectedØre as number,
    empty: report.cashAccounts.length === 0,
  };
}

export default function LikviditetRoute({ loaderData }: Route.ComponentProps) {
  const { orgId, year, cashAccounts, empty } = loaderData;
  return (
    <ReportShell
      title={t('reports.likviditet.title')}
      year={year}
      basePath={`/orgs/${orgId}/reports/likviditet`}
      backTo={`/orgs/${orgId}/reports?year=${year}`}
      backLabel={t('reports.back')}
    >
      <p className="text-muted-foreground text-sm">{t('reports.likviditet.intro')}</p>
      {empty ? (
        <p className="text-muted-foreground text-sm">{t('reports.likviditet.empty')}</p>
      ) : (
        <Table>
          <TableCaption>{t('reports.likviditet.caption')}</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{t('reports.col.account')}</TableHead>
              <TableHead scope="col" className="text-right">
                {t('reports.col.amount')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cashAccounts.map((c) => (
              <TableRow key={c.number}>
                <TableCell>
                  <span className="tabular text-muted-foreground mr-2">{c.number}</span>
                  {c.name}
                </TableCell>
                <TableCell className="tabular text-right">
                  <Money ore={c.amountØre} />
                </TableCell>
              </TableRow>
            ))}
            <ReportTotalRow label={t('reports.likviditet.cash')} ore={loaderData.cashØre} />
            <ReportTotalRow
              label={t('reports.likviditet.receivables')}
              ore={loaderData.outstandingReceivablesØre}
              strong={false}
            />
            <ReportTotalRow
              label={t('reports.likviditet.payables')}
              ore={loaderData.outstandingPayablesØre}
              strong={false}
            />
            <ReportTotalRow
              label={t('reports.likviditet.projected')}
              ore={loaderData.projectedØre}
            />
          </TableBody>
        </Table>
      )}
    </ReportShell>
  );
}
