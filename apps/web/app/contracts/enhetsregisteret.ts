/**
 * Enhetsregisteret (Brønnøysund) Open Data API — boundary contract.
 *
 * Shape grounded in committed captures (`db/reference/brreg/`, NLOD), never model memory. We model
 * only the fields the app consumes; `z.object` strips the rest (`_links`, `historiskeNavn`,
 * `kapital`, …) at the boundary. Validated in `app/integrations/enhetsregisteret`.
 *
 * Personal-data note (`.claude/rules/data-handling.md`): an ENK's `navn`/address are frequently a
 * natural person's name + home address. Fields that can carry that are marked `// personal` so the
 * classification stays greppable.
 */
import { z } from 'zod';

/** A `{ kode, beskrivelse }` pair — `organisasjonsform`, `naeringskode1`. */
const kodeBeskrivelse = z.object({
  kode: z.string(),
  beskrivelse: z.string(),
});

/** A brreg address block. Most fields are omitted for some units, so all are optional. */
const adresse = z.object({
  land: z.string().optional(),
  landkode: z.string().optional(),
  postnummer: z.string().optional(),
  poststed: z.string().optional(),
  adresse: z.array(z.string()).optional(), // personal: an ENK's may be a home address
  kommune: z.string().optional(),
  kommunenummer: z.string().optional(),
});

/** A single registered unit (`enheter/{orgnr}`, and each search match). */
export const enhet = z.object({
  organisasjonsnummer: z.string(),
  navn: z.string(), // personal: an ENK's navn may be a natural person's name
  organisasjonsform: kodeBeskrivelse,
  /** The VAT-register flag that drives onboarding's MVA-status proposal. Omitted for some units. */
  registrertIMvaregisteret: z.boolean().optional(),
  naeringskode1: kodeBeskrivelse.optional(),
  forretningsadresse: adresse.optional(), // personal
  postadresse: adresse.optional(), // personal
  konkurs: z.boolean().optional(),
  underAvvikling: z.boolean().optional(),
  underTvangsavviklingEllerTvangsopplosning: z.boolean().optional(),
  /** Present only when the unit is deleted from the register. */
  slettedato: z.string().optional(),
});

export type Enhet = z.infer<typeof enhet>;

/** Paged search envelope (`enheter?navn=…`). `_embedded` is ABSENT when there are zero matches. */
export const enhetSearchResponse = z.object({
  _embedded: z.object({ enheter: z.array(enhet) }).optional(),
  page: z.object({
    size: z.number(),
    totalElements: z.number(),
    totalPages: z.number(),
    number: z.number(),
  }),
});

export type EnhetSearchResponse = z.infer<typeof enhetSearchResponse>;

/**
 * Free-text company-name query. Trimmed; ≥2 chars (avoid hammering the API) and ≤200 (cap the
 * outbound query so an unauthenticated GET can't forward a multi-kilobyte string to brreg).
 */
export const nameSearchInput = z
  .string()
  .trim()
  .min(2, 'Skriv minst to tegn for å søke på navn')
  .max(200);

export type NameSearchInput = z.infer<typeof nameSearchInput>;
