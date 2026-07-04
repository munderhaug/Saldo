/**
 * Owner-economy events — boundary contract (the privatøkonomi form + post action). Build-spec §8.5:
 * for a sole proprietorship (ENK) the owner and the business are not separate persons, so three
 * everyday events post through the ledger as equity movements, NOT payroll:
 *  - **drawing** (privatuttak) — the owner takes cash out (equity down, bank down);
 *  - **outlay** (utlegg) — the owner paid a business cost from private funds (cost up, equity up),
 *    at the org's standard input-VAT fork (status-driven, like the manual voucher);
 *  - **mileage** (kjøregodtgjørelse) / **diett** (subsistence) — a tax-free allowance the business
 *    books to the owner as a deduction (cost up, equity up), no VAT.
 *
 * Shape + format only, all-string like `manualVoucherInput`: VAT treatment is NOT a field — it is
 * derived server-side from the org's `mva_status` (the hard invariant). The amount is a positive net
 * kroner string validated by the domain's integer-safe `parseKroner` (the same parser the action uses
 * to build `Øre`).
 */
import { z } from 'zod';
import { parseKroner } from '@saldo/domain';

/** The four owner-economy events this surface records (English ids; the UI speaks Norwegian). */
export const OWNER_EVENT_KINDS = ['drawing', 'outlay', 'mileage', 'diett'] as const;
export type OwnerEventKind = (typeof OWNER_EVENT_KINDS)[number];

/** A recorded owner event: its kind and a positive amount in kroner (net, excl. MVA when registered). */
export const ownerEventInput = z.object({
  kind: z.enum(OWNER_EVENT_KINDS),
  amount: z
    .string()
    .trim()
    .min(1, 'Skriv et beløp')
    .refine((value) => {
      const ore = parseKroner(value);
      return ore !== null && ore > 0;
    }, 'Skriv et gyldig beløp større enn null'),
});

export type OwnerEventInput = z.infer<typeof ownerEventInput>;
