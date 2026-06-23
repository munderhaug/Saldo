# ADR 0021 — Observability baseline: pino with redaction

- **Status:** Accepted
- **Date:** 2026-06-23

## Context
Not a single structured log line existed, yet the data-handling rule already assumes a redacting
logger (never log personal data or secrets). Logging is foundational — it should land before the
features that need it. Full tracing (OTel) is a later (P2) concern.

## Decision
Add **pino** as the structured logger (`app/observability/logger.server.ts`, server-only):

- JSON to stdout — the EU Node host (or Workers Logs/Tail under Cloudflare) ships it onward; no
  transport/worker-thread (keeps the client/SSR build clean — pino externalizes).
- **Redaction is a backstop, not a license.** A `REDACT_PATHS` list censors the usual leaks if an
  object carrying them is ever logged: cookies, auth headers, passwords/hashes, session + PKCE tokens,
  and the direct personal fields (email, org-nr). The primary rule still stands: don't log PII/secrets.
- **`requestLogger(request)`** returns a child logger bound to a request id (propagated via
  `x-request-id`, else generated) + method + path, so all lines for one request correlate. It's wired
  into the first real routes (`/auth/login`, `/auth/logout`) — logging only outcomes, never the email
  or password.
- The logger reads `process.env` **directly** (level by environment: debug/info/silent), not the Zod
  `env.ts` — foundational infra must import without the full app-config parse (usable in tests/early boot).

## Consequences
- A redacting structured logger exists from the first route; the data-handling assumption is now real,
  proven by an always-on redaction unit test (top-level + nested + request headers).
- Log **level** is intentionally outside the validated `env.ts` (the logger guards an invalid
  `LOG_LEVEL` by falling back) — a small, deliberate split so logging never fails to construct.
- OTel tracing / metrics and a log-shipping pipeline are deferred (P2); the JSON-to-stdout shape is
  drain-agnostic and ready for them.

## Alternatives considered
- **`console.log`** — unstructured, no levels, no redaction; unfit for a system handling personal data.
- **pino-pretty transport in dev** — nicer local output, but pulls a worker-thread transport that
  complicates the SSR build; skipped for now (pipe through `pino-pretty` manually if wanted).
- **OTel now** — heavier than a baseline needs; logging first, tracing later (tech-stack: "pino now").
