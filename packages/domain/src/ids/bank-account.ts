/**
 * Norwegian bank account number — an 11-digit BBAN (kontonummer) with a mod11 control digit, or a
 * Norwegian IBAN ("NO" + two ISO-7064 check digits + the 11-digit BBAN). This is the payout account a
 * customer pays an invoice into (the EHF `cac:PayeeFinancialAccount`), so a transposed digit sends
 * money astray — it is validated, never trusted. Mirrors `isValidOrgNr` / `isValidKid`.
 */

const BBAN_WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2] as const;

/** mod11 control-digit check on an 11-digit Norwegian BBAN (kontonummer). */
function isValidBban(digits: string): boolean {
  if (!/^\d{11}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    // Safe: regex guarantees 11 digits, loop bounded to 10.
    sum += Number(digits[i]) * BBAN_WEIGHTS[i]!;
  }
  const remainder = sum % 11;
  const control = remainder === 0 ? 0 : 11 - remainder;
  if (control === 10) return false; // 10 is not a valid control digit → number invalid
  return control === Number(digits[10]);
}

/** ISO 7064 mod-97-10 check on a Norwegian IBAN, including the embedded BBAN's mod11. */
function isValidNorwegianIban(value: string): boolean {
  if (!/^NO\d{13}$/.test(value)) return false;
  if (!isValidBban(value.slice(4))) return false;
  // Move the country code + check digits to the end, map letters A→10 … Z→35, then mod 97 must be 1.
  const rearranged = value.slice(4) + value.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55));
  let remainder = 0;
  for (const ch of numeric) remainder = (remainder * 10 + Number(ch)) % 97;
  return remainder === 1;
}

/**
 * True for a syntactically- and checksum-valid Norwegian payout account: an 11-digit BBAN
 * (kontonummer) or a Norwegian IBAN. Spaces and dots are stripped first (users write `1234.56.78903`).
 */
export function isValidBankAccount(value: string): boolean {
  const normalized = value.replace(/[\s.]/g, '').toUpperCase();
  return isValidBban(normalized) || isValidNorwegianIban(normalized);
}
