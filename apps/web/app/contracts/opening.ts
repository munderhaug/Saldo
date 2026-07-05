/**
 * Opening balance (inngående balanse) — boundary contract for the migration form (feat-opening-
 * balances). Shape + format only, mirroring `manualVoucherInput`: each curated line is a kroner
 * string validated by the domain's integer-safe `parseKroner`; an EMPTY field means "not applicable"
 * and parses to zero. Which side each line posts on is the server's designation
 * (`OPENING_ACCOUNTS`), never a form field — no debit/credit jargon reaches the surface.
 */
import { z } from 'zod';
import { parseKroner } from '@saldo/domain';

/** A stated balance: empty (skip) or a non-negative kroner amount. */
const openingAmount = z
  .string()
  .trim()
  .refine((value) => {
    if (value === '') return true;
    const ore = parseKroner(value);
    return ore !== null && ore >= 0;
  }, 'Skriv beløpet som et tall, f.eks. 12 500');

export const OPENING_FIELDS = [
  'bank',
  'receivable',
  'fixtures',
  'payable',
  'vatSettlement',
] as const;

export const openingBalanceInput = z.object({
  bank: openingAmount,
  receivable: openingAmount,
  fixtures: openingAmount,
  payable: openingAmount,
  vatSettlement: openingAmount,
});

export type OpeningBalanceInput = z.infer<typeof openingBalanceInput>;
