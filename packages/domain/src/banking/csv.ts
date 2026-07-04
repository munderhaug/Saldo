/**
 * Banking import — PURE CSV statement parsing (build-spec §8.7, the third import source). Banks export
 * wildly different CSV shapes, so this is mapping-driven: a {@link CsvColumnMap} says which header holds
 * which field, and {@link inferCsvColumnMap} guesses that map from common Norwegian + English header
 * names so the everyday case is zero-config. No I/O — text in, normalised transactions out — so it is
 * property tested like the rest of the domain core.
 *
 * Money is integer **øre** via {@link decimalToØre}; the only CSV-specific twist is locale: Norwegian
 * exports use a comma decimal and space/dot grouping, normalised to the dot-decimal `decimalToØre`
 * expects. A row that can't be parsed is collected as an error, never silently dropped — and never
 * silently mis-valued.
 */
import { addØre, negØre, øre, ZERO } from '../money/ore.js';
import { cleanCurrency, decimalToØre, type NormalisedBankTx } from './transaction.js';

/** Which CSV header (exact, case-insensitive) maps to which normalised field. All optional. */
export interface CsvColumnMap {
  readonly externalId?: string;
  /** A single SIGNED amount column. Use this OR the in/out pair, not both. */
  readonly amount?: string;
  /** Credit column (money in, positive). */
  readonly amountIn?: string;
  /** Debit column (money out, a positive magnitude — stored negative). */
  readonly amountOut?: string;
  readonly currency?: string;
  readonly bookingDate?: string;
  readonly valueDate?: string;
  readonly remittanceInfo?: string;
  readonly counterparty?: string;
}

export interface CsvParseOptions {
  readonly map: CsvColumnMap;
  /** Currency for rows with no mapped currency column (the linked account's currency). */
  readonly defaultCurrency: string;
  /** Field delimiter; auto-detected (`,` vs `;`) from the header line when omitted. */
  readonly delimiter?: string;
}

/** A row that could not be turned into a transaction (1-based FILE line number incl. the header). */
export interface CsvRowError {
  readonly line: number;
  readonly reason: 'no-amount' | 'invalid-amount' | 'invalid-currency';
}

export interface CsvParseResult {
  readonly transactions: readonly NormalisedBankTx[];
  readonly errors: readonly CsvRowError[];
}

/** One tokenised row plus the 1-based FILE line it started on (blank lines shift the numbering). */
interface CsvRow {
  readonly fields: readonly string[];
  readonly line: number;
}

/**
 * Tokenise CSV text into rows of fields (RFC 4180: `"`-quoted fields, `""` escapes a quote, CR/LF and
 * the delimiter are literal inside quotes). Tolerant of a trailing newline and a leading BOM. Each row
 * carries the FILE line it started on, so a skipped blank line never shifts the error line numbers the
 * user sees (review 2026-07-03 §10; a quoted field may span lines — the row keeps its starting line).
 */
function tokenise(text: string, delimiter: string): CsvRow[] {
  const rows: CsvRow[] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let started = false; // did this row have any content (so a trailing newline doesn't add a blank row)?
  let lineNo = 1; // current 1-based file line
  let rowStart = 1; // file line the current row started on
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // strip BOM

  for (let i = 0; i < source.length; i++) {
    const ch = source[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        if (ch === '\r' && source[i + 1] === '\n') {
          field += ch;
          continue; // count the pair once, at the \n
        }
        if (ch === '\n' || ch === '\r') lineNo++;
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      started = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
      started = true;
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && source[i + 1] === '\n') i++;
      if (started || field !== '') {
        row.push(field);
        rows.push({ fields: row, line: rowStart });
      }
      lineNo++;
      row = [];
      field = '';
      started = false;
      rowStart = lineNo;
    } else {
      field += ch;
      started = true;
    }
  }
  if (started || field !== '') {
    row.push(field);
    rows.push({ fields: row, line: rowStart });
  }
  return rows;
}

/** Normalise a CSV amount to the dot-decimal `decimalToØre` expects: strip grouping, comma → dot. */
function normaliseCsvAmount(raw: string): string {
  const s = raw.trim().replace(/\s/g, '');
  if (s.includes(',') && s.includes('.')) {
    // European grouping: dots are thousands separators, the comma is the decimal.
    return s.replace(/\./g, '').replace(',', '.');
  }
  return s.replace(',', '.');
}

const norm = (s: string): string => s.trim().toLowerCase();

/** Header aliases (Norwegian first, English second) used by {@link inferCsvColumnMap}. */
const ALIASES: Record<keyof CsvColumnMap, readonly string[]> = {
  externalId: [
    'arkivreferanse',
    'referanse',
    'transaksjons-id',
    'transaksjonsid',
    'reference',
    'id',
  ],
  amount: ['beløp', 'belop', 'beløp i kr', 'amount', 'sum'],
  amountIn: ['inn', 'innbeløp', 'innbetalt', 'credit', 'kredit'],
  amountOut: ['ut', 'utbeløp', 'utbetalt', 'debit', 'debet'],
  currency: ['valuta', 'currency', 'ccy'],
  bookingDate: ['bokføringsdato', 'bokf.dato', 'dato', 'booking date', 'date'],
  valueDate: ['rentedato', 'valuteringsdato', 'valutadato', 'value date'],
  remittanceInfo: ['beskrivelse', 'tekst', 'melding', 'forklaring', 'description', 'text'],
  counterparty: ['motkonto', 'mottaker', 'betaler', 'navn', 'counterparty', 'payee'],
};

/**
 * Guess a column map from a header row by matching common bank-export names. A field is mapped only on
 * an exact (case-insensitive, trimmed) header match; ambiguous/unknown headers are left unmapped so the
 * caller can fall back to an explicit map. Prefers a single signed `amount` column when present.
 */
export function inferCsvColumnMap(headers: readonly string[]): CsvColumnMap {
  const find = (field: keyof CsvColumnMap): string | undefined =>
    headers.find((h) => ALIASES[field].includes(norm(h)));
  const map: Record<string, string> = {};
  for (const field of Object.keys(ALIASES) as (keyof CsvColumnMap)[]) {
    const hit = find(field);
    if (hit) map[field] = hit;
  }
  // A single signed amount column wins over the in/out pair (avoid double-counting).
  if (map.amount && (map.amountIn || map.amountOut)) {
    delete map.amountIn;
    delete map.amountOut;
  }
  return map;
}

/**
 * Parse a CSV bank statement into normalised transactions. The first row is the header. Each data row
 * becomes one transaction; rows whose amount is missing/unparseable are returned in `errors` (with the
 * 1-based line number) rather than dropped. The signed amount is taken from the `amount` column, or
 * derived from `amountIn` − `amountOut`.
 */
/** Auto-detect the field delimiter from the header line: `;` (Norwegian default) vs `,`. */
function detectCsvDelimiter(text: string): string {
  const noBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const header = noBom.split('\n')[0] ?? '';
  return header.split(';').length > header.split(',').length ? ';' : ',';
}

export function parseCsvStatement(text: string, options: CsvParseOptions): CsvParseResult {
  const delimiter = options.delimiter ?? detectCsvDelimiter(text);
  const rows = tokenise(text, delimiter);
  if (rows.length < 2) return { transactions: [], errors: [] };

  const header = rows[0]!.fields.map(norm);
  const indexOf = (name: string | undefined): number =>
    name === undefined ? -1 : header.indexOf(norm(name));
  const cols = {
    externalId: indexOf(options.map.externalId),
    amount: indexOf(options.map.amount),
    amountIn: indexOf(options.map.amountIn),
    amountOut: indexOf(options.map.amountOut),
    currency: indexOf(options.map.currency),
    bookingDate: indexOf(options.map.bookingDate),
    valueDate: indexOf(options.map.valueDate),
    remittanceInfo: indexOf(options.map.remittanceInfo),
    counterparty: indexOf(options.map.counterparty),
  };
  const cell = (row: readonly string[], idx: number): string => (idx >= 0 ? (row[idx] ?? '') : '');
  const cellOrNull = (row: readonly string[], idx: number): string | null => {
    const v = cell(row, idx).trim();
    return v === '' ? null : v;
  };

  const transactions: NormalisedBankTx[] = [];
  const errors: CsvRowError[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]!.fields;
    const line = rows[r]!.line; // the row's real FILE line (blank lines don't shift it)

    let amount: NormalisedBankTx['amount'] | null = null;
    if (cols.amount >= 0) {
      const raw = cell(row, cols.amount).trim();
      if (raw !== '') {
        amount = decimalToØre(normaliseCsvAmount(raw));
        if (amount === null) {
          errors.push({ line, reason: 'invalid-amount' });
          continue;
        }
      }
    } else if (cols.amountIn >= 0 || cols.amountOut >= 0) {
      const inRaw = cell(row, cols.amountIn).trim();
      const outRaw = cell(row, cols.amountOut).trim();
      const credit = inRaw === '' ? ZERO : decimalToØre(normaliseCsvAmount(inRaw));
      const debit = outRaw === '' ? ZERO : decimalToØre(normaliseCsvAmount(outRaw));
      if (credit === null || debit === null) {
        errors.push({ line, reason: 'invalid-amount' });
        continue;
      }
      // An "out" column is a positive magnitude → money leaving is negative: credit + (−|debit|).
      if (inRaw !== '' || outRaw !== '') {
        amount = addØre(credit, negØre(øre(Math.abs(debit))));
      }
    }

    if (amount === null) {
      errors.push({ line, reason: 'no-amount' });
      continue;
    }

    // A present-but-malformed currency cell is an error (never silently mis-labelled money); an
    // absent cell falls back to the linked account's currency.
    const rawCurrency = cellOrNull(row, cols.currency);
    const currency =
      rawCurrency === null ? cleanCurrency(options.defaultCurrency) : cleanCurrency(rawCurrency);
    if (currency === null) {
      errors.push({ line, reason: 'invalid-currency' });
      continue;
    }

    transactions.push({
      externalId: cellOrNull(row, cols.externalId) ?? '',
      amount,
      currency,
      bookingDate: isoDate(cellOrNull(row, cols.bookingDate)),
      valueDate: isoDate(cellOrNull(row, cols.valueDate)),
      remittanceInfo: cellOrNull(row, cols.remittanceInfo),
      counterparty: cellOrNull(row, cols.counterparty),
    });
  }

  return { transactions, errors };
}

/** Result of {@link parseBankCsv}: the parse, plus whether an amount column could be inferred. */
export interface BankCsvResult extends CsvParseResult {
  /** False when no amount / in-out columns were recognised in the header (nothing could be parsed). */
  readonly mapped: boolean;
}

/**
 * Zero-config convenience for the import route: detect the delimiter, infer the column map from common
 * Norwegian/English headers ({@link inferCsvColumnMap}), then parse. `mapped: false` means the header
 * had no recognisable amount column — the caller surfaces a "couldn't find the amount column" message
 * rather than importing nothing silently. The header is split naively (a header rarely quotes the
 * delimiter); the body is parsed by the RFC-4180 tokeniser in {@link parseCsvStatement}.
 */
export function parseBankCsv(text: string, defaultCurrency: string): BankCsvResult {
  const delimiter = detectCsvDelimiter(text);
  const noBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const headerLine = noBom.split(/\r?\n/)[0] ?? '';
  const headers = headerLine.split(delimiter).map((h) => h.replace(/^"|"$/g, ''));
  const map = inferCsvColumnMap(headers);
  if (!map.amount && !map.amountIn && !map.amountOut) {
    return { transactions: [], errors: [], mapped: false };
  }
  return { ...parseCsvStatement(text, { map, defaultCurrency, delimiter }), mapped: true };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const isoDate = (v: string | null): string | null => (v && ISO_DATE.test(v) ? v : null);
