/**
 * Receipt-extraction mapping — the pure shape that turns a *validated* vision-LLM extraction into a
 * propose-only voucher draft (feat-receipt-extraction; ADR 0035). This module is the domain half of
 * the AI surface: the LLM and its HTTP/Zod boundary live in the app (`apps/web/app/integrations/llm`,
 * `app/contracts`); here the already-structured fields become a postable proposal — direction → the
 * everyday event (income/expense), plus a status-independent standard-rate sanity signal.
 *
 * It does NOT decide VAT posting: the org's `mva_status` fork lives once in `deriveStandard*`
 * (posting/manual.ts) and runs server-side at confirm time. This keeps the AI path on exactly the
 * same posting truth as the manual surface (ADR 0034) — AI proposes, the rules engine validates, a
 * human confirms (ADR 0002). The model NEVER writes the ledger.
 */
import type { Øre } from '../money/ore.js';

/** Whether the document is something bought (a receipt/supplier invoice) or sold (an issued invoice). */
export type ExtractionDirection = 'purchase' | 'sale';

/** The everyday economic event the proposal maps onto — the same two kinds the manual surface records. */
export type ProposedKind = 'income' | 'expense';

/** The structured, already-validated extraction the mapping reasons over (amounts in integer øre). */
export interface ExtractionFields {
  readonly direction: ExtractionDirection;
  /** Net amount excl. VAT, in øre. */
  readonly net: Øre;
  /** VAT amount stated on the document, in øre. */
  readonly vat: Øre;
  /** ISO-4217 currency of the document. Only NOK is postable in this slice. */
  readonly currency: string;
}

/** A propose-only voucher draft: the event + net the human confirms, plus a calm sanity signal. */
export interface ExtractionProposal {
  readonly kind: ProposedKind;
  /** Net amount in øre — the figure the confirm step feeds to the existing manual-voucher path. */
  readonly net: Øre;
  /** Standard-rate (25 %) VAT on the net — what a normal domestic purchase/sale would carry. */
  readonly expectedVat: Øre;
  /**
   * True when the document's stated VAT equals the standard-rate VAT on the net. False is NOT an
   * error — it just means a reduced/zero rate or an extraction slip, so the UI shows a calm
   * "mind a look?" (the system owns the ambiguity, never the user — experience-voice §5.5).
   */
  readonly vatLooksStandard: boolean;
}

/** Mapping outcome: an expected rejection is a typed result the UI surfaces, never a throw. */
export type ExtractionMapResult =
  | { readonly ok: true; readonly proposal: ExtractionProposal }
  | { readonly ok: false; readonly reason: 'unsupported-currency' | 'non-positive-net' };
