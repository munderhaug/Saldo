/**
 * EHF / PEPPOL BIS Billing 3.0 XML — a resource route (loader only). Generates the e-invoice for an
 * ISSUED invoice / credit note from the FROZEN document (the pure `buildUblXml`, build-spec §9 "start
 * now"), ahead of the commercial access point (`feat-peppol-send`). Tenancy via `withUserOrg` (RLS);
 * a quote / draft / other-tenant document is a 404. `private, no-store` — the document is personal data.
 */
import { buildUblXml } from '@saldo/domain';
import { z } from 'zod';
import type { Route } from './+types/orgs.$orgId.invoices.$invoiceId.ehf';
import { withUserOrg } from '~/auth/auth.server';
import { readInvoiceDocument, toEhfModel } from '~/db/invoice-document.server';

export async function loader({ request, params }: Route.LoaderArgs) {
  if (
    !z.string().uuid().safeParse(params.orgId).success ||
    !z.string().uuid().safeParse(params.invoiceId).success
  ) {
    throw new Response('Not found', { status: 404 });
  }

  const doc = await withUserOrg(request, params.orgId, (tx) =>
    readInvoiceDocument(tx, params.invoiceId),
  );
  if (!doc) throw new Response('Not found', { status: 404 });

  const model = toEhfModel(doc);
  if (!model) throw new Response('Not found', { status: 404 }); // a quote carries no EHF

  const xml = buildUblXml(model);
  const filename = `ehf-${doc.invoiceNumber ?? doc.id}.xml`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
