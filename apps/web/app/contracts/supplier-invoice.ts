/**
 * Supplier invoice — boundary contract (the draft editor + the post action). Build-spec §8.5: a
 * RECEIVED supplier invoice the org records and books to accounts payable. UNLIKE a sales invoice we
 * issue, this document arrives finalised by the supplier — there is no gapless number (the supplier's
 * own invoice number is a free-text reference) and no issue lifecycle; it is a draft, then posted.
 *
 * Shape + format only, all-string at the boundary like `invoiceInput`: this one schema validates BOTH
 * the React-Hook-Form client values and the action's parsed FormData. An empty string means "not
 * given"; the db layer maps it to NULL and parses the money/quantity/date fields. Money is parsed to
 * integer øre via the domain `parseKroner` (never float math). The per-line input-VAT fork and the
 * output-code-is-not-a-purchase gate are enforced server-side against the committed SAF-T list — this
 * contract only checks shape, never authorises a VAT treatment.
 *
 * The supplier snapshot (name, org-nr) is PERSONAL DATA when the supplier is an ENK / private person —
 * tagged `// personal` for the data-handling audit, exactly like `invoice.ts`.
 */
import { z } from 'zod';
import { NON_DEDUCTIBLE_REASONS, parseKroner } from '@saldo/domain';
import { optionalOrgNrShape } from './org-nr';
import { parseQuantity } from './invoice';

/** True for '' (not given) or a syntactically valid uuid — an optional reference submits ''. */
const blankOrUuid = (value: string) => value === '' || z.string().uuid().safeParse(value).success;

/** True for '' (not given) or an ISO calendar date (YYYY-MM-DD) — the date inputs submit either. */
const blankOrIsoDate = (value: string) => value === '' || /^\d{4}-\d{2}-\d{2}$/.test(value);

/** '' (deductible) or one of the statutory non-deductible reasons (§4.3) — the line's deduction fork. */
const blankOrReason = (value: string) =>
  value === '' || (NON_DEDUCTIBLE_REASONS as readonly string[]).includes(value);

/**
 * One supplier-invoice line. Account + VAT code are required (a purchase line books to a cost account
 * at a SAF-T input/reverse-charge code); both are same-org composite FKs the db layer pins to the
 * tenant. `nonDeductibleReason` is '' for an ordinary deductible line, or the recorded reason that
 * makes its input VAT non-deductible (representasjon / restricted_vehicle / private_use) — the db layer
 * derives the `deductible` flag from it.
 */
const supplierInvoiceLineInput = z.object({
  description: z.string().trim().min(1, 'Skriv hva linjen gjelder').max(500),
  quantity: z
    .string()
    .trim()
    .refine(
      (v) => parseQuantity(v) !== null && parseQuantity(v)! > 0,
      'Antall må være større enn 0',
    ),
  unit: z.string().trim().min(1, 'Skriv en enhet, for eksempel «stk» eller «time»').max(32),
  // Net unit price (excl. VAT) in kroner; '' means 0. Parsed to øre in the db layer.
  unitPriceKr: z
    .string()
    .trim()
    .refine(
      (v) => v === '' || parseKroner(v) !== null,
      'Skriv en gyldig pris, for eksempel 1 250,00',
    ),
  accountId: z.string().uuid('Velg en konto for linjen'),
  vatCodeId: z.string().uuid('Velg en MVA-kode for linjen'),
  nonDeductibleReason: z.string().refine(blankOrReason, 'Ugyldig fradragsgrunn'),
});

export const supplierInvoiceInput = z.object({
  // Optional link to a contact; the snapshot below is authoritative and frozen on posting regardless.
  supplierId: z.string().refine(blankOrUuid, 'Ugyldig leverandør'),
  supplierName: z.string().trim().min(1, 'Skriv leverandørens navn').max(200), // personal
  // personal: an ENK's / private person's org-nr identifies a natural person.
  supplierOrgNr: optionalOrgNrShape,
  // The supplier's own invoice number (a free-text reference, NOT our gapless counter) + their KID.
  supplierInvoiceNumber: z.string().trim().max(64),
  kid: z.string().trim().max(40),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, 'Valuta må være en tre-bokstavs kode (ISO 4217)'),
  invoiceDate: z.string().trim().refine(blankOrIsoDate, 'Ugyldig dato'),
  dueDate: z.string().trim().refine(blankOrIsoDate, 'Ugyldig dato'),
  notes: z.string().trim().max(2000), // personal: free text, may describe a natural person
  lines: z
    .array(supplierInvoiceLineInput)
    .min(1, 'En leverandørfaktura må ha minst én linje')
    .max(200),
});

export type SupplierInvoiceInput = z.infer<typeof supplierInvoiceInput>;
