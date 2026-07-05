/**
 * Send an issued invoice / credit note to the customer by email (build-spec §8.4, feat-invoice-pdf-email).
 * Sending is a §5.5 CONSEQUENTIAL act — the caller (the detail action) gates it behind an explicit
 * confirm; this module performs it: read the frozen document, render the PDF (`@react-pdf/renderer`),
 * send through the provider-agnostic SMTP client (Postmark EU, ADR 0045), RECORD the attempt to the
 * append-only `invoice_email` log, and on success advance the lifecycle issued/draft → sent.
 *
 * Server-only (the `.server` suffix keeps react-pdf out of the client bundle). Recipients/bodies are
 * personal data and are never logged (the client handles redaction). The PDF render + network send run
 * OUTSIDE the DB transaction; only the provenance record + lifecycle bump are transactional.
 */
import { renderToBuffer } from '@react-pdf/renderer';
import { withUserOrg } from '~/auth/auth.server';
import { readInvoiceDocument, recordEmailSend } from '~/db/invoice-document.server';
import { transitionInvoice } from '~/db/invoices.server';
import { recordAuditEvent } from '~/db/audit.server';
import { sendEmail } from '~/integrations/email/client.server';
import { InvoicePdf } from '~/documents/invoice-pdf';
import { t } from '~/copy';

export type SendOutcome =
  | { readonly ok: true; readonly recipient: string }
  | {
      readonly ok: false;
      readonly reason: 'not-found' | 'no-recipient' | 'not-configured' | 'send-failed';
    };

/** Render + send + record one invoice email. The whole flow is tenant-scoped via `withUserOrg` (RLS). */
export async function sendInvoiceEmail(
  request: Request,
  organizationId: string,
  invoiceId: string,
): Promise<SendOutcome> {
  const doc = await withUserOrg(request, organizationId, (tx) =>
    readInvoiceDocument(tx, invoiceId),
  );
  if (!doc || doc.kind === 'quote') return { ok: false, reason: 'not-found' };

  const recipient = doc.customer.email;
  if (!recipient) return { ok: false, reason: 'no-recipient' };

  const pdf = await renderToBuffer(<InvoicePdf doc={doc} />);
  const number = doc.invoiceNumber !== null ? String(doc.invoiceNumber) : '';
  const subject =
    doc.kind === 'credit_note'
      ? t('invoices.email.subjectCreditNote', { number, seller: doc.seller.name })
      : t('invoices.email.subjectInvoice', { number, seller: doc.seller.name });
  const prefix = doc.kind === 'credit_note' ? 'kreditnota' : 'faktura';

  const result = await sendEmail({
    to: recipient,
    subject,
    text: t('invoices.email.body', { seller: doc.seller.name }),
    attachments: [
      {
        filename: `${prefix}-${number || doc.id}.pdf`,
        content: Buffer.from(pdf),
        contentType: 'application/pdf',
      },
    ],
  });

  // A "not configured" backend never attempted a send — surface it without recording a failed attempt.
  if (!result.ok && result.reason === 'not-configured') {
    return { ok: false, reason: 'not-configured' };
  }

  await withUserOrg(request, organizationId, async (tx, { user }) => {
    await recordEmailSend(tx, organizationId, invoiceId, {
      recipient,
      status: result.ok ? 'sent' : 'failed',
      providerMessageId: result.ok ? result.messageId : null,
      error: result.ok ? null : 'send-failed',
    });
    // The send is what moves a document to «sent» (the manual mark is a fallback). A no-op if the
    // lifecycle doesn't allow it (e.g. already sent → re-send records the attempt without a transition).
    if (result.ok) await transitionInvoice(tx, invoiceId, 'sent');
    // Sporbarhet (ADR 0062): every send attempt (a §5.5 act) is attributed, success or failure —
    // the invoice_email row holds the outcome; this row holds the actor.
    await recordAuditEvent(tx, {
      organizationId,
      actorUserId: user.id,
      action: 'invoice.sent',
      entityId: invoiceId,
    });
  });

  return result.ok ? { ok: true, recipient } : { ok: false, reason: 'send-failed' };
}
