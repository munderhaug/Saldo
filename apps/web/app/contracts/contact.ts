/**
 * Contacts register — boundary contract (the create/edit form + action input). Build-spec §8.2:
 * customers & suppliers in ONE register, with a per-contact MVA status and per-contact defaults
 * (payment terms, default account, VAT code, currency, language).
 *
 * Shape + format only, all-string like `manualVoucherInput`/`createOrgInput`: this one schema validates
 * BOTH the React-Hook-Form client values and the action's FormData, so every field is a string or a
 * string-enum (input === output — no `.coerce`/`.default`/optional divergence to fight the resolver).
 * An empty string means "not given"; the db layer (`contacts.server`) maps it to NULL and parses the
 * numeric/role fields. The optional org-number's mod11 check digit is validated in `@saldo/domain`
 * (`isValidOrgNr`) at the action boundary, the way `routes/orgs.new.tsx` does.
 *
 * Personal-data note (`.claude/rules/data-handling.md`): a contact who is an ENK or a private person
 * carries a natural person's name, address, e-mail and phone. Every field that can hold that is marked
 * `// personal` so the classification stays greppable at the boundary.
 */
import { z } from 'zod';
import { MVA_STATUSES } from '@saldo/domain';
import { optionalOrgNrShape } from './org-nr';

/** The one register holds both kinds; a contact may be a customer, a supplier, or both. */
export const CONTACT_ROLES = ['customer', 'supplier', 'both'] as const;
export type ContactRole = (typeof CONTACT_ROLES)[number];

/** UI/document language for a contact (invoices, reminders). Saldo speaks NO first; EN is offered. */
export const CONTACT_LANGUAGES = ['nb', 'en'] as const;

/** Map the single role choice to the two storage flags, and back (for the edit form's defaults). */
export function rolesFromValue(role: ContactRole): { isCustomer: boolean; isSupplier: boolean } {
  return { isCustomer: role !== 'supplier', isSupplier: role !== 'customer' };
}
export function roleFromFlags(isCustomer: boolean, isSupplier: boolean): ContactRole {
  if (isCustomer && isSupplier) return 'both';
  return isSupplier ? 'supplier' : 'customer';
}

/** True for '' (not given) or a syntactically valid uuid — the `None` option submits ''. */
const blankOrUuid = (value: string) => value === '' || z.string().uuid().safeParse(value).success;

export const contactInput = z.object({
  name: z.string().trim().min(1, 'Skriv navnet på kontakten').max(200), // personal
  role: z.enum(CONTACT_ROLES),
  // Optional: private persons have no org-nr. '' means none; otherwise 9 digits (spaces stripped).
  // personal: an ENK's / private person's org-nr identifies a natural person.
  orgNr: optionalOrgNrShape,
  email: z.string().trim().max(320), // personal
  phone: z.string().trim().max(40), // personal
  addressLine: z.string().trim().max(200), // personal: an ENK's may be a home address
  postalCode: z.string().trim().max(16),
  city: z.string().trim().max(120),
  countryCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, 'Landkode må være to bokstaver (ISO 3166)'),
  mvaStatus: z.enum(MVA_STATUSES),
  paymentTermsDays: z
    .string()
    .trim()
    .refine(
      (v) => /^\d+$/.test(v) && Number(v) <= 365,
      'Betalingsfrist er et antall dager (0–365)',
    ),
  defaultAccountId: z.string().refine(blankOrUuid, 'Ugyldig konto'),
  defaultVatCodeId: z.string().refine(blankOrUuid, 'Ugyldig MVA-kode'),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, 'Valuta må være en tre-bokstavs kode (ISO 4217)'),
  language: z.enum(CONTACT_LANGUAGES),
  notes: z.string().trim().max(2000), // personal: free text, may describe a natural person
});

export type ContactInput = z.infer<typeof contactInput>;
