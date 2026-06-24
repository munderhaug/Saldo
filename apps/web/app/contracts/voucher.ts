/**
 * Manual voucher entry — boundary contract (the record-income/expense form + action input).
 *
 * Shape + format only (mirroring `createOrgInput`): the kind is one of the two everyday events, and
 * the amount is a non-negative kroner string validated by the domain's integer-safe `parseKroner`
 * (the same parser the action then uses to build `Øre`). VAT treatment is NOT a form field — it is
 * derived server-side from the org's `mva_status` (the hard invariant that status drives posting), so
 * no SAF-T VAT-code jargon reaches the surface (experience-voice: no jargon the user didn't choose).
 */
import { z } from 'zod';
import { parseKroner } from '@saldo/domain';

/** The two everyday economic events this first posting surface records. */
export const VOUCHER_KINDS = ['income', 'expense'] as const;
export type VoucherKind = (typeof VOUCHER_KINDS)[number];

/** A recorded event: its kind and a positive net amount in kroner (excl. MVA when registered). */
export const manualVoucherInput = z.object({
  kind: z.enum(VOUCHER_KINDS),
  amount: z
    .string()
    .trim()
    .min(1, 'Skriv et beløp')
    .refine((value) => {
      const ore = parseKroner(value);
      return ore !== null && ore > 0;
    }, 'Skriv et gyldig beløp større enn null'),
});

export type ManualVoucherInput = z.infer<typeof manualVoucherInput>;
