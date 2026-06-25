/**
 * Zod schemas — the single source of truth for shapes at every boundary (form input, action
 * input, integration payloads). Infer types from these; do not declare parallel interfaces.
 *
 * The per-feature contract modules are re-exported here; the shared dev-auth credentials input
 * lives below. Org-number shape validation lives in its consuming contract (`organization.ts`).
 */
import { z } from 'zod';

// Per-feature contract modules.
export * from './enhetsregisteret';
export * from './organization';
export * from './contact';
export * from './voucher';
export * from './receipt-extraction';

/** Email + password for the dev auth provider (production login is BankID via OIDC, no password). */
export const credentialsInput = z.object({
  email: z.string().trim().toLowerCase().pipe(z.string().email('Ugyldig e-postadresse')),
  password: z.string().min(8, 'Passordet må være minst 8 tegn'),
});
