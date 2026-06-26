/**
 * Banking import — the PURE normalisation core (build-spec §8.7 / §9). Maps a bank transaction from
 * either source — a camt.054 entry (ISO 20022) or a GoCardless Bank Account Data payload — onto ONE
 * typed, source-agnostic {@link NormalisedBankTx}. No I/O, no clock, no XML/HTTP: the XML-to-fields and
 * HTTP-to-fields steps live at the app boundary (`apps/web/app/integrations/banking/`); everything
 * money-shaped happens here so it is exhaustively + property tested.
 *
 * Money is integer **øre**, parsed by string assembly — NEVER via float (`.claude/rules/money.md`).
 * The two sources differ only in how the sign is carried: camt amounts are unsigned with a separate
 * `CdtDbtInd` (CRDT/DBIT); GoCardless carries the sign in the amount string itself. Both converge on a
 * **signed** amount: positive = money INTO the account (credit), negative = OUT (debit).
 *
 * Field models are grounded in the committed captures `db/reference/banking/camt-054.md` and
 * `db/reference/banking/gocardless-bank-account-data.md` — never from memory. KID extraction and
 * voucher matching are the downstream reconciliation task, NOT here: remittance text is stored raw.
 *
 * Counterparty name + remittance text are **personal data** (`.claude/rules/data-handling.md`).
 */
import { øre, type Øre } from '../money/ore.js';

/** Direction of a posting relative to the account owner. `credit` = in, `debit` = out. */
export type BankTxDirection = 'credit' | 'debit';

/** One imported bank transaction, normalised across all three sources. An append-only imported fact. */
export interface NormalisedBankTx {
  /** Source's stable id for the entry (`''` when the source gave none — see {@link transactionDedupKey}). */
  readonly externalId: string;
  /** Signed amount in øre: positive = credit (into the account), negative = debit (out). */
  readonly amount: Øre;
  /** ISO 4217 currency, upper-cased. */
  readonly currency: string;
  /** Booking date `YYYY-MM-DD`, or `null` when absent / unparseable. */
  readonly bookingDate: string | null;
  /** Value date `YYYY-MM-DD`, or `null` when absent / unparseable. */
  readonly valueDate: string | null;
  /** Free-text remittance / message (personal data), or `null`. */
  readonly remittanceInfo: string | null;
  /** Counterparty name (personal data), or `null`. */
  readonly counterparty: string | null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_CURRENCY = /^[A-Z]{3}$/;

/**
 * Parse a decimal amount string (ISO 20022 / GoCardless: dot decimal, optional leading `-`) into
 * **signed øre**, or `null` when it isn't a well-formed amount. Integer-safe: the øre are assembled by
 * string, never by float multiplication. Up to two fraction digits are kept; trailing zeros beyond two
 * places are dropped (so `"45.000"` works), but genuine sub-øre precision (`"45.001"`) is REJECTED
 * rather than silently rounded — money is never quietly lost.
 */
export function decimalToØre(value: string): Øre | null {
  const cleaned = value.trim();
  // A real monetary amount is short; bound the length so untrusted bank input can't drive pathological
  // scanning (a safe-integer øre is ≤ ~19 chars incl. sign + decimal). Defence-in-depth alongside the
  // linear trailing-zero scan below (no backtracking regex — CodeQL polynomial-ReDoS hardening).
  if (cleaned.length > 24) return null;
  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(cleaned);
  if (!match) return null;
  const negative = match[1] === '-';
  const whole = match[2]!;
  let fraction = match[3] ?? '';
  if (fraction.length > 2) {
    // Drop trailing zeros beyond two places with a LINEAR scan (not a `/0+$/` regex, which is
    // polynomial on a long run of zeros from uncontrolled input). 48 = '0'.
    let end = fraction.length;
    while (end > 2 && fraction.charCodeAt(end - 1) === 48) end--;
    if (end > 2) return null; // genuine sub-øre precision — never silently rounded away
    fraction = fraction.slice(0, end);
  }
  fraction = fraction.padEnd(2, '0'); // "5" → "50", "" → "00"
  const magnitude = Number(`${whole}${fraction}`);
  if (!Number.isSafeInteger(magnitude)) return null;
  const signed = negative ? -magnitude : magnitude;
  return øre(signed === 0 ? 0 : signed); // normalise -0 → 0
}

/** Apply a camt `CdtDbtInd` direction to an unsigned magnitude: debit → negative, credit → positive. */
export function applyDirection(magnitude: Øre, direction: BankTxDirection): Øre {
  const abs = Math.abs(magnitude);
  return øre(direction === 'debit' && abs !== 0 ? -abs : abs); // never -0
}

const cleanText = (value: string | null | undefined): string | null => {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};
const cleanDate = (value: string | null | undefined): string | null => {
  const text = cleanText(value);
  return text && ISO_DATE.test(text) ? text : null;
};
const cleanCurrency = (value: string | null | undefined): string | null => {
  const text = cleanText(value);
  if (!text) return null;
  const upper = text.toUpperCase();
  return ISO_CURRENCY.test(upper) ? upper : null;
};

/** Why a normalisation failed — money/currency/direction are hard errors; dates/text degrade to null. */
export type NormaliseReason = 'invalid-amount' | 'invalid-currency' | 'invalid-direction';

export type NormaliseResult =
  | { readonly ok: true; readonly tx: NormalisedBankTx }
  | { readonly ok: false; readonly reason: NormaliseReason };

/** The extracted fields of one camt.054 `Ntry` (the XML→fields step is the app-boundary parser's job). */
export interface CamtEntryFields {
  readonly externalId?: string | null;
  /** Unsigned decimal from `Ntry/Amt`. */
  readonly amount: string;
  /** `Ntry/CdtDbtInd` — `CRDT` or `DBIT`. */
  readonly creditDebit: string;
  /** `Ntry/Amt/@Ccy` (or `Acct/Ccy`). */
  readonly currency?: string | null;
  readonly bookingDate?: string | null;
  readonly valueDate?: string | null;
  readonly remittanceInfo?: string | null;
  readonly counterparty?: string | null;
}

/** Normalise one camt.054 entry. Sign comes from `creditDebit`; the amount itself is unsigned. */
export function normaliseCamtEntry(fields: CamtEntryFields): NormaliseResult {
  const currency = cleanCurrency(fields.currency);
  if (!currency) return { ok: false, reason: 'invalid-currency' };
  const indicator = fields.creditDebit?.trim().toUpperCase();
  const direction: BankTxDirection | null =
    indicator === 'CRDT' ? 'credit' : indicator === 'DBIT' ? 'debit' : null;
  if (!direction) return { ok: false, reason: 'invalid-direction' };
  const magnitude = decimalToØre(fields.amount);
  if (magnitude === null) return { ok: false, reason: 'invalid-amount' };
  return {
    ok: true,
    tx: {
      externalId: cleanText(fields.externalId) ?? '',
      amount: applyDirection(magnitude, direction),
      currency,
      bookingDate: cleanDate(fields.bookingDate),
      valueDate: cleanDate(fields.valueDate),
      remittanceInfo: cleanText(fields.remittanceInfo),
      counterparty: cleanText(fields.counterparty),
    },
  };
}

/** The validated fields of one GoCardless transaction (the HTTP→fields step is the client's job). */
export interface GoCardlessTxFields {
  readonly externalId?: string | null;
  /** SIGNED decimal from `transactionAmount.amount` (GoCardless carries the sign here). */
  readonly amount: string;
  /** `transactionAmount.currency`. */
  readonly currency: string;
  readonly bookingDate?: string | null;
  readonly valueDate?: string | null;
  readonly remittanceInfo?: string | null;
  readonly counterparty?: string | null;
}

/** Normalise one GoCardless transaction. The sign is already in the amount string. */
export function normaliseGoCardlessTx(fields: GoCardlessTxFields): NormaliseResult {
  const currency = cleanCurrency(fields.currency);
  if (!currency) return { ok: false, reason: 'invalid-currency' };
  const amount = decimalToØre(fields.amount);
  if (amount === null) return { ok: false, reason: 'invalid-amount' };
  return {
    ok: true,
    tx: {
      externalId: cleanText(fields.externalId) ?? '',
      amount,
      currency,
      bookingDate: cleanDate(fields.bookingDate),
      valueDate: cleanDate(fields.valueDate),
      remittanceInfo: cleanText(fields.remittanceInfo),
      counterparty: cleanText(fields.counterparty),
    },
  };
}

/**
 * The idempotency key for an import. Prefer the source's `externalId`; when it gave none, derive a
 * stable fingerprint from the entry's content so re-importing the same file/window is a no-op and never
 * creates duplicates (the import is append-only — `.claude/rules/data-handling.md` / build-spec §8.7).
 */
export function transactionDedupKey(tx: NormalisedBankTx): string {
  if (tx.externalId !== '') return tx.externalId;
  return [
    'fp',
    tx.amount,
    tx.currency,
    tx.bookingDate ?? '',
    tx.valueDate ?? '',
    tx.remittanceInfo ?? '',
    tx.counterparty ?? '',
  ].join('|');
}
