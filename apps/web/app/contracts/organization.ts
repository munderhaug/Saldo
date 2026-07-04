/**
 * Organisation onboarding — boundary contract (the create-org form + action input).
 *
 * Shape only: the 9-digit org number's mod11 check digit is validated in `@saldo/domain`
 * (`isValidOrgNr`) at the action boundary, the way `routes/oppslag.tsx` does — keeping this schema a
 * pure shape (build-spec §4.3). The MVA status is a
 * consequential choice (it forks all posting, hard invariant): the form proposes a default from the
 * Enhetsregisteret VAT-register flag, but the human confirms it explicitly.
 */
import { z } from 'zod';
import { MVA_STATUSES } from '@saldo/domain';
import { orgNrShape } from './org-nr';

/** A logged-in person creating an org: 9-digit org-nr (spaces stripped), a name, and an MVA status. */
export const createOrgInput = z.object({
  orgNr: orgNrShape,
  name: z.string().trim().min(1, 'Skriv navnet på foretaket').max(200),
  mvaStatus: z.enum(MVA_STATUSES),
});

export type CreateOrgInput = z.infer<typeof createOrgInput>;

/**
 * Org payout account — the settings form that populates `invoice_payment_account[_name]`, emitted as
 * the EHF `cac:PayeeFinancialAccount`. Shape + format only, all-string (mirrors `createOrgInput`): the
 * BBAN mod11 / IBAN mod-97 checksum is validated by the domain `isValidBankAccount` at the action
 * boundary, the way `createOrgInput` defers the org-nr mod11 to `isValidOrgNr`. `''` clears the column.
 */
export const orgPayoutInput = z.object({
  // personal: financial data — the account a customer pays an invoice into.
  invoicePaymentAccount: z
    .string()
    .trim()
    .refine(
      (v) => v === '' || /^[A-Z0-9 .]{8,34}$/i.test(v),
      'Skriv et gyldig konto- eller IBAN-nummer',
    ),
  // personal: an ENK's payout account is usually held in the proprietor's own (natural person's) name.
  invoicePaymentAccountName: z.string().trim().max(200),
});

export type OrgPayoutInput = z.infer<typeof orgPayoutInput>;
