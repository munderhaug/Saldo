/**
 * The MVA-melding **skattleggingsperiode** (term) model — pure, period-agnostic. The melding's default
 * cadence is six bimonthly terms; a business under 1 M NOK turnover may file a single annual term
 * (*årstermin*). Both map to the schema's `periode` choice element and to a month window. Grounded in
 * the committed schema (`db/reference/skatt/mva-melding/xsd/`) and `docs/regulatory/mva-melding.md`,
 * never memorised enum spelling.
 *
 * Saldo wires the **annual** term today (the ledger's fiscal period is year-level); the bimonthly terms
 * are encoded here so the generator is ready when a per-voucher document date lands.
 */

/** A bimonthly term (1–6) or the annual term. */
export type MvaTerm =
  | { readonly kind: 'bimonthly'; readonly term: 1 | 2 | 3 | 4 | 5 | 6 }
  | {
      readonly kind: 'annual';
    };

/** The annual term singleton. */
export const ANNUAL_TERM: MvaTerm = { kind: 'annual' };

/** The six bimonthly terms, in order. */
export const BIMONTHLY_TERMS: readonly MvaTerm[] = [1, 2, 3, 4, 5, 6].map((t) => ({
  kind: 'bimonthly',
  term: t as 1 | 2 | 3 | 4 | 5 | 6,
}));

/**
 * The schema enum value for the term's `periode` choice — `skattleggingsperiodeToMaaneder` for a
 * bimonthly term (e.g. `mars-april`), `skattleggingsperiodeAar` = `aarlig` for the annual term. The
 * caller writes it under the matching element name (see {@link periodElementName}).
 */
const BIMONTHLY_PERIODE: Record<number, string> = {
  1: 'januar-februar',
  2: 'mars-april',
  3: 'mai-juni',
  4: 'juli-august',
  5: 'september-oktober',
  6: 'november-desember',
};

export function periodeValue(term: MvaTerm): string {
  return term.kind === 'annual' ? 'aarlig' : BIMONTHLY_PERIODE[term.term]!;
}

/** The XSD element name inside `<periode>` for the term's choice branch. */
export function periodElementName(term: MvaTerm): string {
  return term.kind === 'annual' ? 'skattleggingsperiodeAar' : 'skattleggingsperiodeToMaaneder';
}

/** The inclusive month window [from, to] (1-based) the term covers — the annual term is the full year. */
export function termMonths(term: MvaTerm): {
  readonly fromMonth: number;
  readonly toMonth: number;
} {
  if (term.kind === 'annual') return { fromMonth: 1, toMonth: 12 };
  const fromMonth = term.term * 2 - 1;
  return { fromMonth, toMonth: fromMonth + 1 };
}

/** A stable, human-legible key for the term within a year — `2026-T3` or `2026-aar`. */
export function termKey(term: MvaTerm): string {
  return term.kind === 'annual' ? 'aar' : `T${term.term}`;
}
