# Repo Consistency Audit — Saldo

**Date:** 2026-06-23 · **Scope:** entire repository, both branches · **Type:** read-only editorial/consistency review (no files changed except this report).

Measured against the standard set by `AGENTS.md`, `CLAUDE.md`, and `.claude/rules/engineering-discipline.md` — in particular **"state a fact once; link, don't restate"**, the canonical-source map, neutral documentation voice, and source-grounded (cited, dated) regulatory facts.

---

## 1. Method & branch scope

- **Branches.** Two exist: `main` and the working branch `claude/lucid-cannon-a10gvi`. The working branch is a **strict superset** of `main` (`git log lucid-cannon..main` is empty; `main` sits at PR #10 / `9c30903`, the branch carries PRs #11–#19 on top). There is **no divergent content on `main`** to audit separately — everything below is on the working branch. Note: the squash-merge commit subjects reference PRs #11–#19 that are not actually on `main`; in this sandbox `main` is simply behind.
- **Coverage.** Every tracked Markdown file (110), every ADR (30), the `.claude/` harness (rules, skills, agents, scripts, settings), `db/reference/**`, config/CI, and `tools/` were read. The few unassigned READMEs (`apps/web/app/**/README.md`, `infra/deploy/README.md`) were read directly.

---

## 2. The headline

The repo is **well-built and largely internally consistent** — dates are uniform, ADR cross-references all resolve, the toolchain config is coherent, CI is SHA-pinned, and the regulatory prose is genuinely neutral. The problems are concentrated and systemic rather than scattered bugs:

1. **"State a fact once" is violated pervasively** — volatile facts (counts, invariants, the quality bar, the stack, regulatory rates) are *restated* across many docs instead of *linked*, so they rot. This is the single biggest theme and the root cause of most staleness below.
2. **Staleness from landed work** — several docs still describe a pre-decision world (deploy = Kamal/Hetzner; React 18; "shadcn not implemented"; the build-spec dir tree/inlined configs; STATUS's branch/HEAD).
3. **Non-neutral voice** — second-person "you chose…/you prize…" (heaviest in `roadmap.md`) and editorial "we/our" (pervasive in ADRs, seeded by the template).
4. **Dead links & ungrounded citations** — four integration docs are linked but absent; several `verify-by` dates sit over empty `db/reference/` capture dirs.
5. **Structural drift** — inconsistent status banners, provenance filenames, and skill section-structure.

The irony worth stating plainly: **`docs/STATUS.md` is itself the prime exhibit** of theme 1 — and its own "Next session" brief already diagnoses exactly this disease (it charters `tools/status-block.mjs` to mechanically derive the volatile facts). That tool does not exist yet, so the drift is live today.

---

## 3. Cross-cutting themes (the spine)

### Theme A — Restated facts that will rot (violates "state a fact once; link, don't restate")

| Restated fact | Canonical home | Restated in (file:line) |
|---|---|---|
| Hard invariants (øre, append-only, MVA statuses…) | `AGENTS.md` + `.claude/rules/` | `docs/domain-model.md:7-17`; `docs/saldo-build-specification.md:122-130` (§4.2); `.claude/rules/money.md:5-7`; `.claude/rules/vat.md:7-9`; `.claude/rules/integrations.md:7-11` → **invariants triplicated+** |
| The quality bar / Definition of Done | `docs/quality-bar.md` | `docs/house-standards.md:51-53` (§3a) + `:55-59` (§4); `AGENTS.md` "Quality bar" restates the DoD prose |
| "Not acceptable" list (any/raw money/hardcoded VAT) | `AGENTS.md` invariants | `docs/quality-bar.md:40-45` |
| The stack (vendors, versions) | `docs/tech-stack.md` | `docs/architecture.md:11,16,20`; whole `docs/saldo-build-specification.md` §6 (217-269) |
| The harness model (single-agent, build order, hooks) | `docs/house-standards.md` + `AGENTS.md` | `docs/tech-stack.md:53-67`; `docs/saldo-build-specification.md` §15 (466-588) |
| ENK tax rates (22% split, 114 540 personfradrag, trygde 10,8/99 650/25%) | `docs/regulatory/skatt-enk-personskatt.md:17-34` | `docs/STATUS.md:76-80` |
| `unntatt`/`fritatt` definition | build-spec glossary §3 | `docs/regulatory/mva-sektorunntak.md:25` + `mva-kunstneriske-tjenester.md:15-16` (3 places) |
| EU-LLM-residency ("hosted only if EU, else local") | `.claude/rules/data-handling.md:11-12` | `.claude/rules/ai-act.md`, `.claude/rules/integrations.md:11`, `.claude/agents/privacy-reviewer.md:8` (4 places) |
| Gapless invoice-counter mechanism | `.claude/rules/ledger-integrity.md:18-20` | `.claude/agents/migration-author.md:12-13`; `add-migration` skill:14 (3 places) |
| ADR summaries (status, supersession, scope) | each ADR + the README table | `docs/decisions/README.md:39-53` (prose paragraph re-narrates all 30) |
| Volatile counts (158 domain/23 web/34 integ tests; 61/9/0 lint; 47 tasks; "ADRs 0001–0030") | git / `pnpm test` / `tasks.json` / `decisions/README.md` | `docs/STATUS.md:107,256-261,275` |

**Fix pattern:** keep one home; everywhere else, replace the restatement with a one-line pointer. For the volatile counts specifically, land the already-specified `tools/status-block.mjs` AUTOGEN block (STATUS "Next session" brief).

### Theme B — Stale information from work that already landed

- `infra/deploy/README.md:3-4,9` — **most stale file in the repo.** Describes "Docker + Kamal on Hetzner EU (**ADR 0008**)" with "self-hosted PostgreSQL, MinIO/Garage, Langfuse" and "Fly.io EU is an acceptable… shortcut." **ADR 0015 superseded this** (persistent Node on an EU PaaS + Cloudflare edge/R2 + Neon EU). The deploy README was never updated. → Rewrite around ADR 0015; cite 0015 not 0008.
- `docs/roadmap.md` — labelled "**living**" (line 2) but also "**point-in-time plan that produced P0**" (line 11): contradictory. Its Part 2 P0 PRs (141-224) and Part 4 "24 contradictions" (274-292) are all rendered as **unchecked `[ ]` boxes** though STATUS + roadmap:8 say "Part 2 … COMPLETE." Part 1 table is stale too: "React 18.3 → **Upgrade → 19**" (117) and "shadcn… **Currently documented, not implemented**" (116) — both have since landed. → Either freeze it as a dated historical artifact (drop "living", check the boxes / mark "landed") or move live status to STATUS.
- `docs/STATUS.md:7,297` — branch `claude/practical-edison-20f9p6` (actual: `claude/lucid-cannon-a10gvi`); `:254` HEAD `cfbe475` (actual: `51db95e`). STATUS says "trust git over any hash here," but the stale strings still mislead. → Drop the literal branch/HEAD from the body.
- `docs/saldo-build-specification.md` §14 dir tree + §15 inlined configs — see Theme A and §4 below; the tree does not match the repo at all.
- `docs/house-standards.md:65` — "Last updated: **2026-06-22**" while 0029/0030 + new skills landed 06-23; its skills list (`:42-45`) is 6 of 10. 
- `apps/web/app/integrations/README.md:6` — "**Planned:** `enhetsregisteret/` …" but that integration is now built (`app/integrations/enhetsregisteret/` exists). → Move enhetsregisteret out of "Planned".
- `docs/STATUS.md:35,38,47` — `pnpm status:refresh` / `status:check` written as runnable steps, but **no such scripts exist** (and `tools/status-block.mjs` doesn't exist yet). Keep them inside the clearly-future "Next session" block only.
- CI-pipeline description drift — `docs/runbook.md:44` and `docs/quality-bar.md:37` both describe a CI step order that no longer matches `.github/workflows/ci.yml`: `audit` actually runs **first** (omitted from both); quality-bar invents a non-existent `migrate` stage; runbook omits `audit`/`backlog validate`/`db:migrate`/`db:introspect` and swaps `test`/`db:lint`. → Align to the real order or soften to "roughly."

### Theme C — Non-neutral / second-person voice (the "You chose.." problem)

**`docs/roadmap.md` — heaviest:** `:35` "You chose **Cloudflare over Fly.io**", `:51` "choosing Cloudflare costs **you** none of the ledger work", `:72` "**you must pick one**", `:75` "**you** run PG, MinIO…", `:76` "(**your** lean)", `:145` "(**Your** chosen hybrid…)", `:191-192` "invariants **you prize** … per **your** discipline", `:218` "delete any **you** won't use", `:248` "when **you** want CI babysat", `:318` "## Part 6 — Open decisions **for you**".

**ADRs — pervasive editorial "we/our/us" (≈28 instances), seeded by the template** (`adr-template.md:13` "what **we** accept"): e.g. `0006:19`, `0008:31`, `0010:17-18`, `0011:7`, `0013:9,21`, `0018:9`, `0019:13`, `0020:8`, `0022:9,17,25,27,29,35` (cluster), `0024:13`, `0026:46`, `0028:9,11`, `0029:12`, `0030:13,16`, `README.md:53`. → Neutralize the template first, then sweep.

**Other:** `docs/tech-stack.md:7-11,49-51` ("**we accept**", "**we mitigate**", "pull the rug"), `:64` ("anything **you'll** review"); `docs/saldo-build-specification.md:59` ("**you've** outgrown Saldo"), `:223,237` ("**we** offset…"), `:363` ("teach as **you** go"); `SECURITY.md:8` ("**We** aim to acknowledge"); `docs/runbooks/neon-provisioning.md:6,23,57` ("**you** do once", "**your** own machine"); `infra/deploy/README.md:9` ("if **you want** managed hosting"); `apps/web/app/jobs/README.md:3` ("**our** PostgreSQL"); `docs/backlog/README.md:24,36` ("buys **you**", "When **you** abandon").

**Not violations (deliberate, leave as-is):** `docs/experience-principles.md` and `.claude/rules/experience-voice.md` use "I"/"you" as the **product's voice** (how the app speaks to the user) — that is spec, not authorial voice. Agent role-prompts in `.claude/agents/*` open "You are a…" by design.

### Theme D — Dead links & ungrounded citations

- **Missing integration docs (4)** — `docs/integrations/README.md:12-16` links `banking-gocardless.md`, `peppol.md`, `skatteetaten-mva.md`, `altinn.md`; **none exist**. `altinn.md` is also linked from `bankid-criipto.md:9`, and the GoCardless limits page is cited from `.claude/rules/integrations.md` (the "~4 calls/day" fact has no backing page). Only the Vipps row honestly marks itself "(TBD)". → Create stubs or mark "(TBD)" uniformly.
- **`verify-by` over empty captures** — `docs/regulatory/mva-registration-threshold.md:23-24` cites `db/reference/mva/` (a directory) for the 50 000/140 000 thresholds, which are **not committed** ("commit the lovdata text"); `bankid-criipto.md:17` cites the **empty** `db/reference/auth/`; `llm-extraction.md:14-16` cites the **empty** `db/reference/llm/`. These are "cited, dated" in form but memory-grounded in fact — the one place the source-grounding discipline isn't yet honored. → Capture the primaries or drop the `verify-by` until they land.
- `docs/regulatory/mva-rates.md:15` — "Reduced rate, raw fish **11.11 %**" is **not in any committed capture** (the HTML has only 25/15/12 %). The page flags it for re-confirmation, so it's disclosed, but currently memory-grounded.

### Theme E — Structural inconsistency

- **Status banners** — `docs/tech-stack.md:3` has the model `> Status: Current (date)` banner; `experience-principles.md` and `saldo-build-specification.md` use ad-hoc revision blockquotes; `architecture.md`, `overview.md`, `domain-model.md`, `glossary.md` have **no banner at all**. → Adopt one banner format across narrative docs.
- **Provenance files in `db/reference/`** — provenance lives in `SOURCE.md` for `eu-ai-act/`, `mva/`, `skatt/` but in `README.md` for `brreg/`, `saf-t/` (saf-t has both), `auth/`, `llm/`. `verify-by` is present in `saf-t`/`brreg` provenance, absent from `mva`/`skatt`/`eu-ai-act`. `saf-t/SOURCE.md` (pins upstream commit + date) is the gold standard. → Standardize on `SOURCE.md` + a `verify-by` line everywhere.
- **Skills section-structure** — `house-standards.md:29-31` says every load-bearing skill ends with a Rationalizations table + "Red flags — STOP" + "Done means (evidence required)". Reality: all three present in only **3 of 10** (`add-migration`, `new-feature`, `new-vat-scenario`); `regulatory-update`/`saft-validate` lack Rationalizations; `new-adr` has only Red-flags; `backlog`/`design-review`/`handover`/`html-report` have none. The standard also names two *different* "load-bearing" sets (`:27` vs `:29`). → Enumerate the load-bearing set, then make them conform.
- `docs/regulatory/mva-registration-threshold.md:26` — a `⚠️` emoji callout; the rest of the regulatory set doesn't use callouts, and it trips the project's "avoid emojis" guidance.
- `docs/decisions/0022-eu-ai-act-posture.md:34` — the only ADR with an extra `## Relationship to ADR 0002` section beyond the template. → Fold in, or add the section to the template.
- `docs/regulatory/README.md:19` — `verify-by` column says "see page" for one row while every other row gives a literal `2026-12-31`.

### Theme F — Genuine factual issues to verify (correctness risk, not just style)

1. **`Bokføringsplikt` defined with the wrong threshold.** `docs/glossary.md:9` (and `saldo-build-specification.md:70`) define *Bokføringsplikt* as "above 50,000 NOK turnover" — but **50 000 is the VAT-registration threshold**, not the bookkeeping-obligation trigger. The two are conflated in both files. → Correct against a cited source.
2. **LLM-default contradiction.** `docs/architecture.md:27` presents local Qwen2.5-VL as the default (hosted optional); `saldo-build-specification.md` §6.6 frames it as hosted Anthropic vs self-hosted Qwen. → Align all three (tech-stack should own it).
3. **Possible wrong-ADR citation.** `apps/web/app/auth/README.md:4` cites "**ADR 0008**" for the Criipto/Signicat BankID broker; ADR 0008 is "open-source & self-hostable", not the broker decision. → Verify the intended ADR (likely 0020).
4. **Local-DB bootstrap diverges.** `docs/runbook.md:11` says local Postgres comes from `docker compose -f infra/compose.yaml up -d`; `docs/runbooks/neon-provisioning.md:58` says "the environment setup script." → State one canonical bootstrap.

### Theme G — The two status vocabularies (decide & document; don't mass-rename)

There are genuinely **two** status systems, and they're being conflated:

- **ADR Status field:** `Proposed | Accepted | Superseded` — the conventional ADR vocabulary. The template (`adr-template.md:3`), all 30 ADRs, and the README table use it **consistently**.
- **Tech-stack / roadmap item status:** `Current | Intended | Superseded` — introduced (`roadmap.md:13`) to replace the banned word "Locked".

The defect is **not** that 30 ADRs are mislabelled. It's that the harness *describes the ADR vocabulary wrongly*: `.claude/skills/new-adr/SKILL.md:27` and `tools/repo-lint.mjs:4,93` both claim the ADR vocabulary is "Current/Intended/Superseded" — yet the same skill (step 3) tells you to set `Accepted`, and the lint only bans the literal "Locked" (it never enforces the trio it names). → **Cheap fix:** correct those two harness descriptions to `Proposed | Accepted | Superseded`. Keep the `Current/Intended/Superseded` vocabulary scoped to tech-stack/roadmap, and say so. Do **not** relabel the ADR corpus.

---

## 4. Per-area detailed findings

### 4.1 `docs/decisions/` (ADRs)
- `[CONTRADICTION] adr-template.md:3` vs `roadmap.md:13` — template Status enum `Proposed|Accepted|Superseded` vs the roadmap's `Current|Intended|Superseded`. See Theme G — fix the harness descriptions, keep the template.
- `[LANGUAGE] adr-template.md:13` — "what **we** accept as a known cost" — seeds editorial "we" into every ADR. Neutralize.
- `[REDUNDANT] README.md:39-53` — the prose paragraph re-narrates every ADR's status/supersession/scope (duplicates the table + each ADR). Reduce to a pointer.
- `[STRUCTURE] supersession asymmetry` — later ADRs point back but earlier ones rarely point forward: `0002` has no forward ref to `0022`/`0025`/`0028`; `0022` no forward ref to `0028`; `0027` no forward ref to `0030`. (`0008→0015/0023` is correctly symmetric — use it as the model.) The lint checks only that refs *resolve*, never reciprocity.
- `[STRUCTURE] 0022:34` — extra `## Relationship to ADR 0002` section (only ADR to diverge from the template).
- `[LANGUAGE]` editorial "we/our" cluster — see Theme C for the per-ADR line list.
- **Clean:** all 30 dates present, `YYYY-MM-DD`, plausible; all `ADR NNNN` refs resolve; template section order otherwise uniform; `rejected.md` R-IDs all resolve.

### 4.2 Core narrative docs
- **`saldo-build-specification.md`** — the largest concentration of stale duplication:
  - `[STALE] §14 dir tree (409-460)` — wrong roots (`app/` vs `apps/web/app/`; `packages/domain/*` vs `packages/domain/src/*`), under-counts `.claude/` (5/12 rules, 5/7 agents, 4/10 skills), omits `db/reference/`, `tools/`, `AGENTS.md`, and most of `docs/`. CLAUDE.md described as "~300–400 tokens" though it now imports AGENTS.md.
  - `[DUPLICATE] §15 (466-588)` — inlines full copies of `CLAUDE.md`, `.claude/rules/money.md`, `.claude/agents/vat-reviewer.md`, `.claude/settings.json`, and `.mcp.json` — all already stale vs the live files (e.g. the inlined `.mcp.json` lists a `neon` stdio server and omits the real `postgres` server).
  - `[REDUNDANT] §6 (217-269)` — restates the whole stack that `tech-stack.md` owns; `[DUPLICATE] §4.2 (122-130)` — third copy of the hard invariants; `[CONTRADICTION] §17 (633-646)` — local decision-numbering 1–14 collides with ADR 0001–0030.
  - `[LANGUAGE] :59,223,237,363` — second-person / "we".
  - `[STRUCTURE] :5-9` — three stacked revision blockquotes instead of one banner.
- **`domain-model.md`** — `[DUPLICATE] 7-17` invariants; `[REDUNDANT] 14` MVA-status enum, `29-32` 50k threshold; `[OTHER] 1` no banner.
- **`glossary.md`** — `[CONTRADICTION] 9` Bokføringsplikt/50k (Theme F); `[DUPLICATE] 6-24` subset of spec §3; `[OTHER] 1` no banner.
- **`architecture.md`** — `[REDUNDANT] 11,16,20` restates hosting/DB/storage vendors; `[CONTRADICTION] 27` LLM default vs spec; `[OTHER] 1` no banner.
- **`overview.md`** — `[REDUNDANT] 9` duplicates spec §1 prose; `[OTHER] 1` no banner. (`:18` is a good linking model.)
- **`tech-stack.md`** — `[LANGUAGE] 7-11,49-51,64`; `[REDUNDANT] 53-67` restates the harness model. (`:3` banner is the model to copy.)
- **`experience-principles.md`** — `[STRUCTURE] 1-6` H1+H3 + "Where this sits" blockquote instead of a status banner. Voice is product-voice (not a violation).

### 4.3 `docs/STATUS.md`
- `[STALE] 7,297` branch; `[STALE] 254` HEAD; `[STALE] 256-261` restated counts; `[REDUNDANT] 261` "ADRs 0001–0030"; `[DUPLICATE] 76-80` ENK tax facts (home: `skatt-enk-personskatt.md`); `[STALE] 35,38,47` `status:refresh`/`status:check` presented as runnable.
- `[REDUNDANT] 132-252` — ~120 lines of per-session history duplicate `git log` + the ADRs, despite the file's own rule (`:285`, "detail in git log + ADRs, not duplicated here") — which is then immediately followed by a Phase-0 summary (`:286-294`) that does duplicate it.
- This file is the central case of Theme A; its own "Next session" brief is the right fix.

### 4.4 Process / quality / root docs
- `[CONTRADICTION] runbook.md:44` & `quality-bar.md:37` — CI order drift (Theme B).
- `[CONTRADICTION] quality-bar.md:9` vs `CONTRIBUTING.md:16` vs CI vs `AGENTS.md` — audit invocation: `pnpm audit` vs `--audit-level=high` (CI uses high). Standardize on `--audit-level=high`.
- `[REDUNDANT] house-standards.md:51-53,55-59` & `quality-bar.md:40-45` & `AGENTS.md` "Quality bar" — restated DoD/invariants. `CONTRIBUTING.md:19-22` models the correct "link, don't restate" pattern.
- `[STALE] house-standards.md:42-45,65` — skills list 6/10 + stale date; `[CONTRADICTION] :9` migration naming "`<verb-noun>`" vs actual `snake_case` (`core_ledger`).
- `[LANGUAGE] SECURITY.md:8` "We aim"; `[STALE] SECURITY.md:26` confirm Dependabot is wired (it is — `.github/dependabot.yml` exists) before the present-tense claim. SECURITY's Current/Intended labelling (`:22-29`) is otherwise the model to follow.
- `[LANGUAGE] runbooks/neon-provisioning.md:6,23,57`; `[STALE] runbook.md:22` `format` vs `format:check`.
- `[REDUNDANT] backlog/README.md` voice `:24,36` (Theme C).

### 4.5 Regulatory / integrations / `db/reference`
- `[DEADLINK]` four missing integration docs + `altinn.md` inbound link (Theme D).
- `[DEADLINK]` `mva-registration-threshold.md:23-24,26`, `bankid-criipto.md:17`, `llm-extraction.md:14-16` — `verify-by` over empty/uncommitted captures (Theme D).
- `[STALE] enhetsregisteret.md:20` — Sources say "capture the …" though `db/reference/brreg/` is already populated; cite the committed fixtures.
- `[DUPLICATE] STATUS.md:76-80` ENK facts; `[REDUNDANT]` `unntatt/fritatt` in 3 places.
- `[STRUCTURE]` provenance filename + `verify-by` drift across `db/reference/`; `mva-rates.md:15` 11.11 % ungrounded; `regulatory/README.md:19` "see page".
- **Clean:** no `verify-by` date is in the past; date format uniform; regulatory prose voice is neutral; eu-ai-act citations all resolve to the committed capture.

### 4.6 `.claude/` harness
- `[CONTRADICTION] new-adr/SKILL.md:27` & `repo-lint.mjs:4,93` — ADR vocabulary mis-described (Theme G).
- `[STALE] settings.json:19` — gates raw `dbmate down`, but the repo exposes `pnpm db:rollback`; `[OTHER] :6` omits `pnpm db:lint` from the allow-list (prompts every run); `:19` `pnpm deploy:*` guards a non-existent script.
- `[REDUNDANT]` invariants restated in `money.md:5-7`, `vat.md:7-9`, `integrations.md:7-11`, `ai-act.md:8-9,28-33`; EU-LLM-residency duplicated across 4 files; gapless-counter in 3 files (Theme A).
- `[DEADLINK] integrations.md` — GoCardless limits cite the missing `banking-gocardless.md`.
- `[STRUCTURE] house-standards.md:27-31,44` — load-bearing-skill ambiguity + 6/10 inventory + 3/10 conformance (Theme E).
- `[STALE] pwa-native.md:7-8` — self-flagged "dirs don't exist yet" note left standing in the rule.
- `[LANGUAGE] design-system.md:13,21` — mild brand-ish phrasing ("carnival", "vibrant"); defensible (ADR 0025) but lean.
- **Clean & confirmed current:** `integrations.md:10` `openid-client` v6 + `@oslojs/*` matches `package.json` (6.8.4 / 1.0.1 / 1.1.0) — **not** the stale `oslo` the roadmap once flagged; all ADR refs resolve; the 4 `saldo/*` eslint rules exist and are wired; no "world-class-roadmap" references remain.

### 4.7 Config / CI / tools
- **Clean:** all GitHub Actions SHA-pinned (confirms roadmap PR3); every workflow script resolves; Node 22 / pnpm 9 consistent across `.nvmrc`/`engines`/`packageManager`/AGENTS.md/CI; prettier vs editorconfig non-conflicting; Markdown is intentionally outside prettier's `--check` (`.prettierignore:9`).
- **`dbmate` is genuinely the migration runner** end-to-end (`package.json` `db:migrate`/`db:migrate:new`/`db:rollback`, CI, `squawk.toml`, all four migration files) — every doc agrees. **No drift here** (a prior worry that docs say dbmate but reality differs is unfounded — reality *is* dbmate).
- `[OTHER] tools/status-block.mjs`, `status:refresh`, `status:check` — do not exist (correctly future work, but STATUS phrases them as runnable; see 4.3).
- `[OTHER] .mcp.json` ships `neon` in addition to the `postgres`/`context7`/`brreg` that `house-standards.md:17` calls the "preferred" minimal set — add `neon` to that list or note it's control-plane-only.
- `[MISSING] .env.example` — agent-denied (can't diff here); STATUS self-reports it lags `env.ts` (needs `APP_URL`, optional `OIDC_*`, and `LOG_LEVEL` which the logger reads but the Zod schema omits). A human must reconcile by hand.

### 4.8 App / infra READMEs
- `[STALE/CONTRADICTION/LANGUAGE] infra/deploy/README.md:3-4,9` — pre-ADR-0015 deploy model + "if you want" voice (Theme B; most stale file).
- `[STALE] apps/web/app/integrations/README.md:6` — enhetsregisteret listed "Planned" though built.
- `[LANGUAGE] apps/web/app/jobs/README.md:3` — "our PostgreSQL".
- `[VERIFY] apps/web/app/auth/README.md:4` — "ADR 0008" for the Criipto broker (likely wrong ADR; Theme F). The rest of this README is accurate and current (ADR 0020, argon2id, OIDC "not live-verified").
- `apps/web/app/components/README.md` — clean.

---

## 5. Prioritized remediation plan

**P0 — correctness / actively misleading**
1. Fix the `Bokføringsplikt`/50 000 conflation in `glossary.md:9` + `saldo-build-specification.md:70` against a cited source (Theme F-1).
2. Rewrite `infra/deploy/README.md` around ADR 0015 (Theme B).
3. Resolve the LLM-default contradiction and the `auth/README.md` ADR-0008 citation (Theme F-2/3).
4. Correct the CI-order descriptions in `runbook.md`/`quality-bar.md` (Theme B).

**P1 — staleness & dead links**
5. Land `tools/status-block.mjs` + the AUTOGEN block; strip restated counts/branch/HEAD from `STATUS.md` (Themes A/B). This is already specified in STATUS's own brief.
6. Create the four missing integration docs (or mark "(TBD)") and capture the ungrounded primaries behind the `verify-by` dates (Theme D).
7. Reconcile `roadmap.md`'s "living vs point-in-time" identity and stale Part 1/Part 2 state (Theme B).
8. Refresh `house-standards.md` skills list/date and define the load-bearing set (Theme E).

**P2 — "state a fact once" sweep & voice**
9. Replace restatements with pointers per the Theme A table (invariants, quality bar, stack, harness, ENK rates, EU-LLM-residency, gapless-counter, the README ADR prose).
10. Neutralize voice: `adr-template.md:13` first (kills the "we" at the source), then `roadmap.md`'s "you chose…", then the tech-stack/spec/SECURITY/neon-provisioning/deploy instances (Theme C).
11. Standardize status banners and `db/reference/` provenance files (Theme E).
12. Correct the ADR-vocabulary descriptions in `new-adr/SKILL.md` + `repo-lint.mjs`; document the two-vocabulary scope (Theme G).

**Make recurrence mechanical (the project's own preference: "a gate over a reminder")**
- Extend `repo-lint.mjs`: assert every linked `docs/integrations/*.md` / `db/reference/<dir>` cited by a page exists; flag second-person `\byou\b`/"you chose" and authorial "we/our" in `docs/**` (allow-list `experience-*`); check supersession reciprocity; enforce a status banner on narrative docs.

---

## 6. What is clean (so effort isn't spent here)

dbmate consistency · all ADR cross-refs resolve · ADR dates · CI SHA-pinning · Node/pnpm/prettier/editorconfig coherence · `integrations.md` oslo→@oslojs/v6 currency · regulatory prose voice · no past `verify-by` dates · eslint-plugin-saldo wiring · LICENSE (correct product/entity/year) · `main` has no unique content to audit.
