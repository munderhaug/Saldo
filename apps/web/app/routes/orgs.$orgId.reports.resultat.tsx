/**
 * Resultatregnskap (profit & loss) — read-only over the posted ledger (feat-reporting, build-spec §8.9).
 * The loader sums per-account balances (`aggregateAccountBalances`) and the pure `buildResultat` derives
 * income − cost by kontoklasse; the page shows the groups, the subtotals, and the årsresultat. Ties out
 * to the balanse by construction. Deterministic — NOT an AI system. Off any shared cache.
 */
import { z } from 'zod';
import { ReportTotalRow } from '~/components/report-total-row';
import { buildResultat } from '@saldo/domain';
import type { Route } from './+types/orgs.$orgId.reports.resultat';
import { withUserOrg } from '~/auth/auth.server';
import { aggregateAccountBalances } from '~/db/reporting.server';
import { readOrgOverview } from '~/db/organizations.server';
import { kontoklasseLabel } from '~/lib/reporting';
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
  return [{ title: t('reports.resultat.title') }];
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
    // Exclude the year_end closing voucher (ADR 0064): after the close empties the result
    // accounts, this report must still show the year's REAL activity.
    balances: await aggregateAccountBalances(tx, year, { excludeYearEnd: true }),
  }));
  if (!data.overview) throw new Response('Not found', { status: 404 });

  const report = buildResultat(data.balances);
  return {
    orgId: params.orgId,
    year,
    groups: report.groups.map((g) => ({
      klasse: g.klasse,
      label: kontoklasseLabel(g.klasse),
      subtotalØre: g.subtotalØre,
      lines: g.lines.map((l) => ({ number: l.number, name: l.name, amountØre: l.amountØre })),
    })),
    driftsinntekterØre: report.driftsinntekterØre as number,
    driftskostnaderØre: report.driftskostnaderØre as number,
    driftsresultatØre: report.driftsresultatØre as number,
    finansposterØre: report.finansposterØre as number,
    aarsresultatØre: report.aarsresultatØre as number,
    empty: report.groups.length === 0,
  };
}

export default function ResultatRoute({ loaderData }: Route.ComponentProps) {
  const { orgId, year, groups, empty } = loaderData;
  return (
    <ReportShell
      title={t('reports.resultat.title')}
      year={year}
      basePath={`/orgs/${orgId}/reports/resultat`}
      backTo={`/orgs/${orgId}/reports?year=${year}`}
      backLabel={t('reports.back')}
    >
      {empty ? (
        <p className="text-muted-foreground text-sm">{t('reports.empty')}</p>
      ) : (
        <Table>
          <TableCaption>{t('reports.resultat.caption', { year })}</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{t('reports.col.account')}</TableHead>
              <TableHead scope="col" className="text-right">
                {t('reports.col.amount')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((g) => (
              <Group key={g.klasse} label={g.label} subtotalØre={g.subtotalØre} lines={g.lines} />
            ))}
            <ReportTotalRow
              label={t('reports.resultat.driftsinntekter')}
              ore={loaderData.driftsinntekterØre}
              strong={false}
            />
            <ReportTotalRow
              label={t('reports.resultat.driftskostnader')}
              ore={loaderData.driftskostnaderØre}
              strong={false}
            />
            <ReportTotalRow
              label={t('reports.resultat.driftsresultat')}
              ore={loaderData.driftsresultatØre}
            />
            <ReportTotalRow
              label={t('reports.resultat.finansposter')}
              ore={loaderData.finansposterØre}
              strong={false}
            />
            <ReportTotalRow
              label={t('reports.resultat.aarsresultat')}
              ore={loaderData.aarsresultatØre}
            />
          </TableBody>
        </Table>
      )}
    </ReportShell>
  );
}

function Group({
  label,
  subtotalØre,
  lines,
}: {
  label: string;
  subtotalØre: number;
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
      <TableRow>
        <th scope="row" className="p-2 text-right align-middle text-sm">
          {label}
        </th>
        <TableCell className="tabular text-right">
          <Money ore={subtotalØre} />
        </TableCell>
      </TableRow>
    </>
  );
}
