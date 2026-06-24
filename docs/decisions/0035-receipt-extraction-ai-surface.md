# ADR 0035 — Receipt extraction: the first AI-system surface (propose-only, provenance in the contract)

- **Status:** Accepted
- **Date:** 2026-06-24

## Context
With a working posting path (ADR 0034), the next high-value surface is `feat-receipt-extraction`
(spec §8.5): a user uploads a receipt/invoice image and a vision-LLM proposes a structured extraction
(supplier, date, net, VAT, direction) that becomes a voucher the human confirms. This is **Saldo's
first AI system** under the EU AI Act (Art. 3(1) — it infers outputs from input; the deterministic
ledger/rules core is *not* an AI system, Recital 12). It therefore carries the Act's obligations
(`docs/regulatory/eu-ai-act.md`, ADR 0022) and is the place where **code-level AI-Act enforcement
first lands** (`.claude/rules/ai-act.md`).

Settled questions: (1) how model access is abstracted and where data goes; (2) how the AI output is
disclosed and made machine-readable; (3) how a proposal reaches the ledger without the model ever
writing it; (4) what (if anything) is persisted.

## Decision
**A propose-only extraction surface: image → one OpenAI-compatible LLM call → Zod at the boundary →
the pure domain mapping → a proposal the human reviews/edits and explicitly confirms, which posts
through the EXISTING `recordManualVoucher` path. The model never writes the ledger. No schema change.**

- **One OpenAI-compatible client, local-first (ADR 0009).** `app/integrations/llm/client.server.ts`
  speaks the `/v1/chat/completions` vision wire format; the backend is config, not code
  (`LLM_BASE_URL`/`LLM_API_KEY`/`LLM_MODEL`, read lazily server-side). The default is a **local**
  Ollama/vLLM, so the shipped product makes **zero external LLM calls** out of the box. Unset config →
  the surface is cleanly **unavailable** (no external default), and the UI points to the manual path.
- **EU-resident, transient, never logged (data-handling).** Receipt images are personal data. They are
  processed **in the action and discarded** — **not persisted** (no R2/storage, no schema change) and
  **never logged**. Residency is a **mechanical, fail-closed gate**, not a reminder: an on-prem endpoint
  (loopback / RFC1918 / `.internal` / `.local`) is allowed, but any other host is enabled only when the
  operator explicitly sets `LLM_EU_RESIDENT=true`; otherwise the feature stays off rather than shipping
  image bytes off-box. Personal-data fields (`supplier`) are tagged `// personal` at the Zod boundary.
- **Propose → validate → confirm (ADR 0002).** The model's JSON is validated at the boundary
  (`llmExtractionFields`, amounts parsed to integer **øre** by the same `parseKroner` the manual
  surface uses — never float math); a pure `mapExtractionToProposal` (`@saldo/domain`) turns the
  direction into the everyday event (income/expense) and flags whether the document VAT looks like a
  plain 25 % — a **status-independent** sanity signal, so the org's VAT fork stays in `deriveStandard*`
  alone (one source of posting truth). The human confirms through the **same** `manualVoucherInput` +
  `recordManualVoucher`, so the AI path runs the identical rules-gate + SQL-integrity truth as a
  hand-entered voucher. A bad extraction (foreign currency, non-positive net) is rejected at the domain
  gate and **never reaches the ledger**.
- **Provenance is in the contract, not bolted on (Art. 50(2)).** `aiProvenance` — `aiAssisted` as a
  **literal `true`** plus model id / served version / confidence — is a required field of the
  extraction's Zod contract. An AI proposal that fails to disclose itself does not type-check or
  parse; a unit test pins this as the code-level gate. The UI **discloses the proposal as AI-assisted
  at the first interaction** (Art. 50(1)) — a plain, sober disclosure where the human stays in charge
  (experience-voice §5.5) — and shows the model + confidence.
- **Extraction only — never scoring or profiling (Annex III §5(b)).** The system prompt reads printed
  fields and explicitly does not assess any person; this keeps Saldo out of the high-risk
  creditworthiness/profiling area — the line never to cross.
- **Upstream model docs captured (Art. 53).** The OpenAI-compatible vision wire contract and the
  Qwen2.5-VL model card (Apache-2.0) are captured, dated, and cited under
  `db/reference/llm/` — reliance on the provider's documentation, not memory.

## Consequences
- The AI surface ships behind a config flag with the full propose-only chain tested: domain mapping
  (exhaustive + property), the boundary contract incl. the provenance gate, the LLM client (mocked,
  deterministic), and a Testcontainers **propose → validate → confirm** path that posts a balanced,
  posted voucher through `saldo_app` under RLS and proves the validate gate blocks a bad extraction.
- **No schema change** (mirrors ADR 0034): every table already exists; this is an app-layer +
  integration + a pure domain addition.
- **Sequenced, not lost.** (1) **Durable provenance logging** — persisting "this voucher was
  AI-proposed (model/version/confidence)" to a queryable record — is the dependent task
  `aia-provenance-logging`, paired with the structured-logging baseline (roadmap item 8); this PR
  delivers the *contract* + *first-interaction disclosure*, the in-flight halves of AIA-2, and the
  systematic transparency treatment is `aia-transparency-ui`. (2) The image is not stored, so there is
  no receipt-archive/thumbnail yet (a later storage feature). (3) Single net line, the org's standard
  rate, current-year period — same scope cuts as ADR 0034, since confirm reuses that path. (4) OCR
  fallback (Surya/docTR) and Langfuse tracing (ADR 0009) are deferred.

## Alternatives considered
- **Persist a provenance row in this PR.** Rejected as out-of-sequence: durable AI-output logging is
  `aia-provenance-logging`, explicitly paired with the logging baseline (`.claude/rules/ai-act.md`).
  Building a bespoke audit table ahead of that baseline is speculative infra; the required
  *code-level* enforcement (a provenance field on every proposal + a test) lands here, which is what
  the rule asks for. The confirm path is wired so adding the write later is small.
- **Store the receipt image (R2) as part of this slice.** Rejected — EU object storage + retention +
  thumbnails is its own feature; for the extraction MVP the image is transient (and never-logged),
  which also minimizes the personal-data footprint. Document archival is sequenced separately.
- **Let the model output a full voucher (accounts/VAT codes/debits).** Rejected — that puts ledger
  authorship in the model (against ADR 0002) and bypasses the status-driven `deriveStandard*` fork.
  The model proposes *fields*; the deterministic core derives the posting and the rules engine gates
  it.
- **A hosted frontier model as the default.** Rejected for sovereignty (ADR 0009): the default is
  local so images stay on-prem; a hosted endpoint is a benchmarking/opt-in base-URL swap, EU-only.
- **Skip the AI-assisted disclosure until the 2 Aug 2026 deadline.** Rejected — shipping an AI feature
  that presents inferred values as if a human or the deterministic engine produced them violates
  `.claude/rules/ai-act.md` (MUST); the disclosure is part of shipping the feature, not a later add.
