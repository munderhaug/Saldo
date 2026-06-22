/**
 * Norwegian organisation number (organisasjonsnummer): 9 digits with a mod11 control digit.
 * See .claude/rules/money.md (identifiers) and the domain-model.
 */

export type OrgNr = string & { readonly __brand: 'orgNr' };

const WEIGHTS = [3, 2, 7, 6, 5, 4, 3, 2] as const;

/** Validate the mod11 control digit of a 9-digit org number. */
export function isValidOrgNr(value: string): boolean {
  const digits = value.replace(/\s/g, '');
  if (!/^\d{9}$/.test(digits)) return false;

  let sum = 0;
  for (let i = 0; i < 8; i++) {
    // Safe: regex guarantees 9 digits, loop bounded to 8.
    sum += Number(digits[i]) * WEIGHTS[i]!;
  }
  const remainder = sum % 11;
  const control = remainder === 0 ? 0 : 11 - remainder;
  if (control === 10) return false; // 10 is not a valid control digit → number invalid
  return control === Number(digits[8]);
}

/** Construct an {@link OrgNr}, throwing if the control digit is invalid. */
export function orgNr(value: string): OrgNr {
  const digits = value.replace(/\s/g, '');
  if (!isValidOrgNr(digits)) {
    throw new RangeError(`Invalid organisasjonsnummer: ${value}`);
  }
  return digits as OrgNr;
}
