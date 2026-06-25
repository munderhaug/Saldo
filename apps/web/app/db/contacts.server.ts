/**
 * Contacts-register queries (build-spec §8.2). Customers & suppliers in one register, read/written
 * inside an already-scoped tenant transaction (call via `withUserOrg`, which proves membership and
 * sets the RLS tenant context) — so the unfiltered reads/writes below are scoped to the current org
 * by RLS, and the same-org composite FK keeps a default account/VAT code inside this tenant. The
 * functions take the `OrgTx` handle, the `organizations.server` pattern. Server-only.
 *
 * Contact name/address/email/phone are personal data (.claude/rules/data-handling.md).
 */
import { asc, eq, sql } from 'drizzle-orm';
import type { OrgTx } from '../auth/middleware.js';
import { rolesFromValue, type ContactInput } from '../contracts/contact.js';
import { contact } from './schema.js';

// The default-picker option lists are shared with the products catalogue; re-exported here so the
// contacts routes/form keep importing them from `~/db/contacts.server` unchanged.
export {
  listAccountOptions,
  listVatCodeOptions,
  type AccountOption,
  type VatCodeOption,
} from './org-defaults.server.js';

/** Row shape for the register list — the everyday columns, no defaults clutter. */
export interface ContactListRow {
  readonly id: string;
  readonly name: string;
  readonly isCustomer: boolean;
  readonly isSupplier: boolean;
  readonly orgNr: string | null;
  readonly mvaStatus: string;
  readonly city: string | null;
}

/** The full detail of one contact (the edit form's load + the detail view). */
export interface ContactDetail extends ContactListRow {
  readonly email: string | null;
  readonly phone: string | null;
  readonly addressLine: string | null;
  readonly postalCode: string | null;
  readonly countryCode: string;
  readonly paymentTermsDays: number;
  readonly defaultAccountId: string | null;
  readonly defaultVatCodeId: string | null;
  readonly currency: string;
  readonly language: string;
  readonly notes: string | null;
}

/** List this tenant's contacts, alphabetical by name (RLS scopes to the current org). */
export async function listContacts(tx: OrgTx): Promise<ContactListRow[]> {
  return tx
    .select({
      id: contact.id,
      name: contact.name,
      isCustomer: contact.isCustomer,
      isSupplier: contact.isSupplier,
      orgNr: contact.orgNr,
      mvaStatus: contact.mvaStatus,
      city: contact.city,
    })
    .from(contact)
    .orderBy(asc(contact.name));
}

/** Read one contact by id, scoped to the current org. `null` when it does not exist for this tenant. */
export async function readContact(tx: OrgTx, contactId: string): Promise<ContactDetail | null> {
  const [row] = await tx.select().from(contact).where(eq(contact.id, contactId)).limit(1);
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    isCustomer: row.isCustomer,
    isSupplier: row.isSupplier,
    orgNr: row.orgNr,
    mvaStatus: row.mvaStatus,
    city: row.city,
    email: row.email,
    phone: row.phone,
    addressLine: row.addressLine,
    postalCode: row.postalCode,
    countryCode: row.countryCode,
    paymentTermsDays: row.paymentTermsDays,
    defaultAccountId: row.defaultAccountId,
    defaultVatCodeId: row.defaultVatCodeId,
    currency: row.currency,
    language: row.language,
    notes: row.notes,
  };
}

/** '' (the form's "not given") becomes NULL; everything else is the trimmed string. */
const nullable = (value: string): string | null => (value === '' ? null : value);

/** Map a validated (all-string) contract to the column values: '' → NULL, role → flags, days → int. */
function toColumns(organizationId: string, input: ContactInput) {
  const { isCustomer, isSupplier } = rolesFromValue(input.role);
  return {
    organizationId,
    name: input.name,
    isCustomer,
    isSupplier,
    orgNr: nullable(input.orgNr.replace(/\s/g, '')),
    email: nullable(input.email),
    phone: nullable(input.phone),
    addressLine: nullable(input.addressLine),
    postalCode: nullable(input.postalCode),
    city: nullable(input.city),
    countryCode: input.countryCode,
    mvaStatus: input.mvaStatus,
    paymentTermsDays: Number(input.paymentTermsDays),
    defaultAccountId: nullable(input.defaultAccountId),
    defaultVatCodeId: nullable(input.defaultVatCodeId),
    currency: input.currency,
    language: input.language,
    notes: nullable(input.notes),
  };
}

/** Create a contact for the current org; returns the new id. RLS WITH CHECK pins it to this tenant. */
export async function createContact(
  tx: OrgTx,
  organizationId: string,
  input: ContactInput,
): Promise<string> {
  const [row] = await tx
    .insert(contact)
    .values(toColumns(organizationId, input))
    .returning({ id: contact.id });
  return row!.id;
}

/**
 * Update a contact in place (it is mutable reference data, not the append-only ledger). RLS keeps the
 * UPDATE scoped to the current org; an id from another tenant matches no rows. Returns whether a row
 * was changed (false ⇒ not found for this tenant).
 */
export async function updateContact(
  tx: OrgTx,
  organizationId: string,
  contactId: string,
  input: ContactInput,
): Promise<boolean> {
  const updated = await tx
    .update(contact)
    .set({ ...toColumns(organizationId, input), updatedAt: sql`now()` })
    .where(eq(contact.id, contactId))
    .returning({ id: contact.id });
  return updated.length > 0;
}
