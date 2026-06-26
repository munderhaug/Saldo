/**
 * Kundereskontro med aldersfordeling (feat-reporting, build-spec §8.9) — per-customer open AR bucketed
 * by age. Point-in-time: the loader reads the org's OPEN invoices (reusing the invoice lifecycle, NOT a
 * new model) and the pure `bucketReskontro` ages them as of today. The per-customer total reconciles to
 * the kundefordringer control account. Leverandørreskontro (AP) awaits supplier invoices. Deterministic
 * — NOT an AI system. Off any shared cache.
 */
import { z } from 'zod';
import { AGING_BUCKETS, bucketReskontro } from '@saldo/domain';
import type { Route } from './+types/orgs.$orgId.reports.reskontro';
import { withUserOrg } from '~/auth/auth.server';
import { listOpenReceivables } from '~/db/reporting.server';
import { readOrgOverview } from '~/db/organizations.server';
import { agingBucketLabel } from '~/lib/reporting';
import { Money, ZeroCell } from '~/components/money';
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
  return [{ title: t('reports.reskontro.title') }];
}

export function headers() {
  return { 'Cache-Control': 'private, no-store' };
}

export async function loader({ request, params }: Route.LoaderArgs) {
  if (!z.string().uuid().safeParse(params.orgId).success) {
    throw new Response('Not found', { status: 404 });
  }
  const asOf = new Date().toISOString().slice(0, 10);
  const data = await withUserOrg(request, params.orgId, async (tx) => ({
    overview: await readOrgOverview(tx, params.orgId),
    open: await listOpenReceivables(tx),
  }));
  if (!data.overview) throw new Response('Not found', { status: 404 });

  const report = bucketReskontro(data.open, asOf);
  return {
    orgId: params.orgId,
    contacts: report.contacts.map((c) => ({
      key: c.contactId ?? `name:${c.contactName}`,
      name: c.contactName,
      buckets: AGING_BUCKETS.map((k) => c.buckets[k] as number),
      totalØre: c.totalØre,
    })),
    totals: AGING_BUCKETS.map((k) => report.totals[k] as number),
    totalØre: report.totalØre as number,
  };
}

export default function ReskontroRoute({ loaderData }: Route.ComponentProps) {
  const { orgId, contacts, totals, totalØre } = loaderData;
  return (
    <ReportShell
      title={t('reports.reskontro.title')}
      subtitle={t('reports.reskontro.intro')}
      backTo={`/orgs/${orgId}/reports`}
      backLabel={t('reports.back')}
    >
      {contacts.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('reports.reskontro.empty')}</p>
      ) : (
        <Table>
          <TableCaption>{t('reports.reskontro.caption', { count: contacts.length })}</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{t('reports.reskontro.col.customer')}</TableHead>
              {AGING_BUCKETS.map((b) => (
                <TableHead key={b} scope="col" className="text-right">
                  {agingBucketLabel(b)}
                </TableHead>
              ))}
              <TableHead scope="col" className="text-right">
                {t('reports.reskontro.col.total')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contacts.map((c) => (
              <TableRow key={c.key}>
                <th scope="row" className="p-2 text-left align-middle font-normal">
                  {c.name}
                </th>
                {c.buckets.map((ore, i) => (
                  <TableCell key={AGING_BUCKETS[i]} className="tabular text-right">
                    {ore === 0 ? <ZeroCell /> : <Money ore={ore} />}
                  </TableCell>
                ))}
                <TableCell className="tabular text-right">
                  <Money ore={c.totalØre} />
                </TableCell>
              </TableRow>
            ))}
            <TableRow className="border-t-2">
              <th scope="row" className="p-2 text-left align-middle">
                {t('reports.reskontro.sumRow')}
              </th>
              {totals.map((ore, i) => (
                <TableCell key={AGING_BUCKETS[i]} className="tabular text-right">
                  {ore === 0 ? <ZeroCell /> : <Money ore={ore} />}
                </TableCell>
              ))}
              <TableCell className="tabular text-right">
                <Money ore={totalØre} />
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      )}
      <p className="text-muted-foreground text-sm">{t('reports.reskontro.apNote')}</p>
    </ReportShell>
  );
}
