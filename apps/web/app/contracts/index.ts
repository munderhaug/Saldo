/**
 * Zod schemas — the single source of truth for shapes at every boundary (form input, action
 * input, integration payloads). Infer types from these; do not declare parallel interfaces.
 *
 * Example seed below; real contracts are added per feature.
 */
import { z } from 'zod';

// Per-feature contract modules.
export * from './enhetsregisteret';

/** Norwegian org number: 9 digits (mod11 validated in @saldo/domain at construction). */
export const orgNrInput = z
  .string()
  .transform((s) => s.replace(/\s/g, ''))
  .pipe(z.string().regex(/^\d{9}$/, 'Organisasjonsnummer må være 9 siffer'));

export type OrgNrInput = z.infer<typeof orgNrInput>;

/** Email + password for the dev auth provider (production login is BankID via OIDC, no password). */
export const credentialsInput = z.object({
  email: z.string().trim().toLowerCase().pipe(z.string().email('Ugyldig e-postadresse')),
  password: z.string().min(8, 'Passordet må være minst 8 tegn'),
});

export type CredentialsInput = z.infer<typeof credentialsInput>;
