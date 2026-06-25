/**
 * KID — customer identification number on Norwegian payments. Norwegian KIDs use either a
 * mod10 (Luhn) or mod11 control digit, configured per issuer. We default to mod10 here and
 * expose mod11 explicitly; the issuer's scheme is chosen at construction.
 */

export type Kid = string & { readonly __brand: 'kid' };

export type KidScheme = 'mod10' | 'mod11';

/** mod10 (Luhn) check over the body + trailing control digit. */
export function isValidKidMod10(value: string): boolean {
  if (!/^\d{2,25}$/.test(value)) return false;
  let sum = 0;
  let double = true; // rightmost body digit (the one before control) is doubled
  for (let i = value.length - 2; i >= 0; i--) {
    let d = Number(value[i]!);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  const control = (10 - (sum % 10)) % 10;
  return control === Number(value[value.length - 1]!);
}

/** mod11 check (weights 2..7 repeating, right to left over the body). */
export function isValidKidMod11(value: string): boolean {
  if (!/^\d{2,25}$/.test(value)) return false;
  let sum = 0;
  let weight = 2;
  for (let i = value.length - 2; i >= 0; i--) {
    sum += Number(value[i]!) * weight;
    weight = weight === 7 ? 2 : weight + 1;
  }
  const remainder = sum % 11;
  const control = remainder === 0 ? 0 : 11 - remainder;
  if (control === 10) return false;
  return control === Number(value[value.length - 1]!);
}

export function isValidKid(value: string, scheme: KidScheme = 'mod10'): boolean {
  return scheme === 'mod10' ? isValidKidMod10(value) : isValidKidMod11(value);
}

/** Construct a {@link Kid}, throwing if the control digit is invalid for the scheme. */
export function kid(value: string, scheme: KidScheme = 'mod10'): Kid {
  if (!isValidKid(value, scheme)) {
    throw new RangeError(`Invalid KID (${scheme}): ${value}`);
  }
  return value as Kid;
}

/**
 * Append a mod10 (Luhn) control digit to a numeric body, returning a valid {@link Kid}. The inverse
 * of {@link isValidKidMod10}: `isValidKidMod10(withMod10ControlDigit(body))` always holds. Used to
 * mint a deterministic per-invoice KID from the gapless invoice number (see `invoice/invoice.ts`).
 */
export function withMod10ControlDigit(body: string): Kid {
  if (!/^\d{1,24}$/.test(body)) {
    throw new RangeError(`KID body must be 1–24 digits, got "${body}"`);
  }
  let sum = 0;
  let double = true; // the rightmost body digit is doubled (the control digit will sit to its right)
  for (let i = body.length - 1; i >= 0; i--) {
    let d = Number(body[i]!);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  const control = (10 - (sum % 10)) % 10;
  return `${body}${control}` as Kid;
}
