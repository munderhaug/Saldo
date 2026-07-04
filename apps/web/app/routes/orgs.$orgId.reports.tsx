/**
 * Reports hub (feat-reporting, build-spec §8.9) — the read-only reporting surface. Links to the five
 * derived reports (resultat, balanse, hovedbok, reskontro, likviditet), each computed PURELY from the
 * posted ledger in `@saldo/domain`. The everyday surface stays event-shaped; this is the explicit
 * accountant/auditor depth (experience-principles §4.2). Deterministic — NOT an AI system (Recital 12),
 * so no Art. 50 disclosure. Figures are financial data: off any shared cache.
 */
import { Link } from 'react-router';
import { z } from 'zod';
import type { Route } from './+types/orgs.$orgId.reports';
import { withUserOrg } from '~/auth/auth.server';
import { readOrgOverview } from '~/db/organizations.server';
import { resolveYear } from '~/lib/fiscal-year';
import { ReportShell } from '~/components/report-shell';
import { Card, CardContent, CardTitle } from '~/components/ui/card';
import { t } from '~/copy';

export function meta() {
  return [{ title: t('reports.title') }];
}

export function headers() {
  return { 'Cache-Control': 'private, no-store' };
}

export async function loader({ request, params }: Route.LoaderArgs) {
  if (!z.string().uuid().safeParse(params.orgId).success) {
    throw new Response('Not found', { status: 404 });
  }
  const year = resolveYear(request);
  const overview = await withUserOrg(request, params.orgId, (tx) =>
    readOrgOverview(tx, params.orgId),
  );
  if (!overview) throw new Response('Not found', { status: 404 });
  return { orgId: params.orgId, year };
}

const REPORTS = [
  { slug: 'resultat', title: 'reports.resultat.title', desc: 'reports.hub.resultat.desc' },
  { slug: 'balanse', title: 'reports.balanse.title', desc: 'reports.hub.balanse.desc' },
  { slug: 'hovedbok', title: 'reports.hovedbok.title', desc: 'reports.hub.hovedbok.desc' },
  { slug: 'reskontro', title: 'reports.reskontro.title', desc: 'reports.hub.reskontro.desc' },
  { slug: 'likviditet', title: 'reports.likviditet.title', desc: 'reports.hub.likviditet.desc' },
] as const;

export default function ReportsHubRoute({ loaderData }: Route.ComponentProps) {
  const { orgId, year } = loaderData;
  return (
    <ReportShell
      title={t('reports.title')}
      year={year}
      basePath={`/orgs/${orgId}/reports`}
      backTo={`/orgs/${orgId}`}
      backLabel={t('reports.back')}
    >
      <ul className="grid gap-3">
        {REPORTS.map((r) => (
          <li key={r.slug}>
            <Link
              to={`/orgs/${orgId}/reports/${r.slug}?year=${year}`}
              className="block rounded-lg outline-offset-2"
            >
              <Card className="hover:border-primary transition-colors">
                <CardContent className="grid gap-1 pt-6">
                  <CardTitle as="h2" className="font-text text-primary text-lg">
                    {t(r.title)}
                  </CardTitle>
                  <p className="text-muted-foreground text-sm">{t(r.desc)}</p>
                </CardContent>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </ReportShell>
  );
}
