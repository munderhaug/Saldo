/**
 * Bank reconciliation — the pure matching engine (build-spec §8.7, ADR for feat-reconciliation).
 *
 * This is the downstream consumer of the append-only banking-import substrate (ADR 0047): it takes an
 * imported `bank_transaction` (a signed-øre fact) and the org's OPEN sales invoices, and proposes how
 * the payment settles a receivable. It is a DETERMINISTIC rules-based matcher — NOT an AI system (EU
 * AI Act Recital 12) — so no Art. 50 disclosure attaches. It proposes; the route action validates and
 * posts; a human confirms the money movement (ADR 0002, a §5.5 consequential act).
 *
 * The tiers mirror the spec's "KID first, then amount + date proximity, then manual":
 *   - `kid-exact`  — the invoice's KID appears in the payment message AND the amount equals the
 *                    outstanding. The strongest signal; a unique such hit can auto-apply.
 *   - `amount-date`— the amount equals the outstanding AND the booking date is within the window of the
 *                    invoice's due (or issue) date.
 *   - `amount`     — the amount equals the outstanding only. A manual-confirmation candidate.
 *
 * Pure: no I/O, no wall-clock (dates are explicit ISO strings; the day arithmetic below is on parsed
 * integers, never `Date.now()`), money stays integer `Øre`. This module runs in the route action and
 * in the browser identically.
 */
import type { Øre } from '../money/ore.js';
import { eqØre } from '../money/ore.js';
import { isValidKidMod10, isValidKidMod11 } from '../ids/kid.js';

/** An imported bank line, reduced to exactly what matching needs (no DB/ORM types leak in). */
export interface BankLine {
  /** Signed øre: positive = money IN (an incoming customer payment), negative = OUT. */
  readonly amount: Øre;
  /** Booking date `YYYY-MM-DD`, or `null` when the source omitted it. */
  readonly bookingDate: string | null;
  /** Free-text remittance / payment message — may embed a KID. Personal data. */
  readonly remittanceInfo: string | null;
}

/** An open (issued, unpaid) sales invoice, reduced to what matching needs. */
export interface OpenInvoice {
  readonly invoiceId: string;
  /** The per-invoice KID allocated on issue, or `null` (e.g. a quote, or a pre-KID document). */
  readonly kid: string | null;
  /** Outstanding gross amount still owed, in øre — always positive for a receivable. */
  readonly outstanding: Øre;
  /** Issue date `YYYY-MM-DD`, or `null`. */
  readonly issueDate: string | null;
  /** Due date `YYYY-MM-DD`, or `null`. */
  readonly dueDate: string | null;
}

/** Match strength, strongest first. */
export type MatchTier = 'kid-exact' | 'amount-date' | 'amount';

/** One proposed match between the bank line and an open invoice. */
export interface MatchCandidate {
  readonly invoiceId: string;
  readonly tier: MatchTier;
  /** Ordering rank (higher = stronger); stable across runs. */
  readonly score: number;
}

/** The outcome of matching one bank line against the open invoices. */
export interface MatchResult {
  /** A single confident auto-match (a unique KID-exact hit), or `null` when a human must choose. */
  readonly auto: MatchCandidate | null;
  /** Every candidate, strongest first, for the manual workflow. */
  readonly candidates: readonly MatchCandidate[];
}

/** Tunable thresholds for the matcher. */
export interface MatchConfig {
  /** Max |bookingDate − dueDate (or issueDate)| in days to count as date-proximate. */
  readonly dateWindowDays: number;
}

/** The default window: a payment within ~a month of the due date is "date-proximate". */
export const DEFAULT_MATCH_CONFIG: MatchConfig = { dateWindowDays: 30 };

const SCORE: Record<MatchTier, number> = { 'kid-exact': 100, 'amount-date': 60, amount: 30 };

/**
 * Maximal runs of consecutive ASCII digits in a free-text string. A KID is a contiguous digit
 * sequence, so a payment message's KID (if present) is one of these runs. Returns `[]` for `null`.
 */
export function digitRuns(text: string | null): readonly string[] {
  if (text === null) return [];
  return text.match(/\d+/g) ?? [];
}

/** Parse a strict `YYYY-MM-DD` string to a UTC day ordinal, or `null` if malformed. Pure. */
function isoDayOrdinal(iso: string | null): number | null {
  if (iso === null) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const ms = Date.UTC(year, month - 1, day);
  const ordinal = Math.floor(ms / 86_400_000);
  // Reject overflow (e.g. 2026-02-31 rolls into March): the round-trip must match the input.
  const back = new Date(ms);
  if (back.getUTCMonth() !== month - 1 || back.getUTCDate() !== day) return null;
  return ordinal;
}

/** Whether the bank line's booking date is within the config window of the invoice's due/issue date. */
function dateProximate(line: BankLine, inv: OpenInvoice, config: MatchConfig): boolean {
  const booking = isoDayOrdinal(line.bookingDate);
  if (booking === null) return false;
  const reference = isoDayOrdinal(inv.dueDate) ?? isoDayOrdinal(inv.issueDate);
  if (reference === null) return false;
  return Math.abs(booking - reference) <= config.dateWindowDays;
}

/**
 * Match one incoming bank line against the org's open invoices. Outgoing or zero lines never match a
 * receivable in this slice (there are no purchase/AP documents yet), so they return an empty result.
 *
 * Only EQUAL-amount candidates are proposed: an incoming payment whose amount equals an invoice's
 * outstanding can settle it cleanly. Partial / over-payments are a sequenced refinement (they need a
 * residual model), so they are deliberately NOT surfaced as auto-postable matches here.
 */
export function matchBankLine(
  line: BankLine,
  invoices: readonly OpenInvoice[],
  config: MatchConfig = DEFAULT_MATCH_CONFIG,
): MatchResult {
  if (line.amount <= 0) return { auto: null, candidates: [] };

  const runs = digitRuns(line.remittanceInfo);
  const candidates: MatchCandidate[] = [];

  for (const inv of invoices) {
    if (!eqØre(inv.outstanding, line.amount)) continue;
    // Norwegian KIDs are issuer-configured mod-10 OR mod-11 (ids/kid.ts). Accept a hit under either
    // scheme — Saldo mints mod-10, but inbound/migrated/legacy invoices may carry a mod-11 KID, which
    // a mod-10-only check would wrongly demote from the unique-kid auto-apply tier (review H4).
    const isKidLike = (k: string): boolean => isValidKidMod10(k) || isValidKidMod11(k);
    const kidHit = inv.kid !== null && isKidLike(inv.kid) && runs.includes(inv.kid);
    const tier: MatchTier = kidHit
      ? 'kid-exact'
      : dateProximate(line, inv, config)
        ? 'amount-date'
        : 'amount';
    candidates.push({ invoiceId: inv.invoiceId, tier, score: SCORE[tier] });
  }

  // Stable order: strongest score first, then invoiceId so the result is deterministic.
  candidates.sort((a, b) => b.score - a.score || (a.invoiceId < b.invoiceId ? -1 : 1));

  // Auto-apply only a UNIQUE KID-exact hit — anything ambiguous goes to the manual workflow.
  const kidExact = candidates.filter((c) => c.tier === 'kid-exact');
  const auto = kidExact.length === 1 ? kidExact[0]! : null;

  return { auto, candidates };
}
