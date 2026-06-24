# Capture — OpenAI-compatible vision chat-completions + Qwen2.5-VL model card

> Raw reference capture grounding Saldo's receipt-extraction LLM surface (feat-receipt-extraction,
> ADR 0035; ADR 0009 local-first). Cited by `docs/integrations/llm-extraction.md` and the client at
> `apps/web/app/integrations/llm/client.server.ts`. Captured **2026-06-24**. **verify-by: 2026-12-31.**
>
> Per **EU AI Act Art. 53** we rely on the model provider's documentation rather than inferring
> capabilities/limits from memory (`.claude/rules/ai-act.md`, `docs/regulatory/eu-ai-act.md` §5). This
> file is that committed, dated grounding; re-capture via the `regulatory-update` skill when it ages.

## 1. The wire contract — OpenAI-compatible `POST /v1/chat/completions` (vision)

Ollama (dev) and vLLM (prod) both expose this OpenAI-compatible endpoint; a hosted endpoint is only a
different `base_url` (ADR 0009). The vision request carries the image as a base64 **data URL** in an
`image_url` content part:

```jsonc
// Request
{
  "model": "qwen2.5-vl",
  "messages": [
    { "role": "system", "content": "Extract the fields. Reply with JSON only." },
    {
      "role": "user",
      "content": [
        { "type": "text", "text": "..." },
        { "type": "image_url",
          "image_url": { "url": "data:image/jpeg;base64,<BASE64>" } }
      ]
    }
  ],
  "temperature": 0,                     // determinism for extraction
  "response_format": { "type": "json_object" }  // ask for strict JSON (supported by vLLM; Ollama honours `format`)
}
```

```jsonc
// Response (the fields Saldo reads)
{
  "id": "chatcmpl-...",
  "model": "qwen2.5-vl",
  "choices": [
    { "index": 0,
      "finish_reason": "stop",
      "message": { "role": "assistant", "content": "{ ...the JSON we asked for... }" } }
  ],
  "usage": { "prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0 }
}
```

- The model's structured output is a **string** in `choices[0].message.content`; Saldo `JSON.parse`s it
  then validates with the `llmExtractionFields` Zod contract at the boundary (`app/contracts`) — a
  malformed payload is a typed `invalid-response`, never trusted.
- `temperature: 0` for reproducibility; the model's self-reported `confidence` (0..1) is part of the
  field contract and flows into provenance (Art. 50(2)).
- Auth: `Authorization: Bearer <LLM_API_KEY>`. For local Ollama the key is a placeholder.

Source: OpenAI Chat Completions API reference (vision / image_url content parts),
`https://platform.openai.com/docs/api-reference/chat` and `.../docs/guides/vision`. The same shape is
implemented by Ollama (`https://github.com/ollama/ollama/blob/main/docs/openai.md`) and vLLM
(`https://docs.vllm.ai/en/latest/serving/openai_compatible_server.html`). verify-by: 2026-12-31.

## 2. Model card — Qwen2.5-VL (the default local backend, ADR 0009)

- **Provider:** Alibaba Cloud (Qwen team) — the GPAI-model provider carrying the Art. 53 duties; Saldo
  is a downstream **deployer**, not a GPAI provider (`docs/regulatory/eu-ai-act.md` §5).
- **Variants:** 3B, 7B, 72B (instruct), incl. AWQ-quantised builds.
- **Licence:** Apache-2.0 — a genuine open-source licence (relevant to the Art. 53(2) narrowing and to
  the self-hostable, zero-external-call default).
- **Capabilities (cited, not inferred):** stronger multilingual OCR in natural scenes; **document
  parsing with layout/position**; **key-information extraction** and structured (JSON) output —
  i.e. receipt/invoice → fields, which is exactly this surface's use.
- **Image input:** local path, URL, or **base64** (the data-URL form §1 uses).
- **Limits to respect:** a vision model is not a ledger — output is **propose-only** and MUST pass the
  rules engine before any human commit (ADR 0002). Extraction is field-reading only; it NEVER scores
  or profiles a natural person (Annex III §5(b) — the line never to cross).

Source: Qwen2.5-VL model card / repository `https://github.com/QwenLM/Qwen2.5-VL` (Apache-2.0).
verify-by: 2026-12-31.

## 3. Data-handling note (residency)

Receipt images are **personal data** (a receipt can carry a natural person's data — `data-handling.md`).
The default backend is **local** (Ollama/vLLM), so images stay on-prem — zero external LLM calls. A
hosted endpoint may be configured ONLY if EU-resident; the client never sends image bytes to a non-EU
endpoint, and the image is **never logged**.
