/**
 * Full raw data export — a resource route (loader only, ADR 0062). Streams the org's complete business
 * data as one machine-readable JSON file: the anti-lock-in guarantee (build-spec §8.11/§11, GDPR
 * Art. 20) beside the standardised SAF-T export. Tenancy via `withUserOrg` (RLS); `private, no-store`
 * — the document is financial + personal data and never cached. Deterministic and read-only — NOT an
 * AI system (Recital 12).
 */
import { z } from 'zod';
import type { Route } from './+types/orgs.$orgId.export[.json]';
import { withUserOrg } from '~/auth/auth.server';
import { readFullExport } from '~/db/export.server';

export async function loader({ request, params }: Route.LoaderArgs) {
  if (!z.string().uuid().safeParse(params.orgId).success) {
    throw new Response('Not found', { status: 404 });
  }

  const data = await withUserOrg(request, params.orgId, (tx) => readFullExport(tx));
  if (!data.organization) throw new Response('Not found', { status: 404 });

  const exportedAt = new Date().toISOString();
  const body = JSON.stringify({ exportedAt, ...data }, null, 2);

  return new Response(body, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="saldo-eksport-${exportedAt.slice(0, 10)}.json"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
