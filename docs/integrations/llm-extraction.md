# LLM extraction (receipts → structured proposal)

- **Purpose:** Extract vendor, date, net, VAT, and line items from receipts/invoices into a
  *proposed* voucher. Propose-only (ADR 0002).
- **Architecture:** one OpenAI-compatible client (ADR 0009). Default backend is local
  **Qwen2.5-VL** via **Ollama** (dev) / **vLLM** (prod); a hosted endpoint is just another base URL.
  OCR fallback: **Surya/docTR**. Traces/evals/cost via **Langfuse** (optional, self-hosted).
- **Auth:** `LLM_BASE_URL` + `LLM_API_KEY` (env). For Ollama the key is a placeholder.
- **Flow:** image → extraction → Zod-validated structured fields → **rules engine** (`@saldo/domain`)
  → proposed voucher → human confirms → posted. The model never writes to the ledger.
- **Phase:** 2. The data-sovereignty default (local) is decided here.

## Sources
- Ollama, OpenAI-compatible API reference. Raw: db/reference/llm/ (capture the `/v1/chat/completions`
  vision contract). verify-by: 2026-12-31
- Qwen2.5-VL model card. Raw: db/reference/llm/. verify-by: 2026-12-31
