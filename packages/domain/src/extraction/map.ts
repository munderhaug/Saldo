/**
 * Map a validated vision-LLM extraction to a propose-only voucher draft. Pure and total — every
 * rejection (foreign currency, a non-positive net) is a typed result, not a throw — so it runs
 * identically in the browser (instant preview) and in the server action (the truth). It does not
 * touch I/O, the clock, or the ledger; the human confirms the result, which then posts through the
 * existing `recordManualVoucher` path where the rules engine gates it (ADR 0002 / ADR 0034).
 *
 * The standard MVA rate is resolved from the cited rate table (never a memorised literal), exactly as
 * `deriveStandard*` does — so the "looks standard?" signal and the eventual posting agree on 25 %.
 */
import { eqØre, mulRate, ZERO, type Rate } from '../money/ore.js';
import { rateForCategory } from '../saft/rates.js';
import type { ExtractionFields, ExtractionMapResult, ProposedKind } from './types.js';

/** The standard MVA rate (25 %), from the cited rate table — the same source `deriveStandard*` uses. */
const STANDARD_RATE: Rate = rateForCategory('regular');

/** Only NOK is postable to a NOK ledger in this slice; currency conversion is out of scope. */
const SUPPORTED_CURRENCY = 'NOK';

/** A bought document is an expense; a sold one is income — the two everyday events (ADR 0034). */
function kindFor(direction: ExtractionFields['direction']): ProposedKind {
  return direction === 'sale' ? 'income' : 'expense';
}

export function mapExtractionToProposal(fields: ExtractionFields): ExtractionMapResult {
  if (fields.currency !== SUPPORTED_CURRENCY) {
    return { ok: false, reason: 'unsupported-currency' };
  }
  // Net must be a positive figure to post — a zero/negative extraction is a slip to surface calmly.
  if (!(fields.net > ZERO)) {
    return { ok: false, reason: 'non-positive-net' };
  }

  const expectedVat = mulRate(fields.net, STANDARD_RATE);
  return {
    ok: true,
    proposal: {
      kind: kindFor(fields.direction),
      net: fields.net,
      expectedVat,
      vatLooksStandard: eqØre(fields.vat, expectedVat),
    },
  };
}
