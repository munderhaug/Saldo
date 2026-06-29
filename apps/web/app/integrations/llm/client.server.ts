/**
 * Vision-LLM receipt extraction client — the first AI-system surface (feat-receipt-extraction,
 * ADR 0035). All model access goes through ONE OpenAI-compatible interface (ADR 0009); the default
 * backend is a LOCAL Ollama/vLLM, so receipt images — which are personal data (`data-handling.md`) —
 * stay on-prem. A hosted endpoint is just a different `base_url`, allowed ONLY if EU-resident. The
 * image is processed transiently and is **never logged**; secrets come from the server env only.
 *
 * Output is **propose-only** (ADR 0002): this returns a structured extraction the rules engine then
 * validates and a human confirms. The model NEVER writes the ledger, and extraction is field-reading
 * ONLY — it never scores or profiles a natural person (Annex III §5(b)).
 *
 * Every payload is Zod-validated at the boundary (`~/contracts`): the OpenAI response envelope, then
 * the model's JSON content (`llmExtractionFields`). Expected outcomes — not configured, network/timeout,
 * a malformed payload — are returned as a typed result, never thrown; the route maps them to calm,
 * system-owns-fault copy. The wire contract is captured under `db/reference/llm/` (Art. 53).
 */
import { z } from 'zod';
import { llmExtractionFields, receiptExtraction, type ReceiptExtraction } from '~/contracts';
import { llmConfig } from './config.server';

export type ExtractResult =
  | { ok: true; extraction: ReceiptExtraction }
  | { ok: false; reason: 'not-configured' | 'rate-limited' | 'error' | 'invalid-response' };

/** A receipt image to extract from: raw bytes + its media type (e.g. `image/jpeg`). */
export interface ReceiptImage {
  readonly bytes: Uint8Array;
  readonly mediaType: string;
}

const TIMEOUT_MS = 30_000;

/** Minimal view of the OpenAI-compatible chat-completions response — only what we read. */
const chatCompletion = z.object({
  model: z.string().optional(),
  choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1),
});

/**
 * The extraction instruction. Deterministic (temperature 0), JSON-only, field-reading only — and it
 * NEVER asks the model to judge the person. Amounts as plain numbers in the document's currency.
 */
const SYSTEM_PROMPT = [
  'You read a single receipt or invoice image and extract bookkeeping fields.',
  'Reply with a JSON object ONLY (no prose, no code fences) with exactly these keys:',
  '- supplier: the seller/issuer name as a string, or null if unreadable.',
  '- documentDate: the document date as "YYYY-MM-DD", or null if unreadable.',
  '- direction: "purchase" if this is something the user bought, "sale" if the user issued it.',
  '- currency: the ISO-4217 currency code (e.g. "NOK").',
  '- net: the net amount excluding VAT, as a number.',
  '- vat: the VAT amount, as a number (0 if none).',
  '- confidence: your confidence in the extraction, a number between 0 and 1.',
  'Do not assess, score, or profile any person. Extract only what is printed.',
].join('\n');

/** fetch with an abort-on-timeout. Throws on network error / timeout (callers map to `error`). */
async function postJson(url: string, apiKey: string, body: unknown): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Extract a propose-only structured voucher draft from a receipt image. Returns a typed result; the
 * caller (the route action) maps a failure to calm copy and never exposes the image or the raw model
 * output. On success the extraction carries machine-readable provenance (Art. 50(2)).
 */
export async function extractReceipt(image: ReceiptImage): Promise<ExtractResult> {
  const config = llmConfig();
  if (!config) return { ok: false, reason: 'not-configured' };

  const dataUrl = `data:${image.mediaType};base64,${Buffer.from(image.bytes).toString('base64')}`;
  const requestBody = {
    model: config.model,
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Extract the fields from this document.' },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      },
    ],
  };

  let res: Response;
  try {
    res = await postJson(`${config.baseUrl}/chat/completions`, config.apiKey, requestBody);
  } catch {
    return { ok: false, reason: 'error' };
  }
  if (res.status === 429) return { ok: false, reason: 'rate-limited' };
  if (!res.ok) return { ok: false, reason: 'error' };

  const envelope = chatCompletion.safeParse(await res.json().catch(() => null));
  if (!envelope.success) return { ok: false, reason: 'invalid-response' };

  // The structured output is a JSON STRING in the message content — parse then validate it.
  let content: unknown;
  try {
    content = JSON.parse(envelope.data.choices[0]!.message.content);
  } catch {
    return { ok: false, reason: 'invalid-response' };
  }
  const fields = llmExtractionFields.safeParse(content);
  if (!fields.success) return { ok: false, reason: 'invalid-response' };

  // Attach provenance (Art. 50(2)) — model from config, the served tag as the pinned version, the
  // model's own confidence. `aiAssisted` is a literal true: an undisclosed proposal cannot be built.
  // safeParse (not parse) keeps the file's no-throw contract: a failure is a typed result, not a throw.
  const extraction = receiptExtraction.safeParse({
    supplier: fields.data.supplier,
    documentDate: fields.data.documentDate,
    direction: fields.data.direction,
    currency: fields.data.currency,
    net: fields.data.net,
    vat: fields.data.vat,
    provenance: {
      aiAssisted: true,
      model: config.model,
      modelVersion: envelope.data.model ?? config.model,
      confidence: fields.data.confidence,
    },
  });
  if (!extraction.success) return { ok: false, reason: 'invalid-response' };
  return { ok: true, extraction: extraction.data };
}
