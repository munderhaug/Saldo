# Quality bar — Definition of Done

> Saldo is a **production-ready financial system of record, held to a high bar** — not a throwaway MVP.
> Every change meets this bar before it merges. The bar is enforced **mechanically** (CI required
> checks, hooks, custom lint, tests) wherever possible — quality is a gate, not an aspiration.

## Definition of Done — every change
A change is "done" only when ALL of the following hold:
- ✅ `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm format:check`, and `pnpm audit` are green.
- ✅ New behavior is covered by tests. Domain (money/VAT/posting): **exhaustive + fast-check property**
  tests. UI: component/interaction tests for non-trivial logic.
- ✅ Ledger-touching change has a **Testcontainers integration test** proving the SQL trigger/constraint
  actually blocks the bad case (imbalance, posted-row mutation, locked period, numbering gaps).
- ✅ Accessibility: `jsx-a11y` clean **and** an axe pass on changed screens; meets **WCAG 2.2 AA**.
- ✅ Security & privacy: no secrets in code; every external/user input validated with Zod; tenancy
  (org filter + RLS) honored; no personal data sent outside the EU/EEA; deps audited clean.
- ✅ Observability: meaningful structured logs/traces and error handling on new paths; no stray
  `console.*`; no swallowed errors.
- ✅ Docs: an ADR for any decision; `docs/STATUS.md` updated; user-facing copy in NO **and** EN.
- ✅ Reviewed: the relevant reviewer subagent (vat / privacy / a11y / integration) **and** human
  approval, via a PR from a branch — **never a direct push to `main`** (see CONTRIBUTING.md).

## Quality dimensions (the standard, concretely)
| Dimension | Bar |
|---|---|
| **Correctness** | The domain core is the most correctness-critical layer: exhaustively + property-tested. Integrity proven in SQL and in tests. |
| **Type safety** | Strict TS, `noUncheckedIndexedAccess`, **no `any`**, no unjustified `as`. Branded domain primitives. |
| **Testing** | Unit + property (Vitest/fast-check) · integration vs real Postgres (Testcontainers) · e2e critical flows (Playwright) · SAF-T XSD + EHF/VEFA in CI. Coverage thresholds on `@saldo/domain`. |
| **Security** | OWASP-aware: validated inputs, parameterized queries, authz + RLS, OIDC done right (PKCE, state/nonce, session rotation), CSP/security headers, rate limiting, secret hygiene. Clean `pnpm audit`. |
| **Privacy/GDPR** | EU residency; personal-data classification; retention vs ledger-immutability documented; export + lawful-basis deletion paths. |
| **Reliability** | Reversible, tested migrations; idempotent jobs; graceful shutdown; documented + tested backup/PITR. |
| **Performance** | Indexed queries, no N+1, bundle budgets, good Core Web Vitals; money/list views stay fast at realistic data volumes. |
| **Accessibility** | WCAG 2.2 AA, semantic-HTML-first, keyboard + screen-reader verified, reduced-motion honored. |
| **i18n / locale** | NO/EN; `nb-NO` number/date formatting; **Europe/Oslo** time zone handling for periods. |
| **Observability** | OpenTelemetry traces, pino structured logs, error tracking, health/readiness endpoints. |
| **Supply chain** | Lockfile committed; deps audited; Dependabot; pinned CI actions; reproducible builds. |
| **CI/CD** | typecheck → lint → format → test → migrate → build → audit → SAF-T XSD, all required; protected `main`; PR review. |
| **Documentation** | ADRs for decisions; living STATUS; runbook; per-integration docs; lean CLAUDE.md + path-scoped rules. |

## Explicitly NOT acceptable
- A scaffold/stub merged and called "done" (e.g. a no-op validator) — finish it or mark it clearly TODO
  and out of the Definition of Done for that change.
- `any`, raw arithmetic on money, hardcoded VAT codes/accounts, an UPDATE/DELETE on a posted row.
- A ledger change without a SQL-integrity test. Secrets in the repo. Merging past a red check.
- Shipping inaccessible UI, or English-only user-facing copy.

## How the bar is enforced (mechanical first)
Hooks (typecheck/lint after edits, block generated files) · custom `saldo/no-money-arithmetic` lint ·
`jsx-a11y` · CI required checks + branch protection · Testcontainers integrity tests · SAF-T XSD /
VEFA validation · reviewer subagents · Dependabot. Prefer a deterministic gate over a reminder.
