# ADR 0005 — React Router 7 (framework mode) over Next.js

- **Status:** Accepted
- **Date:** 2026-06-22

## Context
This is a forms/mutations/server-authoritative financial app, built primarily by agents. Two things
matter: a UI architecture that fits forms-and-ledgers, and a low agent-error rate.

## Decision
Use **React Router 7 in framework mode** (the merged Remix). Loaders/actions are the typed
client↔server boundary; native `<Form>` gives an HTML-first, progressively-enhanced UI. No separate
API / no tRPC.

## Consequences
- Fewer agent-error modes than Next's RSC server/client boundary.
- The HTML-first model aligns with the "effectiveness of HTML" for agent legibility.
- **Accepted cost:** RR7's training corpus is thinner than Next's. Mitigated by pinning Context7 MCP
  to the exact version so the agent stops guessing APIs.

## Alternatives considered
- **Next.js** — deeper corpus, but RSC boundary errors create token churn. Conservative fallback only.
- **SPA + tRPC + separate API** — unnecessary; loaders/actions already *are* the typed boundary.
