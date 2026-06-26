import { type Level, type Logger, pino } from 'pino';

/**
 * Structured logging baseline (ADR 0021). pino, JSON to stdout (the EU Node host / Workers Logs ship
 * it onward; OTel is later). Server-only.
 *
 * The logger reads `process.env` DIRECTLY rather than the Zod `env.ts`: it is foundational infra that
 * must import without the full app-config parse (so it's usable in tests and early boot).
 *
 * Redaction is a BACKSTOP, not a license: never log personal data or secrets in the first place
 * (`.claude/rules/data-handling.md`). The paths below censor the usual leaks if an object that happens
 * to carry them is ever logged — cookies, auth headers, passwords/hashes, session + PKCE tokens, and
 * the direct personal fields (email, org-nr).
 */
const LEVELS: readonly string[] = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'];
const envLevel = process.env.LOG_LEVEL;
const nodeEnv = process.env.NODE_ENV;
const level: Level | 'silent' =
  envLevel && LEVELS.includes(envLevel)
    ? (envLevel as Level | 'silent')
    : nodeEnv === 'test'
      ? 'silent'
      : nodeEnv === 'production'
        ? 'info'
        : 'debug';

/** Secret/PII keys censored if an object carrying them is ever logged (exported for the redaction test). */
export const REDACT_PATHS = [
  'password',
  'passwordHash',
  'password_hash',
  'token',
  'sessionToken',
  'codeVerifier',
  'email',
  'orgNr',
  'org_nr',
  'headers.cookie',
  'headers.authorization',
  'req.headers.cookie',
  'req.headers.authorization',
  'set-cookie',
  // Email recipients/bodies are personal data — never logged in the first place; these are a backstop.
  'to',
  'recipient',
  'recipients',
  '*.password',
  '*.passwordHash',
  '*.token',
  '*.email',
  '*.recipient',
];

/** The base application logger. Prefer {@link requestLogger} in loaders/actions for request correlation;
 * use this directly only outside a request (e.g. a background send) — and never log personal data. */
export const logger: Logger = pino({
  level,
  base: null, // drop pid/hostname noise
  redact: { paths: REDACT_PATHS, censor: '[redacted]' },
});

/**
 * A child logger bound to a per-request id (propagated via `x-request-id` if present, else generated)
 * plus the method + path. Use it in loaders/actions so every line for one request correlates.
 */
export function requestLogger(request: Request): { log: Logger; requestId: string } {
  const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID();
  const { pathname } = new URL(request.url);
  return {
    log: logger.child({ requestId, method: request.method, path: pathname }),
    requestId,
  };
}
