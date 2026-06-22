/**
 * Money is integer øre. Never `number`, never floating-point arithmetic.
 * See .claude/rules/money.md and ADR 0004.
 */

/** Branded integer øre. Construct via {@link øre}; combine via the helpers below. */
export type Øre = number & { readonly __brand: 'øre' };

/** A VAT/multiplier rate, e.g. 0.25 for 25%. Branded so it can't be confused with money. */
export type Rate = number & { readonly __brand: 'rate' };

export const ZERO: Øre = 0 as Øre;

/** Construct an {@link Øre}. Throws if not a safe integer. */
export function øre(value: number): Øre {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`Øre must be a safe integer, got ${value}`);
  }
  return value as Øre;
}

/** Construct a {@link Rate}. Throws if negative or non-finite. */
export function rate(value: number): Rate {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`Rate must be a finite, non-negative number, got ${value}`);
  }
  return value as Rate;
}

export function addØre(a: Øre, b: Øre): Øre {
  return øre(a + b);
}

export function subØre(a: Øre, b: Øre): Øre {
  return øre(a - b);
}

export function negØre(a: Øre): Øre {
  return øre(-a);
}

export function sumØre(values: readonly Øre[]): Øre {
  return values.reduce<Øre>((acc, v) => addØre(acc, v), ZERO);
}

/**
 * Round a real number of øre to an integer using Norwegian rounding:
 * **round half away from zero**. Apply ONLY at presentation/settlement boundaries.
 */
export function roundØre(value: number): Øre {
  if (!Number.isFinite(value)) {
    throw new RangeError(`Cannot round non-finite value ${value}`);
  }
  const rounded = Math.sign(value) * Math.round(Math.abs(value));
  // Normalize -0 to 0.
  return øre(rounded === 0 ? 0 : rounded);
}

/**
 * Multiply money by a rate and round once to integer øre (half away from zero).
 * This is the ONLY sanctioned way to apply a VAT rate to an amount.
 */
export function mulRate(amount: Øre, r: Rate): Øre {
  return roundØre(amount * r);
}

/** Compare helpers (avoid raw operators leaking into business code reviews). */
export function isZeroØre(a: Øre): boolean {
  return a === 0;
}

export function eqØre(a: Øre, b: Øre): boolean {
  return a === b;
}
