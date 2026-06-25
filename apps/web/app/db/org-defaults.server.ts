/**
 * Shared option lists for the "org defaults" pickers — the org's provisioned kontoplan and SAF-T VAT
 * codes, read inside an already-scoped tenant transaction (RLS scopes them to the current org). Both
 * the contacts register (§8.2) and the products catalogue (§8.3) pin per-row defaults to one of these
 * rows via a same-org composite FK, so they share these queries rather than each rolling their own.
 * Server-only.
 */
import { asc } from 'drizzle-orm';
import type { OrgTx } from '../auth/middleware.js';
import { account, vatCode } from './schema.js';

/** A `{ id, number, name }` option for the default-account picker. */
export interface AccountOption {
  readonly id: string;
  readonly number: string;
  readonly name: string;
}

/** A `{ id, code, rate }` option for the default-VAT-code picker (rate drives the incl-VAT preview). */
export interface VatCodeOption {
  readonly id: string;
  readonly code: string;
  readonly rate: string;
}

/** Accounts available as a per-row default (the org's provisioned kontoplan, RLS-scoped). */
export async function listAccountOptions(tx: OrgTx): Promise<AccountOption[]> {
  return tx
    .select({ id: account.id, number: account.number, name: account.name })
    .from(account)
    .orderBy(asc(account.number));
}

/** VAT codes available as a per-row default (RLS-scoped). */
export async function listVatCodeOptions(tx: OrgTx): Promise<VatCodeOption[]> {
  return tx
    .select({ id: vatCode.id, code: vatCode.code, rate: vatCode.rate })
    .from(vatCode)
    .orderBy(asc(vatCode.code));
}
