/**
 * Balanse (balance sheet) — read-only over the posted ledger (feat-reporting, build-spec §8.9). Sums
 * per-account balances and derives eiendeler (klasse 1) vs egenkapital og gjeld (klasse 2) + the year's
 * årsresultat (from the resultat). It MUST balance: the page states the tie-out explicitly. Deterministic
 * — NOT an AI system. Off any shared cache.
 */
import { z } from 'zod';
import { ReportTotalRow as TotalRow } from '~/components/report-total-row';
import { buildBalanse, buildResultat } from '@saldo/domain';
import type { Route } from './+types/orgs.$orgId.reports.balanse';
import { withUserOrg } from '~/auth/auth.server';
import { aggregateAccountBalances } from '~/db/reporting.server';
import { readOrgOverview } from '~/db/organizations.server';
import { kr } from '~/lib/money-format';
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
  return [{ title: t('reports.balanse.title') }];
}

export function headers() {
  return { 'Cache-Control': 'private, no-store' };
}

export async function loader({ request, params }: Route.LoaderArgs) {
  if (!z.string().uuid().safeParse(params.orgId).success) {
    throw new Response('Not found', { status: 404 });
  }
  const year = resolveYear(request);
  const data = await withUserOrg(request, params.orgId, async (tx) => ({
    overview: await readOrgOverview(tx, params.orgId),
    balances: await aggregateAccountBalances(tx, year),
  }));
  if (!data.overview) throw new Response('Not found', { status: 404 });

  const resultat = buildResultat(data.balances);
  const b = buildBalanse(data.balances, resultat.aarsresultatØre);
  const line = (l: { number: string; name: string; amountØre: number }) => ({
    number: l.number,
    name: l.name,
    amountØre: l.amountØre,
  });
  return {
    orgId: params.orgId,
    year,
    eiendeler: b.eiendeler.map(line),
    eiendelerØre: b.eiendelerØre as number,
    egenkapitalGjeld: b.egenkapitalGjeld.map(line),
    egenkapitalGjeldØre: b.egenkapitalGjeldØre as number,
    aarsresultatØre: b.aarsresultatØre as number,
    sumEgenkapitalGjeldØre: b.sumEgenkapitalGjeldØre as number,
    differanseØre: b.differanseØre as number,
    balanserer: b.balanserer,
    empty: b.eiendeler.length === 0 && b.egenkapitalGjeld.length === 0,
  };
}

export default function BalanseRoute({ loaderData }: Route.ComponentProps) {
  const { orgId, year, empty, balanserer, differanseØre } = loaderData;
  return (
    <ReportShell
      title={t('reports.balanse.title')}
      year={year}
      basePath={`/orgs/${orgId}/reports/balanse`}
      backTo={`/orgs/${orgId}/reports?year=${year}`}
      backLabel={t('reports.back')}
    >
      {empty ? (
        <p className="text-muted-foreground text-sm">{t('reports.empty')}</p>
      ) : (
        <>
          <Table>
            <TableCaption>{t('reports.balanse.caption', { year })}</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{t('reports.col.account')}</TableHead>
                <TableHead scope="col" className="text-right">
                  {t('reports.col.amount')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <Section label={t('reports.balanse.eiendeler')} lines={loaderData.eiendeler} />
              <TotalRow label={t('reports.balanse.sumEiendeler')} ore={loaderData.eiendelerØre} />
              <Section
                label={t('reports.balanse.egenkapitalGjeld')}
                lines={loaderData.egenkapitalGjeld}
              />
              <TableRow>
                <th scope="row" className="p-2 text-left align-middle">
                  {t('reports.balanse.aarsresultat')}
                </th>
                <TableCell className="tabular text-right">
                  <Money ore={loaderData.aarsresultatØre} />
                </TableCell>
              </TableRow>
              <TotalRow
                label={t('reports.balanse.sumEgenkapitalGjeld')}
                ore={loaderData.sumEgenkapitalGjeldØre}
              />
            </TableBody>
          </Table>
          <p role="status" className="text-sm">
            {balanserer
              ? t('reports.balanse.balances')
              : t('reports.balanse.imbalance', { amount: kr(differanseØre) })}
          </p>
        </>
      )}
    </ReportShell>
  );
}

function Section({
  label,
  lines,
}: {
  label: string;
  lines: ReadonlyArray<{ number: string; name: string; amountØre: number }>;
}) {
  return (
    <>
      <TableRow>
        <TableCell colSpan={2} className="text-muted-foreground pt-4 text-sm">
          {label}
        </TableCell>
      </TableRow>
      {lines.map((l) => (
        <TableRow key={l.number}>
          <TableCell>
            <span className="tabular text-muted-foreground mr-2">{l.number}</span>
            {l.name}
          </TableCell>
          <TableCell className="tabular text-right">
            <Money ore={l.amountØre} />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}
