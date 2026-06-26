/**
 * Transactional-email client — sends an invoice (PDF attached) through the provider-agnostic SMTP
 * interface (nodemailer). The configured backend is Postmark EU (ADR 0045), but nothing here names the
 * provider: it is just the SMTP host/credential from {@link emailConfig}, so the provider is swappable.
 *
 * Expected failures (feature off, SMTP error) are returned as a typed result, never thrown — the action
 * maps them to calm, system-owns-fault copy. **Recipients and bodies are personal data and are NEVER
 * logged** (`data-handling.md`): on failure we log only that a send failed + the error class, never the
 * message. Server-only.
 */
import nodemailer from 'nodemailer';
import { logger } from '~/observability/logger.server';
import { emailConfig } from './config.server';

/** One outgoing message. `attachments` carry the rendered PDF (and later the EHF XML). */
export interface OutgoingEmail {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html?: string;
  readonly attachments?: readonly {
    readonly filename: string;
    readonly content: Buffer;
    readonly contentType: string;
  }[];
}

export type SendResult =
  | { readonly ok: true; readonly messageId: string }
  | { readonly ok: false; readonly reason: 'not-configured' | 'send-failed' };

/**
 * Send one message. Returns `not-configured` when the EU-region email backend is unset (the caller
 * surfaces a "not set up yet" state rather than an error), `send-failed` on an SMTP error.
 */
export async function sendEmail(message: OutgoingEmail): Promise<SendResult> {
  const config = emailConfig();
  if (!config) return { ok: false, reason: 'not-configured' };

  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465, // 465 = implicit TLS
    // Fail closed on encryption: on 587 require STARTTLS rather than letting nodemailer fall back to a
    // plaintext connection — invoice PII must never cross the wire in cleartext (data-handling.md).
    requireTLS: true,
    auth: { user: config.user, pass: config.password },
  });

  try {
    const info = await transport.sendMail({
      from: config.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      attachments: message.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      })),
    });
    return { ok: true, messageId: info.messageId };
  } catch (error) {
    // Log only the error CLASS — an SMTP error may embed the recipient, which must not be logged.
    logger.error(
      { errorName: error instanceof Error ? error.name : 'unknown' },
      'transactional email send failed',
    );
    return { ok: false, reason: 'send-failed' };
  }
}
