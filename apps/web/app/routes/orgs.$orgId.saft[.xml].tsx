/**
 * SAF-T Financial XML — a resource route (loader only). Generates the official Norwegian SAF-T
 * Financial export for the year's posted ledger (the pure `buildSaftXml`, build-spec §8 / Phase 8).
 * Tenancy via `withUserOrg` (RLS); a bad org id or unknown org is a 404. `private, no-store` — the
 * document is financial + personal data, EU-resident and never cached. This is the file a user hands to
 * an accountant or uploads at a bokettersyn; it is deterministic and read-only (NOT an AI system).
 */
import { z } from 'zod';
import { buildSaftXml, generateSaftFinancial, type SaftSystemInfo } from '@saldo/domain';
import type { Route } from './+types/orgs.$orgId.saft[.xml]';
import { withUserOrg } from '~/auth/auth.server';
import { readOrgOverview } from '~/db/organizations.server';
import { readSaftFinancial } from '~/db/saft.server';
import { STANDARD_ACCOUNT_INDEX, STANDARD_TAX_CODE_INDEX } from '~/db/provisioning.server';

/** Identity of the generating system for the Header software fields. The export date is injected here. */
function systemInfo(dateCreated: string): SaftSystemInfo {
  return {
    softwareCompanyName: 'Saldo',
    softwareId: 'Saldo',
    softwareVersion: '0.0.0',
    dateCreated,
  };
}

function resolveYear(request: Request): number {
  const raw = new URL(request.url).searchParams.get('year');
  const parsed = z.coerce.number().int().min(2000).max(2100).safeParse(raw);
  return parsed.success ? parsed.data : new Date().getFullYear();
}

export async function loader({ request, params }: Route.LoaderArgs) {
  if (!z.string().uuid().safeParse(params.orgId).success) {
    throw new Response('Not found', { status: 404 });
  }
  const year = resolveYear(request);

  const data = await withUserOrg(request, params.orgId, async (tx) => ({
    overview: await readOrgOverview(tx, params.orgId),
    input: await readSaftFinancial(tx, year),
  }));
  if (!data.overview) throw new Response('Not found', { status: 404 });

  const model = generateSaftFinancial(
    data.input,
    { orgNr: data.overview.org.orgNr as never, name: data.overview.org.name, year },
    STANDARD_ACCOUNT_INDEX,
    STANDARD_TAX_CODE_INDEX,
  );
  const dateCreated = new Date().toISOString().slice(0, 10);
  const xml = buildSaftXml(model, systemInfo(dateCreated));

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="saf-t-financial-${year}.xml"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
