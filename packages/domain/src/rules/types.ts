/**
 * The rules engine contract. Concrete rules (input-VAT fork, non-deductible cases, valid
 * account↔VAT-code combinations, reverse-charge dual posting) are implemented in Phase 2 and
 * live under src/rules/. Every proposed posting — human or AI-originated — passes through here
 * before it can be committed (ADR 0002).
 */
import type { Voucher } from '../posting/types.js';

export type Severity = 'error' | 'warning';

export interface RuleViolation {
  readonly rule: string;
  readonly severity: Severity;
  readonly message: string;
}

export interface RuleResult {
  readonly ok: boolean; // false if any `error`-severity violation is present
  readonly violations: readonly RuleViolation[];
}

export interface Rule {
  readonly name: string;
  evaluate(voucher: Voucher): readonly RuleViolation[];
}

/** Run a set of rules; `ok` is false when any error-severity violation is found. */
export function runRules(rules: readonly Rule[], voucher: Voucher): RuleResult {
  const violations = rules.flatMap((r) => r.evaluate(voucher));
  return {
    ok: !violations.some((v) => v.severity === 'error'),
    violations,
  };
}
