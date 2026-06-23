# STATUS — handover

> Living handover doc. Update at the END of every session (see `.claude/skills/handover`).
> The next session reads this first, then reconciles against `git log` / actual code — **trust the code**.

**Last updated:** 2026-06-23 — session: EU AI Act readiness & compliance
**Branch:** `claude/nice-davinci-6hsjbn` (off `main`). Lands via reviewed PR — never a direct push to
`main`. (HEAD moves each commit — trust `git log` over any hash written here.)

> ⚠️ **Live external integrations are not exercised in these sessions.** The Neon control plane,
> Criipto OIDC, and Brønnøysund (`data.brreg.no`) are not reachable/configured here, so auth and
> Enhetsregisteret **live** work is deferred to an env with egress + real tenants. (Web search/fetch,
> the npm registry, and Cloudflare docs MCP were available this session; local Postgres + Testcontainers
> stand in for DB work.)

## This session — EU AI Act readiness & compliance (new PR off `main`)
Reviewed **Regulation (EU) 2024/1689** source-grounded (eur-lex CELEX `32024R1689` + AI Act Explorer;
raw verbatim captures committed under `db/reference/eu-ai-act/`) and built the posture into the repo.
**Full gate green this session:** `lint:repo` (42 docs, 6 sourced, 0 warnings), `format:check`,
`typecheck`, `lint`, `test` (90 domain pass; Testcontainers skip locally — CI runs them); `audit`
unchanged (zero dependency changes).
- **Classification (every claim cited):** only the LLM features are AI systems (Art. 3(1); Recital 12
  excludes the deterministic rules engine). **Not** prohibited (Art. 5), **not** high-risk (Art. 6 +
  Annex III). Saldo = **provider** of its AI system + **deployer** of the model; **not** a GPAI
  provider (relies on the model provider's Art. 53 docs). Binding duties: **transparency** (Art. 50,
  applies **2 Aug 2026**) + **AI literacy** (Art. 4, in force since 2 Feb 2025). Penalties up to
  €15M/3% for Art. 50 (Art. 99). **EEA:** relevant; incorporation under scrutiny — build to the EU
  dates. **Line never to cross:** AI scoring/profiling a natural person's creditworthiness →
  high-risk (Annex III §5(b)).
- **Deliverables:** `docs/regulatory/eu-ai-act.md` (cited, dated knowledge page); **ADR 0017** (posture,
  sharpens ADR 0002) + ADR index; backlog **AIA-1…7** in `docs/world-class-roadmap.md`; a **CLAUDE.md
  invariant** + path-scoped gate `.claude/rules/ai-act.md`.
- **Governance decision (gate vs new agent):** considered a standalone EU AI Act subagent — **deferred**.
  Enforcement is **gate-first**: the auto-loading `.claude/rules/ai-act.md` is a stronger, deterministic
  trigger than an on-demand agent, and there is no AI surface to review yet. When AI code lands, fold
  the AI Act review into the existing `privacy-reviewer` (AIA-7), not an 8th agent (roadmap P0-5: don't
  add more, sharpen the existing). Recorded in ADR 0017.
- **Reconciled task vs repo:** the task referenced `pnpm backlog` / a `compliance-eu-ai-act` task and
  a pino-logging ADR numbered 0021 — none exist here. Mapped to the roadmap master backlog and ADR
  **0017** (next free number; logging/`pino` is still **Intended**, PR 6 — referenced as such, not as
  an ADR, so the repo-lint cross-ref gate stays green).

## Verified state (previous session — PRs 1/2/2.5, merged as #10)
- ✅ `pnpm audit --audit-level=high` (no known vulns), `typecheck`, `lint`, `lint:repo` (40 docs,
  0 warnings), `format:check`, `test` (**90 domain** incl. fast-check; Testcontainers skip locally
  without Docker — they run in CI), web `build` (**React 19** SSR + **Tailwind v4** token CSS compiles).
- ✅ **Ledger integrity proven (unchanged):** Testcontainers prove balance / immutability / period-lock /
  gapless-counter + RLS tenant isolation against real Postgres (`apps/web/test/integrity/`).
- ✅ **Zero contradictions, now ENFORCED:** `tools/repo-lint.mjs` fails CI if an `ADR NNNN` cross-ref
  doesn't resolve, a "Locked" status label reappears, or a cited `db/reference/<dir>` is missing.
- ✅ **No inline CSS, ENFORCED:** ESLint bans the JSX `style` prop in `apps/web/app/**` (negative-tested).

## Active phase
**Phase 0 (Foundation) — hardening.** Prior sessions delivered steps 1–5 (ledger schema, SQL-integrity
proofs, SAF-T reference data, VAT engine, RLS tenancy + `withOrgTx`). This session: a full world-class
review + the foundation-hardening PRs 1 / 2 / 2.5. Next: the remaining hardening PRs 3–6, then the
feature track (auth → Enhetsregisteret → Phase 1).

## Done (previous session — PRs 1/2/2.5, merged as #10)
- **World-class roadmap** — `docs/world-class-roadmap.md` (architecture decision, hardening plan, the
  24-item contradiction kill-list, master backlog).
- **PR 1 — decisions & consistency.** Option 2 architecture (**ADR 0015** persistent Node on an EU PaaS
  + Cloudflare edge/CDN + R2; **ADR 0013** Neon EU; **ADR 0014** Testcontainers). Eliminated all 24
  cross-doc contradictions; "Locked"→Current/Intended/Superseded; `oslo`→`@oslojs/*`; SECURITY.md
  truthed-up; created `db/reference/{brreg,llm,auth}/`; the **repo-lint contradiction gate**; `AGENTS.md`;
  the exemplar-sibling rule line.
- **PR 2 — frontend foundation.** Tailwind v4 `@theme` tokens (light/dark + debit/credit/paid/overdue);
  shadcn `components/ui` **Card + Table** (React 19 ref-as-prop); `home.tsx` rewritten with **zero inline
  styles**; root `ErrorBoundary`; **React 18.3 → 19**; the **inline-`style` ESLint ban**.
- **PR 2.5 — experience principles + design ADRs.** `docs/experience-principles.md` (source of truth) +
  `.claude/rules/experience-voice.md`; **ADR 0016** (adaptive two-surface design system); **ADR 0002
  refined** to the grace-window confirmation model (+ matching CLAUDE.md invariant).

## In progress
- (nothing mid-change — clean tree after the handover/STATUS commit)

## Next up (ordered) — remaining P0 hardening, then the feature track
**PR 3 — Mechanical gates & continuous-improvement (Layers 1–2):**
- **`Stop` hook = green-bar gate** (typecheck + lint + affected tests at turn-end — the top harness keeper).
- **Fail-closed hook fixes:** `precommit-check.sh` must not silently `exit 0` when `node_modules` is
  missing; `block-generated.sh` must fail-**closed** on a JSON parse error.
- **PostToolUse `lint:repo`** after edits to `docs/**` / `.claude/**`.
- **CI tooling:** `knip` (unused files/exports/deps), `dependency-cruiser` (enforce `domain ↛ web`),
  `type-coverage`, `squawk` (migration linter), **gitleaks**, **CodeQL**, **CycloneDX SBOM**, **SHA-pin**
  all Actions. A scheduled **freshness/health** workflow (verify-by + audit + knip → one rolling issue).
  The **`/new-adr`** skill. Wire **`/verify`** into the new-feature loop (maker≠judge).
**PR 4 — Ledger integrity gaps** (each with a Testcontainers proof of the bad case):
- **Period-lock hole (real bug):** the lock trigger fires on `voucher`, not `posting`, so postings can be
  added to an existing *unposted* voucher in a now-locked period. Add a posting-side check.
- `posted ⇒ ≥2 postings & balanced` (forbid empty / dangling / half-posted vouchers).
- `EXCLUDE` (btree_gist) so a tenant's `fiscal_period` ranges can't overlap; same-org `period_id` FK.
- **RLS-coverage gate:** a test asserting *every* `public` table has ENABLE+FORCE RLS + a policy + grants.
**PR 5 — Identity & session foundation (auth)** — the missing *first* lock (RLS is a strong 2nd lock with
no 1st lock today). `app_user` / `user_session` / `membership` migration (opaque token → SHA-256 via
`@oslojs/*`; session tables NOT org-RLS'd; grant `saldo_app`); `HttpOnly`/`Secure`/`SameSite=Lax` cookies,
rotate on login; **openid-client v6** provider interface (PKCE + state + nonce) + a dev email/password
provider (argon2id); Zod **`env.ts`** (owner + `saldo_app` URLs); `requireUser` → `withOrgTx`; routes
`/auth/login|callback|logout`; an ADR (session & identity model). Point `DATABASE_URL` at `saldo_app`.
**PR 6 — Observability baseline** — `pino` + redaction + request-id (OTel later).
**Then the feature track (Phase 1+):** Enhetsregisteret lookup; org & contacts onboarding (the user→org
membership UI); the **honest-number domain feature** (spendable = income − VAT held − estimated tax —
pure + exhaustively tested) + its reveal; the Norwegian-first **keyed microcopy** system; the **mobile
companion** surface (`components/mobile`, per ADR 0016, built per feature); reverse-charge dual-leg +
non-deductible VAT rules (Phase 2 carry-overs).
**Continuous-improvement Layer-3 (a small "PR 3.5" when ready):** a monthly refactor pass
(`/code-review` + `/simplify` on one rotating module) + a quarterly tech-radar (`/deep-research` →
dated ADOPT/MINE/SKIP, adoption gated by an ADR) + a `docs/improvements.md` ledger.

## Open decisions (most now decided this session)
- **Architecture/hosting — DECIDED: Option 2** (persistent Node on an EU PaaS + Cloudflare edge/CDN + R2;
  Neon EU via Hyperdrive) — ADR 0015. Workers-native is the documented runner-up.
- **Database — DECIDED: Neon (EU)** (ADR 0013). **CI DB — DECIDED: Testcontainers** (ADR 0014).
- **UI — DECIDED: shadcn + Tailwind v4 tokens, React 19** (ADR 0006 + PR 2).
- **Design system — DECIDED: adaptive two-surface** (ADR 0016). **Confirm model — DECIDED: grace-window
  passive confirm** (ADR 0002 refined). **eID broker — DECIDED: Criipto.**
- **Still open:** Cloudflare **EU DPA + Worker/edge residency** confirm before go-live; **LLM hosting**
  (Phase 4; default local); **transactional email** provider (before Phase 3); **PEPPOL access point +
  Altinn onboarding** (Phase 9); **product name** ("Saldo" is a working name).

## Known issues / to verify
- **No auth yet** — tenancy RLS is the *second* lock; the *first* (authn + user→org authz) lands in PR 5.
  Until then `withOrgTx` trusts a caller-supplied org id.
- **Period-lock SQL hole** (above) — open until PR 4.
- **Live integrations deferred** — verify Neon EU + custom-role RLS, and that **Hyperdrive preserves
  `SET LOCAL`**, when wiring auth/DB live (needs egress + tenants).
- `saft:validate` is still a **scaffold** (returns 0) — implement SAF-T generation + XSD validation.
- **Unused frontend deps** (motion, vaul, recharts, lucide-react, react-hook-form, @hookform/resolvers,
  @tanstack/react-table) remain in `apps/web/package.json` — wire or prune per feature (RHF + TanStack
  are imminent; `knip` in PR 3 tracks this).
- `home.tsx` is a **throwaway scaffold** — the real home is "You're caught up" + the honest-number
  reveal, not a ledger (experience-principles §4.2 / §6).
- Local commits are **unsigned** (no signing key here); they verify on push through the proxy.
