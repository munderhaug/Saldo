/**
 * MVA-melding XML — a resource route (loader only). Generates the Skatteetaten `mvaMeldingDto` for the
 * year's posted ledger (the pure `buildMvaMeldingXml`, build-spec §8.8). Tenancy via `withUserOrg`
 * (RLS); an unregistered org or a bad org id is a 404. `private, no-store` — the document is financial
 * data. This is the artefact a user can hand to an accountant or upload to "Min mva"; programmatic
 * submission (Altinn 3) is `feat-altinn-mva-submission`.
 */
import { z } from 'zod';
import { ANNUAL_TERM, buildMvaMeldingXml, generateMvaMelding } from '@saldo/domain';
import type { Route } from './+types/orgs.$orgId.mva[.xml]';
import { withUserOrg } from '~/auth/auth.server';
import { aggregateVatByCode } from '~/db/mva-melding.server';
import { readOrgOverview } from '~/db/organizations.server';
import { asMvaStatus } from '~/lib/org-format';
import { resolveYear } from '~/lib/fiscal-year';
import { mvaSystemInfo } from '~/lib/mva-system-info.server';
import { STANDARD_TAX_CODE_INDEX } from '~/db/provisioning.server';

export async function loader({ request, params }: Route.LoaderArgs) {
  if (!z.string().uuid().safeParse(params.orgId).success) {
    throw new Response('Not found', { status: 404 });
  }
  const year = resolveYear(request);

  const data = await withUserOrg(request, params.orgId, async (tx) => ({
    overview: await readOrgOverview(tx, params.orgId),
    aggregates: await aggregateVatByCode(tx, year),
  }));
  if (!data.overview) throw new Response('Not found', { status: 404 });

  const result = generateMvaMelding(
    data.aggregates,
    {
      orgNr: data.overview.org.orgNr as never,
      year,
      term: ANNUAL_TERM,
      mvaStatus: asMvaStatus(data.overview.org.mvaStatus),
    },
    STANDARD_TAX_CODE_INDEX,
  );
  if (!result.registered) throw new Response('Not found', { status: 404 }); // no melding to file

  const xml = buildMvaMeldingXml(result.melding, mvaSystemInfo(params.orgId, year));
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="mva-melding-${year}.xml"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
