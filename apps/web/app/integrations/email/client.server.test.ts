import { describe, expect, it } from 'vitest';
import { sendEmail } from './client.server';

describe('sendEmail — fail-closed when the email backend is not configured', () => {
  it('returns not-configured (never touches SMTP) when no EU email backend is set', async () => {
    // The test env sets no EMAIL_* vars, so the residency gate keeps the feature off: the send must
    // refuse cleanly rather than attempt a connection.
    const result = await sendEmail({
      to: 'kunde@example.no',
      subject: 'Faktura 10001',
      text: 'Vedlagt faktura.',
    });
    expect(result).toEqual({ ok: false, reason: 'not-configured' });
  });
});
