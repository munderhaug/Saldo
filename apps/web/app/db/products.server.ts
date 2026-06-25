/**
 * Products-catalogue queries (build-spec §8.3). Goods/services with a default account + VAT code +
 * unit + net price, read/written inside an already-scoped tenant transaction (call via `withUserOrg`,
 * which proves membership and sets the RLS tenant context) — so the unfiltered reads/writes below are
 * scoped to the current org by RLS, and the same-org composite FK keeps a default account/VAT code
 * inside this tenant. The functions take the `OrgTx` handle, the `contacts.server` pattern. Server-only.
 *
 * The net price crosses the boundary as integer øre (money.md): the action parses the user's kroner
 * string with the domain `parseKroner`, never float math. A catalogue item describes a good/service,
 * not a natural person — no personal data here.
 */
import { asc, eq, sql } from 'drizzle-orm';
import { parseKroner } from '@saldo/domain';
import type { OrgTx } from '../auth/middleware.js';
import type { ProductInput } from '../contracts/product.js';
import { product } from './schema.js';

// The default-picker option lists are shared with the contacts register.
export {
  listAccountOptions,
  listVatCodeOptions,
  type AccountOption,
  type VatCodeOption,
} from './org-defaults.server.js';

/** Row shape for the catalogue list — the everyday columns, no defaults clutter. */
export interface ProductListRow {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly unit: string;
  readonly unitPriceOre: number;
}

/** The full detail of one item (the edit form's load + the detail view). */
export interface ProductDetail extends ProductListRow {
  readonly description: string | null;
  readonly defaultAccountId: string | null;
  readonly defaultVatCodeId: string | null;
}

/** List this tenant's catalogue items, alphabetical by name (RLS scopes to the current org). */
export async function listProducts(tx: OrgTx): Promise<ProductListRow[]> {
  return tx
    .select({
      id: product.id,
      name: product.name,
      kind: product.kind,
      unit: product.unit,
      unitPriceOre: product.unitPriceOre,
    })
    .from(product)
    .orderBy(asc(product.name));
}

/** Read one item by id, scoped to the current org. `null` when it does not exist for this tenant. */
export async function readProduct(tx: OrgTx, productId: string): Promise<ProductDetail | null> {
  const [row] = await tx.select().from(product).where(eq(product.id, productId)).limit(1);
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    unit: row.unit,
    unitPriceOre: row.unitPriceOre,
    description: row.description,
    defaultAccountId: row.defaultAccountId,
    defaultVatCodeId: row.defaultVatCodeId,
  };
}

/** '' (the form's "not given") becomes NULL; everything else is the trimmed string. */
const nullable = (value: string): string | null => (value === '' ? null : value);

/** Map a validated (all-string) contract to the column values: '' → NULL, kroner → øre. */
function toColumns(organizationId: string, input: ProductInput) {
  // The contract already proved the price parses (or is blank → 0); re-parse here and fall back to 0.
  const unitPriceOre = input.unitPriceKr === '' ? 0 : (parseKroner(input.unitPriceKr) ?? 0);
  return {
    organizationId,
    kind: input.kind,
    name: input.name,
    description: nullable(input.description),
    unit: input.unit,
    unitPriceOre,
    defaultAccountId: nullable(input.defaultAccountId),
    defaultVatCodeId: nullable(input.defaultVatCodeId),
  };
}

/** Create a catalogue item for the current org; returns the new id. RLS WITH CHECK pins the tenant. */
export async function createProduct(
  tx: OrgTx,
  organizationId: string,
  input: ProductInput,
): Promise<string> {
  const [row] = await tx
    .insert(product)
    .values(toColumns(organizationId, input))
    .returning({ id: product.id });
  return row!.id;
}

/**
 * Update an item in place (it is mutable reference data, not the append-only ledger). RLS keeps the
 * UPDATE scoped to the current org; an id from another tenant matches no rows. Returns whether a row
 * was changed (false ⇒ not found for this tenant).
 */
export async function updateProduct(
  tx: OrgTx,
  organizationId: string,
  productId: string,
  input: ProductInput,
): Promise<boolean> {
  const updated = await tx
    .update(product)
    .set({ ...toColumns(organizationId, input), updatedAt: sql`now()` })
    .where(eq(product.id, productId))
    .returning({ id: product.id });
  return updated.length > 0;
}
