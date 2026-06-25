/**
 * Products & services catalogue — boundary contract (the create/edit form + action input). Build-spec
 * §8.3: a catalogue of goods/services, each with a default account + VAT code + unit + net price and a
 * goods/service classification. A catalogue item doubles as a reusable invoice-line template: its
 * description, unit, price, account and VAT code prefill a sales line later (§8.4), so the defaults
 * reference the org's OWN provisioned SAF-T account / VAT code (same-org composite FK, like a contact's
 * defaults), never a code hardcoded from memory.
 *
 * Shape + format only, all-string like `contactInput`/`manualVoucherInput`: this one schema validates
 * BOTH the React-Hook-Form client values and the action's FormData, so every field is a string or a
 * string-enum (input === output — no `.coerce`/`.default`/optional divergence to fight the resolver).
 * An empty string means "not given"; the db layer (`products.server`) maps it to NULL and parses the
 * price/kind fields. The net price is parsed to integer øre via `parseKroner` (the domain money
 * boundary) — never float math.
 *
 * No personal-data note here, unlike `contact.ts`: a catalogue item describes a good or service, not a
 * natural person, so no field is tagged `// personal`.
 */
import { z } from 'zod';
import { parseKroner } from '@saldo/domain';

/** Goods vs service — the §8.3 classification (relevant to place-of-supply / reporting downstream). */
export const PRODUCT_KINDS = ['goods', 'service'] as const;
export type ProductKind = (typeof PRODUCT_KINDS)[number];

/** True for '' (not given) or a syntactically valid uuid — the `None` option submits ''. */
const blankOrUuid = (value: string) => value === '' || z.string().uuid().safeParse(value).success;

export const productInput = z.object({
  name: z.string().trim().min(1, 'Skriv navnet på varen eller tjenesten').max(200),
  kind: z.enum(PRODUCT_KINDS),
  // Optional longer text that lands on the invoice line; the name is the short catalogue label.
  description: z.string().trim().max(2000),
  // Unit of measure, free text so it fits any trade (stk, time, kg, m², …). Required, defaults to stk.
  unit: z.string().trim().min(1, 'Skriv en enhet, for eksempel «stk» eller «time»').max(32),
  // Net unit price (excl. VAT) in kroner; '' is allowed and means 0. Parsed to øre in the db layer.
  unitPriceKr: z
    .string()
    .trim()
    .refine(
      (v) => v === '' || parseKroner(v) !== null,
      'Skriv en gyldig pris, for eksempel 1 250,00',
    ),
  defaultAccountId: z.string().refine(blankOrUuid, 'Ugyldig konto'),
  defaultVatCodeId: z.string().refine(blankOrUuid, 'Ugyldig MVA-kode'),
});

export type ProductInput = z.infer<typeof productInput>;
