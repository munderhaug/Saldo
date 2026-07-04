/**
 * Sales document — boundary contract (the draft editor + the issue/transition actions). Build-spec
 * §8.4: a sales document (quote / invoice / credit note) with per-line MVA across all rates. One
 * document carries a frozen customer snapshot and one-or-more lines; a line may be free-text/ad-hoc or
 * prefilled from a catalogue item (§8.3) and account/VAT from a contact (§8.2) — but an invoice is
 * NEVER gated behind those registers, so `customerId`/`productId` are optional and the snapshot/line
 * fields stand on their own.
 *
 * Shape + format only, all-string at the boundary like `contactInput`/`productInput`: this one schema
 * validates BOTH the React-Hook-Form client values and the action's parsed FormData. An empty string
 * means "not given"; the db layer maps it to NULL and parses the money/quantity/date fields. Money is
 * parsed to integer øre via the domain `parseKroner` (never float math); the per-line VAT HARD BLOCK
 * (an unregistered org may not charge output VAT) is enforced by the domain `checkSalesLine` in the
 * action + SQL — this contract only checks shape, never authorises VAT.
 *
 * The customer snapshot is PERSONAL DATA (an ENK / private person): name, e-mail, org-nr and address
 * are tagged `// personal` for the data-handling audit, exactly like `contact.ts`.
 */
import { z } from 'zod';
import { INVOICE_KINDS, parseKroner } from '@saldo/domain';
import { optionalOrgNrShape } from './org-nr';

/** Document language — the two Saldo ships (matches the contacts register). */
export const INVOICE_LANGUAGES = ['nb', 'en'] as const;

/** True for '' (not given) or a syntactically valid uuid — an optional reference submits ''. */
const blankOrUuid = (value: string) => value === '' || z.string().uuid().safeParse(value).success;

/** A non-negative decimal quantity ("2", "2,5", "0.75") → number, or `null` when malformed. The
 * integer part is bounded to 9 digits so quantity × price stays far inside safe-integer øre (an
 * unbounded digit run would silently lose precision through the float multiply). */
export function parseQuantity(input: string): number | null {
  const cleaned = input.replace(/\s/g, '').replace(',', '.');
  if (!/^\d{1,9}(?:\.\d{1,3})?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/** True for '' (not given) or an ISO calendar date (YYYY-MM-DD) — the date inputs submit either. */
const blankOrIsoDate = (value: string) => value === '' || /^\d{4}-\d{2}-\d{2}$/.test(value);

/** True for '' (not given) or a syntactically valid email — customerEmail is optional but, when set,
 * becomes the SMTP `to`, so it must be a real address. (The strict `email` schema in contracts/index
 * rejects '' and lowercases, which would break the optional-blank, frozen-snapshot semantics here.) */
const blankOrEmail = (value: string) => value === '' || z.string().email().safeParse(value).success;

/** One invoice line. Account + VAT code are required (a sales line posts to a revenue account at a
 * SAF-T VAT code); both are same-org composite FKs the db layer pins to the tenant. */
const invoiceLineInput = z.object({
  // Optional catalogue source — prefills the line; '' for a fully ad-hoc/free-text line.
  productId: z.string().refine(blankOrUuid, 'Ugyldig vare'),
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
});

const invoiceInputShape = z.object({
  kind: z.enum(INVOICE_KINDS),
  // Optional link to a contact; the snapshot below is authoritative and frozen on issue regardless.
  customerId: z.string().refine(blankOrUuid, 'Ugyldig kunde'),
  customerName: z.string().trim().min(1, 'Skriv kundens navn').max(200), // personal
  customerEmail: z.string().trim().max(320).refine(blankOrEmail, 'Ugyldig e-postadresse'), // personal
  // personal: an ENK's / private person's org-nr identifies a natural person.
  customerOrgNr: optionalOrgNrShape,
  customerAddress: z.string().trim().max(300), // personal: an ENK's may be a home address
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, 'Valuta må være en tre-bokstavs kode (ISO 4217)'),
  language: z.enum(INVOICE_LANGUAGES),
  issueDate: z.string().trim().refine(blankOrIsoDate, 'Ugyldig dato'),
  dueDate: z.string().trim().refine(blankOrIsoDate, 'Ugyldig dato'),
  // Credit note only: the issued invoice this document corrects (append-only correction path).
  creditsInvoiceId: z.string().refine(blankOrUuid, 'Ugyldig faktura'),
  notes: z.string().trim().max(2000), // personal: free text, may describe a natural person
  lines: z.array(invoiceLineInput).min(1, 'En faktura må ha minst én linje').max(200),
});

/** `kind` ↔ `creditsInvoiceId` are correlated: only a credit note corrects an invoice, and a credit
 * note must name one (review 2026-07-03 §9). The db layer additionally freezes both after creation. */
export const invoiceInput = invoiceInputShape.superRefine((value, ctx) => {
  if (value.kind === 'credit_note' && value.creditsInvoiceId === '') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['creditsInvoiceId'],
      message: 'En kreditnota må peke på fakturaen den retter',
    });
  }
  if (value.kind !== 'credit_note' && value.creditsInvoiceId !== '') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['creditsInvoiceId'],
      message: 'Bare en kreditnota kan peke på en faktura',
    });
  }
});

export type InvoiceInput = z.infer<typeof invoiceInput>;
