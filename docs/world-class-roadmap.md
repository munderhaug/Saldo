# Saldo — Roadmap to a World-Class Repo

> **Type:** planning report (living). **Created:** 2026-06-23. **Owner:** @munderhaug.
> This is the full, prioritized plan to take Saldo from an excellent Phase-0 foundation to a
> truly world-class system of record — both the work to do **now** and the discipline to stay
> world-class **going forward**. It supersedes the ad-hoc review notes from this session.
>
> **Status vocabulary** (replaces "Locked", per this session's decision):
> **Current** = active choice, in effect now (revisable via ADR) · **Intended** = planned, not
> yet adopted/built · **Superseded** = replaced by a later ADR.

---

## How to read this

Work is tiered:

- **P0 — Foundation (now).** Closes correctness/security gaps and contradictions in what already
  exists. Do before building features.
- **P1 — Next.** The first real product slice + the mechanical gates that keep quality high.
- **P2 — Going forward.** Sustaining disciplines, future-phase tech, and operational maturity.

Every item is sized (S/M/L) and mapped to a PR. Nothing here is "vibe" — each is a verifiable
outcome (a test, a gate, a doc, an observable behavior).

---

## Part 0 — The one decision that gates everything: deployment architecture

You chose **Cloudflare over Fly.io**. That is not a deploy-target swap; it is an architectural
fork, because today's docs describe a *persistent Node server* with *in-process jobs*, a *local
LLM*, and a *self-hostable everywhere* principle (ADR 0008/0009/0010). Resolve this first — it
cascades into the tech stack, several ADRs, and the residency story.

### The good news: your crown jewels are portable

The genuinely hard, genuinely excellent work is **architecture-independent**:

- The pure `@saldo/domain` core — runs anywhere.
- The SQL integrity layer (balance/immutability/period-lock triggers, gapless counter, **FORCE
  RLS + WITH CHECK**) — lives in Postgres, not the runtime.
- The `withOrgTx` tenancy pattern (`SET LOCAL app.current_org` in a transaction) — works unchanged
  over **Cloudflare Hyperdrive** with `postgres.js` (Hyperdrive recommends a native driver; `SET
  LOCAL` is transaction-scoped, which is exactly why `withOrgTx` is transaction-based).

So **choosing Cloudflare costs you none of the ledger work.** Confirmed against current docs:
React Router 7 has **first-class Cloudflare support** (official template + Cloudflare Vite plugin,
GA 2026), and **Neon + Workers via Hyperdrive** keeps `postgres.js` and RLS.

### What a *fully* Cloudflare-native (Workers) topology would change — the runner-up

> The chosen **Option 2** (below) uses only Cloudflare's **edge/CDN + R2**, not the Workers runtime —
> so the jobs and LLM rows here (Workflows, Workers AI) do **not** apply; `graphile-worker` and the
> local-LLM option stay.

| Concern | Current docs (self-hosted) | Cloudflare-native | Verdict |
|---|---|---|---|
| App runtime | Persistent Node on Hetzner/Kamal | RR7 on **Workers** (Vite plugin) | Change ADR; viable & GA |
| Database | Self-host PG / Neon | **Neon via Hyperdrive** (keep `postgres.js` + RLS-GUC) | **No rework** — keep Neon (already decided) |
| Background jobs | `graphile-worker` in-process (ADR 0010) | **Workflows** (durable, retries, multi-step) + **Cron Triggers**/Queues | **Supersede ADR 0010** |
| Object storage | MinIO/Garage (ADR 0008) | **R2** with `eu` jurisdiction | Change; R2 is S3-compatible |
| LLM / OCR | Local Ollama/vLLM (ADR 0009) | **Workers AI** / AI Gateway, or external EU GPU endpoint | **Revisit ADR 0009** (decide at Phase 4) |
| Observability | SigNoz/Langfuse/GlitchTip self-host | Workers Logs/Traces + Tail Workers (+ Langfuse optional) | Simplify |
| Email | nodemailer SMTP | Email Workers **or** external EU SMTP (keep swappable) | Keep interface |
| Secrets | Server env | Workers secrets / env bindings | Change wiring |

### The two coherent architectures (you must pick one; hybrids leak ops)

- **A. Sovereign self-hosted** (today's docs): max control + data sovereignty; **heavy** solo
  operational burden (you run PG, MinIO, observability, an LLM box, a Kamal/Hetzner deploy).
- **B. Cloudflare-native serverless** (your lean): **minimal** ops, first-class RR7, managed
  durable jobs; cost is **proprietary lock-in** and a self-imposed-principle change (ADR 0008).

### Decision (2026-06-23): **Option 2 — persistent Node on an EU PaaS + Cloudflare edge/CDN + R2** (ADR 0015)

After weighing all alternatives, the chosen architecture is a **persistent Node server in one EU
region** (Railway/Render/Fly EU — interchangeable container hosts), with **Cloudflare as the edge
layer** (CDN, WAF/DDoS, DNS) and **R2** (EU jurisdiction) for documents; the database stays **Neon
EU** (ADR 0013), reached via **Hyperdrive** when fronted by Cloudflare. Rationale: the app's compute
is **server-shaped** (PDF / SAF-T / LLM / jobs) and **single-country**, so a global edge runtime
(Workers) is a poor fit and buys benefits Saldo doesn't need; a standard-Node host keeps the whole
pipeline predictable and portable. This **keeps `graphile-worker` in-process (ADR 0010 stands)** and
**leaves the local-LLM option open (ADR 0009 stands)** — so it also minimizes doc churn.
**Cloudflare Workers-native** (the table above) is the documented **runner-up**; **self-host
Hetzner/Kamal** is the sovereignty fallback.

**The one box to check before committing (Norwegian bokføring + GDPR):** data-at-rest in the EU is
achievable (**Neon EU**, **R2 `eu`**); confirm the EU residency of the chosen Node PaaS region,
**sign Cloudflare's EU DPA + SCCs**, and verify **Hyperdrive preserves the `SET LOCAL` GUC**
end-to-end (a Testcontainers/staging check).

**Docs impact (done in PR 1):** **ADR 0013** (Neon EU), **ADR 0014** (Testcontainers), **ADR 0015**
(deploy: persistent Node on an EU PaaS + Cloudflare edge/R2, revising **ADR 0008**); **ADR 0010**
(graphile-worker) and **ADR 0009** (local-LLM) **stand**. `tech-stack.md` deploy/storage/auth rows
refreshed. The domain, contracts, db, and auth work below are unaffected.

---

## Part 1 — Is the tech stack the absolute best for this app?

Verdict per layer (grounded in the app's actual needs: a correctness-critical Norwegian ledger,
solo-maintained, agent-built, 10-year horizon).

| Layer | Current choice | Verdict | Note |
|---|---|---|---|
| Language / types | TS strict, branded `Øre` | **Keep — best-in-class** | The branded-money + custom-ESLint approach is exactly right. |
| Domain purity | pure `@saldo/domain` | **Keep** | The one hard boundary; zero client/server drift. Don't touch. |
| DB + integrity | Postgres, SQL-first migrations, triggers, FORCE RLS | **Keep — crown jewel** | Portable across hosts. World-class as-is. |
| ORM | Drizzle (introspected from SQL) | **Keep** | Right call; schema generated, integrity in SQL. |
| Web framework | React Router 7 framework mode | **Keep** | First-class Cloudflare support confirms the bet (ADR 0005). |
| UI | shadcn/ui + Tailwind v4 | **Keep, but build it** | Currently documented, not implemented. See P0-2. |
| React | 18.3 | **Upgrade → 19** | Stable; Actions/`useActionState`/`use()` pair with RR7. (Decided this session.) |
| Migrations | dbmate | **Keep; add `squawk` lint** | SQL-first is correct; add unsafe-DDL gate. |
| CI DB | Testcontainers | **Keep** | Real Postgres per run; supersedes Neon-branching (ADR 0014). |
| Hosted DB | Neon (EU) | **Keep** | Pairs with Cloudflare via **Hyperdrive** (ADR 0013). |
| Jobs | graphile-worker | **Keep** (Option 2) | In-process on the persistent EU Node host; ADR 0010 stands. |
| Object storage | MinIO/Garage | **Change → R2 (eu)** | S3-compatible; EU jurisdiction (ADR 0015). MinIO/Garage = self-host fallback. |
| LLM/OCR | local Ollama/vLLM + Qwen2.5-VL | **Keep option; decide at Phase 4** | ADR 0009 stands; keep the OpenAI-compatible abstraction so hosted-EU is a base-URL swap. |
| Auth | openid-client + ~~oslo~~ + PG sessions | **Keep shape; fix lib** | `oslo` is deprecated → `@oslojs/crypto` + `@oslojs/encoding`; openid-client **v6**. |
| Validation | Zod | **Keep; extend to env** | Add a Zod-validated `env.ts` (the one boundary Zod is missing). |
| Forms/tables | RHF+Zod / TanStack Table | **Keep — build when needed** | Installed but unused today; wire when the UI lands (don't carry dead deps before then). |
| Observability | OTel/SigNoz/pino | **Start with `pino` now**; OTel later | Not one log line exists yet; logging is foundational. |
| Testing | Vitest/fast-check/Testcontainers/Playwright | **Keep; add stateful + e2e + axe + mutation** | Property tests are the safety net; extend them (P1/P2). |

**Net:** the stack is excellent and mostly correct. The only *changes* are the ones Cloudflare
forces (jobs/storage/LLM/deploy) and the auth-lib correction. The biggest *gaps* are not wrong
choices — they're **unbuilt foundations** (auth, UI, observability) and **unenforced invariants**.

---

## Part 2 — NOW: foundation hardening (P0)

Six PRs. Order: **2.1 → 2.2 → 2.5 → 2.3 → 2.4 → 2.6** (consistency first; gates before the auth
they protect; observability alongside auth).

### P0-1 (PR 1) — Consistency sweep + durable contradiction gate · **S/M**
Eliminate all **24 contradictions** (Part 4) and make recurrence impossible.
- [ ] Refresh `saldo-build-specification.md` in place to current decisions **and** add a banner:
      *"This is the dated vision doc; where it diverges from `tech-stack.md` or an ADR, those are
      Current."* (Your chosen hybrid: refresh + canonical pointer.)
- [ ] Replace **"Locked" → "Current"** repo-wide; tag future-phase tech **"Intended"**.
- [ ] Write **ADR 0013 (Neon EU)**, **ADR 0014 (Testcontainers CI DB)**, and **ADR 0015 (deploy:
      persistent Node on an EU PaaS + Cloudflare edge/R2, revising ADR 0008)** — resolves the phantom
      "ADR 0013" reference in STATUS.
- [ ] Update `.claude/rules/integrations.md`: `oslo` → `@oslojs/*`; openid-client v6.
- [ ] Refresh `STATUS.md` (branch/HEAD/date) and soften `SECURITY.md` to mark unbuilt controls
      **Intended**, not present-tense.
- [ ] Create `db/reference/{brreg,llm,auth}/` (+ README placeholders) so every cited path exists.
- [ ] **Extend `tools/repo-lint.mjs`** (the durable gate): every `ADR NNNN` reference resolves to
      a file; no `db/reference/**` path is cited unless it exists; the word "Locked" is banned as
      a status label; (optional) STATUS HEAD matches `git rev-parse`. CI then fails on any new
      contradiction. **This is what makes "absolutely none" a guarantee, not a promise.**

### P0-2 (PR 2) — Frontend foundation (tokens, shadcn, no inline CSS) · **M**
Make `frontend.md`/`design-system.md` true.
- [ ] Define the **Tailwind v4 `@theme` token layer** in `app.css`: neutral base + one accent;
      semantic state tokens `debit`/`credit`/`paid`/`overdue`; radius/spacing/typography; dark
      mode via `prefers-color-scheme`. (Replace today's placeholder comment.)
- [ ] **Initialize shadcn/ui for real**: add Radix + `class-variance-authority`; scaffold first
      primitives into `app/components/ui` (Button, Card, Table, Input, Label, Form). `cn()` exists.
- [ ] **Rewrite `home.tsx`**: zero inline styles → semantic HTML + tokenized classes; proper
      table semantics (`<caption>`, `<th scope>`); tabular-nums right-aligned money.
- [ ] **Mechanical gate**: ESLint rule banning the JSX `style` prop in `apps/web/app/**` — inline
      CSS can never reappear.
- [ ] **Upgrade React 18.3 → 19** (and `@types/react`), re-run the full gate.
- [ ] Add an RR7 **`ErrorBoundary`** to `root.tsx`.

### P0-3 (PR 4) — Identity & session foundation (auth, best-practice) · **L**
Close the biggest gap: RLS is a strong *second* lock with no *first* lock today.
- [ ] **Migration**: `app_user`, `user_session` (opaque 32-byte token; store only its **SHA-256
      hash** via `@oslojs/crypto`+`@oslojs/encoding` — the Lucia pattern), and
      `membership(user_id, organization_id, role)` — the missing user→org authz link. These are
      *not* org-RLS'd (looked up pre-org by token); grant `saldo_app`. Add a Testcontainers test.
- [ ] **Sessions**: `HttpOnly`+`Secure`+`SameSite=Lax` cookies; rotate on login; sliding +
      absolute expiry; invalidate on logout.
- [ ] **OIDC** via openid-client **v6** (PKCE S256 + state + nonce; validate iss/state/nonce)
      behind a **provider interface**; ship a **dev email/password provider** (argon2id) so the
      full login→org→ledger flow is testable now; Criipto/BankID wired when egress exists.
- [ ] **Authz wiring**: `requireUser` loader → resolve `membership` → `withOrgTx(db, orgId, …)`.
- [ ] **Zod `env.ts`**: owner + `saldo_app` `DATABASE_URL`, `SESSION_SECRET`, OIDC config — parsed
      at boot (closes the last un-Zod'd boundary).
- [ ] Routes `/auth/login` `/auth/callback` `/auth/logout`; CSRF via SameSite + Origin check on
      actions. **ADR: Session & identity model.** Flip SECURITY.md OIDC claims to Current once built.

### P0-4 (PR 5) — Ledger integrity gaps · **M**
Close concrete holes in the invariants you prize (each with a Testcontainers proof of the *bad*
case, per your discipline).
- [ ] **Period-lock hole** (real bug): the lock trigger fires on `voucher`, not `posting`, so
      postings can be added to an *existing unposted* voucher in a *now-locked* period. Add a
      `posting`-side check (or re-validate the voucher's period on posting INSERT/UPDATE/DELETE).
- [ ] **Empty/dangling voucher**: nothing forbids a voucher header with zero postings, or setting
      `posted_at` while empty/unbalanced. Add a deferred constraint: *posted ⇒ ≥2 postings &
      balanced*.
- [ ] **Period overlap**: add an `EXCLUDE` constraint (`btree_gist`) so a tenant's `fiscal_period`
      ranges can't overlap.
- [ ] **Cross-org period**: ensure a voucher's `period_id` belongs to the same org (composite FK
      or trigger), not just RLS-visibility.
- [ ] **RLS-coverage gate**: a Testcontainers test asserting **every** `public` table has
      `relrowsecurity AND relforcerowsecurity` + a policy + `saldo_app` grants — mechanically
      enforces the ledger-integrity rule's "MUST" for all future tables.

### P0-5 (PR 3) — Mechanical gates & supply chain · **S/M**
Make the quality bar deterministic, not honor-system.
- [ ] **Fix fail-open hooks**: `precommit-check.sh` must not silently `exit 0` when `node_modules`
      is missing (warn loudly / attempt install); `block-generated.sh` must **fail-closed** on a
      JSON parse error.
- [ ] **PostToolUse hook**: run `pnpm lint:repo` after edits to `docs/**` / `.claude/**`.
- [ ] **CI hardening**: `squawk` (migration linter), **gitleaks** (secret scan), **CodeQL** (SAST),
      **CycloneDX SBOM**, and **SHA-pin** all GitHub Actions (currently mutable `@v4` tags).
- [ ] **`/new-adr` skill**: scaffolds the next-numbered ADR from the template (kills the
      wrong-number / phantom-ADR class).
- [ ] **Subagents**: don't add more (7 exist, none demonstrably used) — sharpen the existing ones
      to trigger *proactively* and delete any you won't use.

### P0-6 (PR 6) — Observability baseline · **S**
- [ ] Add **`pino`** with **redaction** (personal data + secrets) and a request-id from the first
      real route — the data-handling rule already assumes this exists. (Under Cloudflare, pair with
      Workers Logs/Tail; OTel is P2.)

---

## Part 3 — GOING FORWARD: sustaining world-class (P1 / P2)

### Make the quality bar mechanical (P1)
The 21 "Definition of Done" criteria are mostly honor-system today. Convert the high-value ones to
gates: a **PR template** that requires linked ADR/tests; a CI check that a migration PR also
touches `test/integrity/`; the RLS-coverage test (P0-4); `axe` once UI exists. Prefer a gate over a
reminder — everywhere.

### Testing program (P1 → P2)
- **Stateful property testing of the ledger** (fast-check model-based): random sequences of
  post / reverse / lock against the invariants — the single highest-value test for a system of
  record.
- **Playwright e2e** for the auth + first invoice flow (P1, once UI lands).
- **`@axe-core/playwright`** for WCAG 2.2 AA in CI (P1).
- **Mutation testing** (Stryker) on `@saldo/domain` to prove the property tests actually bite (P2).

### Loops & cadence (P1)
- **Scheduled "freshness" GitHub Action** (weekly cron): runs `lint:repo` (flags passed
  `verify-by` dates), `pnpm audit`, the consistency gate — opens/updates one tracking issue when
  action is needed. Mechanically keeps regulatory citations + the no-contradiction invariant fresh.
- **Dependabot** (already weekly) — keep; auto-merge patch-level dev deps once CI is trusted.
- **PR-autofix loop** (`subscribe_pr_activity`) when you want CI babysat to green.
- The **red-green dev loop** already lives in `engineering-discipline.md` — keep it.

### Operational maturity (P1 → P2)
- **DR runbook**: Neon PITR + restore *drills* (a restore you've never tested is not a backup);
  R2 lifecycle + the 5-year retention vs immutability procedure as an actual operational doc.
- **Security program**: threat model doc; dependency-review action; secret-rotation procedure;
  signed commits in CI; periodic `security-review` skill pass on integration PRs.
- **Performance budgets** (once UI exists): bundle-size CI check, Lighthouse CI, Core Web Vitals.

### Future-phase tech — **Intended** (don't build yet; point 6)
Enhetsregisteret, BankID-via-Criipto, MVA-melding + Skatteetaten validate, PEPPOL/EHF (UBL+VEFA),
GoCardless/camt.054 banking, Vipps, recurring invoices/reminders (Workflows), receipt-capture +
vision-LLM (propose-only). Each lands in its spec'd phase, gated by the foundations above.

### EU AI Act compliance (P1) — see `docs/regulatory/eu-ai-act.md` + ADR 0017
Saldo is **not** prohibited (Art. 5) and **not** high-risk (Art. 6 + Annex III); only the LLM
features are AI systems (Art. 3(1)). The binding duties are **transparency** (Art. 50, applies
**2 Aug 2026**) and **AI literacy** (Art. 4, in force). Posture, invariant, and the path-scoped gate
(`.claude/rules/ai-act.md`) landed with the analysis; the rest is small, mostly documenting/verifying
the existing propose-only posture (ADR 0002). Tasks (AIA-1…6) are in the master table below.
The **line never to cross**: an AI feature that scores/profiles a natural person's creditworthiness
would make Saldo a high-risk provider (Annex III §5(b)) — re-open ADR 0017 before ever going there.

---

## Part 4 — Contradiction elimination (zero, and kept at zero)

24 findings across 14 themes, collapsed to fixes (all in PR 1; the durable gate makes them stay
fixed):

| Theme | Fix |
|---|---|
| Spec says Mantine / Fly.io / Neon-branching / cloud-S3 / pg-boss | Refresh spec to Current (shadcn / **Cloudflare** / Testcontainers / **R2** / Workflows) + canonical-pointer banner + supersession stamps |
| STATUS references non-existent "ADR 0013" | Write ADR 0013 (Neon) + 0014 (Testcontainers) |
| STATUS stale branch/HEAD/date | Refresh; add repo-lint HEAD check |
| `integrations.md` says deprecated `oslo` | → `@oslojs/*` + openid-client v6 |
| `frontend.md` cites non-existent `app/components/ui` | Created in PR 2 (sequence aligns rule ↔ reality) |
| STATUS/enhetsregisteret cite missing `db/reference/brreg/` | Create placeholder folder |
| `home.tsx` inline styles vs design-system | Rewrite in PR 2 + ESLint ban |
| "Saldo" called placeholder yet used as final | Make every mention say "working name" consistently |
| SECURITY.md present-tense unbuilt controls | Mark **Intended** until built |

**Durable guarantee:** the `repo-lint.mjs` extension (P0-1) turns "no contradictions" into a CI
gate. Going forward, any reintroduced contradiction fails CI.

---

## Part 5 — Consolidated backlog (master table)

| # | Item | Tier | Impact | Effort | Depends on | PR |
|---|---|---|---|---|---|---|
| 1 | Sign Cloudflare EU DPA + confirm PaaS EU region (architecture decided — ADR 0015) | P0 | ★★★★★ | S | — | (compliance) |
| 2 | Consistency sweep + repo-lint gate | P0 | ★★★★ | S/M | label decision | PR1 |
| 3 | ADRs 0013/0014 (+ Cloudflare/Auth ADRs) | P0 | ★★★ | S | #1 | PR1/PR4 |
| 4 | Frontend tokens + shadcn + no-inline-CSS + React 19 | P0 | ★★★★ | M | — | PR2 |
| 5 | Identity & session foundation (auth) | P0 | ★★★★★ | L | #4 | PR4 |
| 6 | Ledger integrity gaps (period-lock etc.) | P0 | ★★★★ | M | — | PR5 |
| 7 | Mechanical gates + supply chain (squawk/gitleaks/CodeQL/SBOM/SHA-pin) | P0 | ★★★★ | S/M | — | PR3 |
| 8 | `pino` logging + redaction | P0 | ★★★ | S | — | PR6 |
| 9 | Make quality bar mechanical (PR template, gates) | P1 | ★★★ | M | #7 | — |
| 10 | Stateful ledger property tests | P1 | ★★★★ | M | #6 | — |
| 11 | Freshness loop (scheduled CI) | P1 | ★★★ | S | #2 | — |
| 12 | e2e (Playwright) + axe | P1 | ★★★ | M | #5 | — |
| 13 | DR runbook + restore drills | P1 | ★★★★ | M | #1 | — |
| 14 | OTel tracing (SigNoz/Grafana) | P2 | ★★ | M | #8 | — |
| 15 | Mutation testing (Stryker) | P2 | ★★ | S | #10 | — |
| AIA-1 | AI-interaction disclosure in the UI (Art. 50(1)) | P1 | ★★★ | S | first AI feature | — |
| AIA-2 | AI-output provenance + labelling + logging (Art. 50(2)) | P1 | ★★★ | M | #8, first AI feature | — |
| AIA-3 | Capture upstream GPAI model docs (Annex XII) under `db/reference/llm/` (Art. 53) | P2 | ★★ | S | LLM-hosting decision (Phase 4) | — |
| AIA-4 | AI-literacy note (proportionate competence record, Art. 4) | P1 | ★★ | S | — | — |
| AIA-5 | Conformity self-assessment checklist (re-run per AI release + Art. 113 milestone) | P1 | ★★★ | S | eu-ai-act.md | — |
| AIA-6 | High-risk guard (no scoring/profiling of natural persons) — invariant + `.claude/rules/ai-act.md` | P1 | ★★★★ | S | — | **done** |

---

## Part 6 — Open decisions for you

1. **Cloudflare EU residency / DPA** — the architecture is **decided** (Option 2, ADR 0015). The
   residual action is to **sign Cloudflare's EU DPA + SCCs** and confirm the Node-PaaS EU region
   before go-live.
2. **LLM hosting** (Phase 4) — Workers AI vs external EU GPU vs (still) local. Keep the
   OpenAI-compatible abstraction so it's a base-URL swap.
3. **Transactional email** — EU provider (Postmark EU / SES eu-* / Scaleway TEM) vs Cloudflare
   Email Workers. Decide before Phase 3.
4. **PEPPOL access point & Altinn onboarding model** — Phase 9; providers still open.
5. **Product name** — "Saldo" is a working name; decide keep vs rename before public launch.

---

## Sources (Cloudflare/Neon, fetched 2026-06-23)

- React Router on Cloudflare Workers — https://developers.cloudflare.com/workers/framework-guides/web-apps/react-router/
- Full-stack on Workers — https://blog.cloudflare.com/full-stack-development-on-cloudflare-workers/
- Neon + Workers — https://developers.cloudflare.com/workers/databases/third-party-integrations/neon/
- Neon + Hyperdrive — https://neon.com/docs/guides/cloudflare-hyperdrive
- D1 EU jurisdiction — https://developers.cloudflare.com/changelog/post/2025-11-05-d1-jurisdiction/
- Workflows (durable execution, cron) — https://developers.cloudflare.com/changelog/post/2026-06-02-cron-workflows/
- Cron Triggers — https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/
