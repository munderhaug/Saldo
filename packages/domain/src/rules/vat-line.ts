/**
 * The line-level VAT rule (ADR 0027), expressed against the rules-engine `Rule` contract so it
 * runs through `runRules` alongside every other rule before a voucher is committed. It closes over
 * the org's `mva_status` and the committed SAF-T code index (its construction-time context), then
 * validates each *coded* line of a proposed voucher:
 *
 * - an unknown VAT code (not on the committed SAF-T list) → **error** (codes come from the list,
 *   never memory — hard invariant);
 * - a blocked code↔status combination (output VAT / fritatt / input deduction without
 *   registration) → **error**, with the cited reason;
 * - a reverse-charge code → **warning** advisory (dual-leg correctness is `vat-reverse-charge`);
 * - a line with no VAT code (manual/bank/settlement lines) → ignored.
 *
 * The org status is the registration/default state; the per-line code carries the treatment. This
 * is what lets one org post an *unntatt* (§ 3-7) line and a taxable line in the same voucher.
 */
import type { VatCode } from '../posting/types.js';
import type { SaftTaxCode } from '../saft/tax-codes.js';
import { checkVatLine, type VatLineReason } from '../vat/line-treatment.js';
import type { MvaStatus } from '../vat/status.js';
import type { Rule, RuleViolation } from './types.js';

export interface VatLineRuleContext {
  /** The org's registration/default state — the gate's status input. */
  readonly status: MvaStatus;
  /** The committed SAF-T codes, indexed (see `indexTaxCodes`). The single source for code shape. */
  readonly codes: ReadonlyMap<VatCode, SaftTaxCode>;
}

const MESSAGE: Record<VatLineReason, string> = {
  'output-vat-requires-registration':
    'Output VAT requires VAT registration; this org is not registered',
  'zero-rated-requires-registration':
    'Zero-rated (fritatt) treatment requires VAT registration; an unregistered org is exempt/outside scope, not fritatt',
  'input-deduction-requires-registration':
    'Input-VAT deduction requires VAT registration; book the gross to cost instead',
  'reverse-charge-deferred':
    'Reverse-charge code: dual-leg posting is validated by vat-reverse-charge, not yet implemented',
};

const RULE_NAME = 'vat-line-treatment';

/** Build the line-level VAT rule for one org context. Reusable across vouchers. */
export function vatLineRule(ctx: VatLineRuleContext): Rule {
  return {
    name: RULE_NAME,
    evaluate(voucher): readonly RuleViolation[] {
      const violations: RuleViolation[] = [];
      for (const lineItem of voucher.lines) {
        const { vatCode } = lineItem;
        if (vatCode === undefined) continue; // uncoded line (manual/bank) — nothing to validate
        const code = ctx.codes.get(vatCode);
        if (code === undefined) {
          violations.push({
            rule: RULE_NAME,
            severity: 'error',
            message: `Unknown VAT code "${vatCode}" — not on the committed SAF-T list`,
          });
          continue;
        }
        const verdict = checkVatLine(ctx.status, code);
        if (!verdict.ok) {
          // A block always carries a reason; the fallback keeps this fail-closed even if one ever
          // doesn't — a server-authoritative gate must never silently pass an invalid combination.
          const message =
            verdict.reason !== undefined
              ? MESSAGE[verdict.reason]
              : `VAT code "${vatCode}" is not valid for this organization's MVA status`;
          violations.push({ rule: RULE_NAME, severity: 'error', message });
        } else if (verdict.reason === 'reverse-charge-deferred') {
          violations.push({
            rule: RULE_NAME,
            severity: 'warning',
            message: MESSAGE[verdict.reason],
          });
        }
      }
      return violations;
    },
  };
}
