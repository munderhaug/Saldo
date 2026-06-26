/**
 * Invoice / credit-note PDF — a resource route (loader only, no UI). Renders the FROZEN issued document
 * to `application/pdf` via `@react-pdf/renderer` on the Node host (ADR 0015). Tenancy is enforced by
 * `withUserOrg` (membership + RLS); a draft or an absent/other-tenant document is a 404 (the model is
 * only built for issued documents). The response is `private, no-store` — an invoice is personal data.
 */
import { renderToBuffer } from '@react-pdf/renderer';
import { z } from 'zod';
import type { Route } from './+types/orgs.$orgId.invoices.$invoiceId.pdf';
import { withUserOrg } from '~/auth/auth.server';
import { readInvoiceDocument } from '~/db/invoice-document.server';
import { InvoicePdf } from '~/documents/invoice-pdf';

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

  const buffer = await renderToBuffer(<InvoicePdf doc={doc} />);
  const prefix = doc.kind === 'credit_note' ? 'kreditnota' : 'faktura';
  const filename = `${prefix}-${doc.invoiceNumber ?? doc.id}.pdf`;

  // Wrap the Node Buffer in a plain Uint8Array so it satisfies the web `BodyInit` type.
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
