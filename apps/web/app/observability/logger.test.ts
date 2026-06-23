import { describe, expect, it } from 'vitest';
import { pino } from 'pino';
import { REDACT_PATHS } from './logger.server.js';

// Pure unit test (no Docker). The data-handling rule forbids logging personal data/secrets; this proves
// the redaction backstop censors them if an object that carries them is ever logged.
describe('logger redaction', () => {
  function captureLog(obj: Record<string, unknown>): Record<string, unknown> {
    let line = '';
    const log = pino(
      { base: null, redact: { paths: REDACT_PATHS, censor: '[redacted]' } },
      { write: (s: string) => (line += s) },
    );
    log.info(obj, 'msg');
    return JSON.parse(line) as Record<string, unknown>;
  }

  it('censors top-level secrets and personal fields', () => {
    const out = captureLog({
      password: 'hunter2',
      token: 'abc',
      email: 'kari@example.no',
      orgNr: '123456785',
      userId: 'keep-me',
    });
    expect(out.password).toBe('[redacted]');
    expect(out.token).toBe('[redacted]');
    expect(out.email).toBe('[redacted]');
    expect(out.orgNr).toBe('[redacted]');
    // Non-sensitive context is preserved.
    expect(out.userId).toBe('keep-me');
  });

  it('censors nested secrets and request headers', () => {
    const out = captureLog({
      user: { email: 'x@y.no', password: 'p' },
      headers: { cookie: 'saldo_session=secret', authorization: 'Bearer t' },
    });
    const user = out.user as Record<string, unknown>;
    const headers = out.headers as Record<string, unknown>;
    expect(user.email).toBe('[redacted]');
    expect(user.password).toBe('[redacted]');
    expect(headers.cookie).toBe('[redacted]');
    expect(headers.authorization).toBe('[redacted]');
  });
});
