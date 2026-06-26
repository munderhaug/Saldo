/**
 * Receipt extraction — boundary contracts for the first AI-system surface (feat-receipt-extraction,
 * ADR 0035). This is where **code-level EU AI Act enforcement first lands** (`.claude/rules/ai-act.md`):
 * the provenance field is part of the proposal's Zod contract, not an afterthought.
 *
 * Three shapes, each a single source of truth (infer types from them — never declare parallels):
 *  - `aiProvenance` — Art. 50(2) machine-readable provenance. `aiAssisted` is a **literal `true`** so
 *    the type system itself refuses an AI proposal that fails to disclose it.
 *  - `llmExtractionFields` — the raw JSON a vision model must emit, validated at the boundary BEFORE
 *    it is trusted (amounts arrive as kroner and are parsed to integer `Øre` with the same
 *    integer-safe `parseKroner` the manual surface uses — never float math, money.md).
 *  - `receiptExtraction` — the validated extraction the client returns and the UI discloses, carrying
 *    its provenance. The human reviews/edits then confirms through the EXISTING manual-voucher input
 *    (`manualVoucherInput`); the model never writes the ledger (ADR 0002).
 *
 * Receipt images are personal data (`data-handling.md`): processed transiently, EU-resident, never
 * logged. Extraction is field-reading ONLY — it never scores or profiles a natural person
 * (Annex III §5(b), the line never to cross).
 */
import { z } from 'zod';
import { parseKroner, type Øre } from '@saldo/domain';
import { manualVoucherInput } from './voucher';

/**
 * Art. 50(2) provenance — REQUIRED on every AI-proposed value. `aiAssisted: true` is a literal: a
 * proposal object that omits or falsifies it does not type-check, so disclosure cannot be forgotten.
 */
export const aiProvenance = z.object({
  /** Always true — this value was proposed by an AI system, never a human or the deterministic engine. */
  aiAssisted: z.literal(true),
  /** Model family/id (e.g. `qwen2.5-vl`). */
  model: z.string().min(1),
  /** Served model tag/version (e.g. `qwen2.5-vl:7b-instruct`) — the pinned version for the audit trail. */
  modelVersion: z.string().min(1),
  /** Model's self-reported confidence, 0..1 — surfaced so the human weighs the proposal. */
  confidence: z.number().min(0).max(1),
});

/** A kroner amount from the model (string or number) parsed to integer `Øre` — never float math. */
const kronerAmount = z
  .union([z.string(), z.number()])
  .transform((v) => (typeof v === 'number' ? String(v) : v.trim()))
  .transform((v, ctx): Øre => {
    const ore = parseKroner(v);
    if (ore === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Ugyldig beløp i uttrekket' });
      return z.NEVER;
    }
    return ore;
  });

/** Whether the document is bought (receipt/supplier invoice) or sold (issued invoice). */
const EXTRACTION_DIRECTIONS = ['purchase', 'sale'] as const;

/**
 * The raw structured fields the vision model emits in `choices[0].message.content` (see the captured
 * wire contract under `db/reference/llm/`). Validated at the boundary; a malformed payload is rejected,
 * never trusted. `supplier`/`documentDate` are nullable — the model may not find them on a faint
 * receipt, and the system owns that ("I couldn't read the date — mind a look?"), never the user.
 */
export const llmExtractionFields = z.object({
  supplier: z.string().trim().min(1).max(200).nullable(), // personal: a supplier's navn may be a natural person's name (ENK)
  documentDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Forventet dato på formen ÅÅÅÅ-MM-DD')
    .nullable(),
  direction: z.enum(EXTRACTION_DIRECTIONS),
  /** ISO-4217, normalised to upper-case; the domain map posts only NOK in this slice. */
  currency: z
    .string()
    .trim()
    .length(3)
    .transform((s) => s.toUpperCase()),
  net: kronerAmount,
  vat: kronerAmount,
  confidence: z.number().min(0).max(1),
});

/**
 * Confirm-step input for the receipt path: the human's confirmed kind+amount (the SAME `manualVoucherInput`
 * the manual surface uses — the truth) PLUS the AI provenance carried through the review round-trip as
 * hidden fields, re-validated here so the durable Art. 50(2) record (ADR 0037) is written from a checked
 * shape, never trusted raw. Persisted provenance is model · modelVersion · confidence ONLY — never the
 * supplier (// personal), amounts-as-PII, or the image (`data-handling.md`). Mirrors `aiProvenance`,
 * INCLUDING the `aiAssisted` disclosure literal — carried through the form as the string `"true"` so a
 * confirm that fails to disclose AI does not validate (the propose side's guarantee, end-to-end; a
 * non-AI caller cannot reach this AI-only intent) — and coerces `confidence` from the form string.
 */
export const receiptConfirmInput = manualVoucherInput.extend({
  aiAssisted: z.literal('true').transform(() => true as const),
  model: z.string().min(1),
  modelVersion: z.string().min(1),
  confidence: z.coerce.number().min(0).max(1),
});

/** The validated extraction the client returns and the UI discloses — fields plus their provenance. */
export const receiptExtraction = z.object({
  supplier: z.string().nullable(), // personal: see llmExtractionFields.supplier
  documentDate: z.string().nullable(),
  direction: z.enum(EXTRACTION_DIRECTIONS),
  currency: z.string(),
  net: z.custom<Øre>(),
  vat: z.custom<Øre>(),
  provenance: aiProvenance,
});
export type ReceiptExtraction = z.infer<typeof receiptExtraction>;
