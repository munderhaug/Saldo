# EU AI Act — Saldo's classification, obligations, and timeline

Saldo's source-grounded analysis of **Regulation (EU) 2024/1689** (the "Artificial Intelligence
Act"). Every claim cites an article, annex point, or recital; the verbatim text is captured under
`db/reference/eu-ai-act/`. The compliance **posture** is recorded in ADR 0022; the **work** is
tracked in the backlog (`docs/backlog/tasks.json`, the `aia-*` tasks).

> **Bottom line.** Only Saldo's **LLM features** are AI systems under the Act; the deterministic
> ledger/rules core is out of scope (Art. 3(1), Recital 12). Saldo is **not** prohibited (Art. 5)
> and **not** high-risk (Art. 6 + Annex III). The one binding obligation is **transparency**
> (Art. 50), applicable **2 Aug 2026**, plus **AI literacy** (Art. 4), already in force. Saldo is a
> **provider** of its AI system and a **deployer** of the underlying model; it is **not** a GPAI
> provider and relies on the model provider's documentation (Art. 53).

## 1. Scope — which Saldo components are even "AI systems"

The Act binds **providers** placing AI systems on the Union market and **deployers** located in the
Union, and reaches third-country providers/deployers whose AI **output is used in the Union**
(Art. 2(1)(a)–(c)). It is **EEA-relevant** and under scrutiny for incorporation into the EEA
Agreement (see §7).

An **"AI system"** is "a machine-based system … that … **infers**, from the input it receives, how
to generate outputs such as predictions, content, recommendations, or decisions" (Art. 3(1)).
Recital 12 narrows this deliberately: the definition "should **not** cover systems that are based on
the rules defined **solely by natural persons** to automatically execute operations"; the
distinguishing characteristic is "their **capability to infer** … beyond basic data processing".

This draws a clean boundary through Saldo:

| Saldo component | AI system? | Why (cited) |
|---|---|---|
| `@saldo/domain` — money, VAT, posting, the **rules engine** | **No** | Deterministic rules defined by humans, executed without inference — Recital 12 explicitly excludes these. |
| SQL integrity (triggers, RLS, gapless counter) | **No** | Database logic; no inference (Recital 12). |
| **Receipt OCR / extraction** (image → fields) | **Yes** | Machine-based, infers outputs from input (Art. 3(1)). |
| **AI categorisation / AI-proposed entries** | **Yes** | Infers a proposal (a recommendation) from input (Art. 3(1)). |

**Only the LLM-driven features are in scope.** The accounting correctness core — the part Saldo
guards hardest — is not an AI system and carries no AI Act obligation. This boundary is itself a
compliance asset: it keeps the regulated surface small and the ledger demonstrably deterministic.

## 2. Prohibited practices (Art. 5) — none apply

Article 5(1) prohibits eight practices: (a) subliminal/manipulative techniques; (b) exploiting
vulnerabilities (age/disability/economic situation); (c) social scoring; (d) profiling-based
predictive policing; (e) untargeted facial-image scraping; (f) emotion inference in
workplace/education; (g) sensitive-trait biometric categorisation; (h) real-time remote biometric
identification for law enforcement. **None is present or contemplated in Saldo** — it extracts and
categorises a sole proprietor's own financial documents. Confirmed clear against Art. 5(1)(a)–(h).

## 3. High-risk (Art. 6 + Annex III) — Saldo is not high-risk

Two routes to high-risk:

- **Art. 6(1)** — a safety component of a product under the Annex I harmonisation legislation. **N/A**
  (Saldo is not a regulated physical/product-safety component).
- **Art. 6(2) + Annex III** — one of eight listed areas. Saldo touches **none**: not biometrics (1),
  critical infrastructure (2), education (3), employment (4), law enforcement (6), migration (7), or
  justice/democracy (8).

**The one item to watch — Annex III(5)(b), creditworthiness.** Area 5 ("essential private and
public services") lists "AI systems intended to be used to **evaluate the creditworthiness of
natural persons or establish their credit score**, with the exception of … detecting financial
fraud" (Annex III(5)(b)). Saldo's planned **honest-number / estimated-tax** feature computes the
**user's own** spendable balance (income − VAT held − estimated tax) from **their own** posted
ledger. It does **not** evaluate the creditworthiness of a natural person, nor establish a credit
score about anyone — so it falls **outside** 5(b). (Insurance pricing, 5(c), is likewise N/A.)

**The line never to cross (durable invariant — see §9, AGENTS.md, ADR 0022):** an AI feature that
**scores a natural person's creditworthiness** — e.g. ranking a *customer* before extending credit
terms — would land squarely in Annex III(5)(b) and make Saldo a **high-risk provider**. And under
Art. 6(3), even tasks that might otherwise qualify for the "no significant risk" derogation (narrow
procedural / improving completed human work / preparatory) are "**always** … high-risk where the AI
system performs **profiling of natural persons**" (Art. 6(3) final subparagraph). So: **AI must
never score or profile a natural person.** The honest-number is the user's own arithmetic, not
profiling, and stays clear.

## 4. Transparency (Art. 50) — the one obligation that bites

Article 50 is Saldo's **principal** AI Act obligation, applicable from **2 Aug 2026**:

- **Art. 50(1) — disclose the AI interaction.** A provider must ensure that an AI system "intended to
  interact directly with natural persons" tells them they are interacting with AI, unless that is
  "obvious from the point of view of a natural person who is reasonably well-informed". → Saldo's AI
  features must **disclose AI involvement in the UI** at first interaction.
- **Art. 50(2) — mark AI-generated content.** A provider of an AI system "generating synthetic …
  text content" must mark outputs as artificially generated, in a machine-readable, detectable form
  (subject to feasibility/cost). → Saldo must **label AI-proposed values as "AI-assisted"** and carry
  machine-readable provenance.

Saldo's outputs are **private to the user's own books**, so the **deployer** duties in Art. 50(3)
(emotion/biometric) and Art. 50(4) (deep fakes; AI-generated text *published to inform the public on
matters of public interest*) **do not apply**. Disclosure must be "clear and distinguishable at the
latest at the time of the first interaction or exposure" (Art. 50(5)).

This dovetails with Saldo's existing posture (ADR 0002): AI **proposes**, the rules engine
**validates**, a human **confirms**. Art. 50 adds two requirements on top of that model — *disclose*
the AI, and *mark* its output — both of which reinforce the propose-only design rather than
challenge it.

## 5. Roles — provider, deployer, and the GPAI chain

- **Saldo is the provider of its AI system.** It develops the receipt-extraction / AI-proposal
  feature and puts it into service under its own name (Art. 3(3)). Its Art. 50 duties flow from this.
- **Saldo is also a deployer** of the underlying model — it uses the model under its own authority
  (Art. 3(4)).
- **The underlying LLM is a general-purpose AI model** with its **own provider** (Art. 3(63)) — e.g.
  the maker of Qwen2.5-VL, or a hosted endpoint (ADR 0009). That GPAI provider carries the **Art. 53**
  obligations (technical documentation; **downstream-integrator documentation per Annex XII**;
  copyright policy; training-content summary), in force since **2 Aug 2025**. **Saldo relies on that
  documentation; using a model does not make Saldo a GPAI provider.** A model under a genuine
  free/open-source licence narrows some of those upstream duties (Art. 53(2)) — relevant to the
  local-first default (ADR 0009) — but Saldo's reliance posture is the same: capture and keep the
  provider's docs.
- **Saldo does not become a high-risk provider** under Art. 25(1) unless it puts its name on a
  high-risk system, substantially modifies one, or **modifies an intended purpose so the system
  becomes high-risk** — which is exactly the mechanism a future credit-scoring feature (§3) would
  trip. Today, none of these apply.
- Saldo is **not** a provider of a GPAI model and **not** a systemic-risk GPAI provider (Art. 51), so
  the Chapter V provider/systemic-risk obligations do not bind it.

## 6. AI literacy (Art. 4) — already in force

Since **2 Feb 2025**, "providers and deployers of AI systems shall take measures to ensure, to their
best extent, a sufficient level of **AI literacy** of their staff and other persons dealing with the
operation and use of AI systems on their behalf" (Art. 4). For a solo ENK / small team this is a
**proportionate** duty: a short, dated competence note covering what the AI features do, their
limits, and the propose-only/confirm model — delivered as
[eu-ai-act-literacy.md](eu-ai-act-literacy.md) (2026-07-05).

## 7. Timeline (Art. 113) — now vs later

Entered into force **1 Aug 2024**. Staggered application (dates are absolute; snapshot **2026-06-23**):

| Date | What applies | Status for Saldo |
|---|---|---|
| **2 Feb 2025** | Chapter I + II → **Art. 4 AI literacy**, **Art. 5 prohibitions** (Art. 113(a)) | **In force now.** Literacy = proportionate measure; prohibitions = N/A. |
| **2 Aug 2025** | Chapter V **GPAI**, Chapter VII governance, Chapter XII penalties (exc. Art. 101), Art. 78 (Art. 113(b)) | **In force now.** Binds the **model provider** (Art. 53); Saldo relies on their docs. |
| **2 Aug 2026** | **General application** incl. **Art. 50 transparency** | **The binding near-term deadline (2 Aug 2026)** for Saldo's AI features. |
| **2 Aug 2027** | **Art. 6(1)** high-risk via Annex I product safety (Art. 113(c)) | **N/A** (Saldo not an Annex I product). |

**Norway / EEA.** The Act is **EEA-relevant** and **under scrutiny for incorporation** into the EEA
Agreement (Iceland, Liechtenstein, Norway); as captured it is **not yet** formally incorporated by an
EEA Joint Committee decision. The exact date it binds in Norwegian law, and the designated Norwegian
supervisory authority, follow that decision and national implementing legislation — **to be
re-confirmed** (see Sources). Regardless of EEA timing, Saldo is already in scope under Art. 2(1)(c)
for any AI **output used in the Union**, so the prudent posture is to **build to the EU dates above.**

## 8. Penalties (Art. 99) — the stakes

Art. 5 breaches: up to **€35M or 7%** of worldwide annual turnover (Art. 99(3)). Other obligations —
**including Art. 50 transparency** and provider/deployer duties: up to **€15M or 3%** (Art. 99(4)).
For SMEs/start-ups the fine is the **lower** of the cap or the percentage (Art. 99(6)). Saldo's
exposure is the 3% tier, avoided by the transparency work in §4/§9.

## 9. Mapping to Saldo work — repo vs product, now vs later

Saldo starts from a strong posture (AI never writes the ledger — ADR 0002; the rules engine is the
boundary; human confirmation is built in). Most of the work is **documenting/verifying the posture
and adding small gates**, not new features. Tracked in `docs/backlog/tasks.json` (the `aia-*` tasks);
posture in **ADR 0022**.

| # | Work | Repo / Product | When | Cite |
|---|---|---|---|---|
| AIA-1 | **AI-interaction disclosure** in the UI (tell users they're interacting with AI) | Product | with the first AI feature; by 2 Aug 2026 | Art. 50(1) |
| AIA-2 | **AI-output provenance**: every AI-proposed value labelled "AI-assisted" + logged with model/version/confidence | Product + repo | with the first AI feature | Art. 50(2) |
| AIA-3 | **Upstream GPAI documentation**: capture the chosen model's Annex XII docs under `db/reference/llm/` | Repo | at the Phase-4 LLM-hosting decision | Art. 53 |
| AIA-4 | **AI-literacy note** (proportionate competence record) | Governance | **delivered 2026-07-05** — [eu-ai-act-literacy.md](eu-ai-act-literacy.md) | Art. 4 |
| AIA-5 | **Conformity self-assessment checklist** re-run before each AI feature ships and at each Art. 113 milestone | Governance | **delivered 2026-07-05** — [eu-ai-act-conformity.md](eu-ai-act-conformity.md) (first run logged) → per release | Art. 5/6/50 |
| AIA-6 | **High-risk guard**: no AI feature scores/profiles a natural person (creditworthiness) | Repo (invariant + rule) | **delivered this PR**; revisit if AI scope expands | Annex III(5)(b), Art. 6(3) |

The durable invariant from AIA-2/AIA-6 is recorded in AGENTS.md and enforced at the point of change
by `.claude/rules/ai-act.md` (loads when LLM/AI code is touched). The **code-level** gate (a required
provenance field on every AI proposal; a lint check) lands **with** the AI feature — asserting it on
code that does not yet exist would be speculative.

## Sources

- European Parliament & Council, **Regulation (EU) 2024/1689** (Artificial Intelligence Act),
  13 June 2024, OJ L 2024/1689 (12 Jul 2024). Authoritative: eur-lex ELI
  `https://eur-lex.europa.eu/eli/reg/2024/1689/oj` / CELEX `32024R1689`. Articles cited: 2, 3, 4, 5,
  6, 25, 50, 51, 53, 99, 113; Annex III; Recital 12. Raw verbatim capture:
  `db/reference/eu-ai-act/2026-06-23-ai-act-key-provisions.md`. verify-by: 2026-12-31
- Per-article reproduction cross-checked: AI Act Explorer `https://artificialintelligenceact.eu/`
  and AI Act law portal `https://ai-act-law.eu/`. verify-by: 2026-12-31
- **EEA status:** EFTA EEA-Lex factsheet `32024R1689` `https://www.efta.int/eea-lex/32024r1689`
  (EEA-relevant; incorporation under scrutiny). Norwegian application date + supervisory authority
  **in flux** — re-confirm against EFTA / Lovdata. verify-by: 2026-09-30
