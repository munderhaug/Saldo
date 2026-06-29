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
