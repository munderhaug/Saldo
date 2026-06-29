/**
 * Org-number (organisasjonsnummer) shape — the single source for the 9-digit boundary check shared by
 * the org / contact / invoice contracts (it had drifted into three inline copies). Shape only: the
 * mod11 check digit is validated separately in `@saldo/domain` (`isValidOrgNr`) at the action boundary
 * (build-spec §4.3), so this stays a pure shape.
 */
import { z } from 'zod';

/** One message so the consumers can't drift apart again. */
const ORG_NR_MESSAGE = 'Organisasjonsnummer må være 9 siffer';

/** Required 9-digit org-nr (spaces stripped) — the create-org form. */
export const orgNrShape = z
  .string()
  .transform((s) => s.replace(/\s/g, ''))
  .pipe(z.string().regex(/^\d{9}$/, ORG_NR_MESSAGE));

/** Optional org-nr: '' (not given) or 9 digits — a contact/customer may be a private person. */
export const optionalOrgNrShape = z
  .string()
  .trim()
  .refine((v) => v === '' || /^\d{9}$/.test(v.replace(/\s/g, '')), ORG_NR_MESSAGE);
