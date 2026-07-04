/**
 * Supplier-invoice queries (build-spec §8.5). The accounts-payable side of purchases: a RECEIVED
 * supplier invoice the org records and books to the ledger. Read/written inside an already-scoped
 * tenant transaction (call via `withUserOrg`, which proves membership and sets the RLS tenant context),
 * so the unfiltered reads/writes below are scoped to the current org by RLS, and the same-org composite
 * FKs keep every reference (supplier, line account/VAT code, posting voucher) inside this tenant.
 * Server-only.
 *
 * The money/VAT is DERIVED here by the PURE domain (`lineNet` / `derivePurchaseInvoice`), never trusted
 * from the client: the per-line input-VAT fork by MVA status (the hard invariant) and the dual-leg
 * reverse charge are owned by `@saldo/domain`, the same engine the manual/receipt paths use. UNLIKE a
 * sales invoice we issue, this document draws NO gapless number (the supplier's own number is a
 * free-text reference) and has no issue lifecycle — it is a `draft`, then `posted` when its AP voucher
 * is booked atomically; from there it is immutable in SQL (the posted trigger), so corrections are a
 * motbilag, never an edit.
 */
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import {
  addØre,
  deductsInputVat,
  derivePurchaseInvoice,
  isLineInputVatDeductible,
  lineNet,
  mulRate,
  parseKroner,
  quantity as toQuantity,
  rateForCategory,
  reverseChargeInputDeductible,
  reverseChargeKind,
  runRules,
  sumØre,
  vatLineRule,
  ZERO,
  øre,
  type AccountNo,
  type MvaStatus,
  type NonDeductibleReason,
  type Øre,
  type PurchaseInvoiceLine,
  type SaftTaxCode,
  type VatCode,
  type Voucher,
} from '@saldo/domain';
import type { OrgTx } from '../auth/middleware.js';
import type { SupplierInvoiceInput } from '../contracts/supplier-invoice.js';
import { parseQuantity } from '../contracts/invoice.js';
import {
  account,
  contact,
  organization,
  posting,
  supplierInvoice,
  supplierInvoiceLine,
  vatCode,
  voucher,
} from './schema.js';
import { STANDARD_TAX_CODE_INDEX } from './provisioning.server.js';
import {
  REVERSE_CHARGE_ACCOUNTS,
  REVERSE_CHARGE_OUTPUT_CODES,
  SUPPLIER_INVOICE_ACCOUNTS,
  ensureFiscalPeriod,
} from './posting.server.js';

/** '' (the form's "not given") becomes NULL; everything else is the trimmed string. */
const nullable = (value: string): string | null => (value === '' ? null : value);

// ── Read models ───────────────────────────────────────────────────────────────────────────────────

/** Row shape for the supplier-invoice list — the everyday columns. */
export interface SupplierInvoiceListRow {
  readonly id: string;
  readonly status: string;
  readonly supplierName: string;
  readonly supplierInvoiceNumber: string | null;
  readonly invoiceDate: string | null;
  readonly dueDate: string | null;
  readonly grossOre: number;
  readonly currency: string;
}

/** One line of a supplier invoice, as stored (amounts already derived and frozen). */
interface SupplierInvoiceLineDetail {
  readonly id: string;
  readonly lineNo: number;
  readonly description: string;
  readonly quantity: string;
  readonly unit: string;
  readonly unitPriceOre: number;
  readonly accountId: string;
  readonly vatCodeId: string;
  readonly deductible: boolean;
  readonly nonDeductibleReason: string | null;
  readonly netOre: number;
  readonly vatOre: number;
}

/** The full detail of one supplier invoice (the detail view + the draft editor's load). */
export interface SupplierInvoiceDetail {
  readonly id: string;
  readonly status: string;
  readonly supplierId: string | null;
  readonly supplierName: string;
  readonly supplierOrgNr: string | null;
  readonly supplierInvoiceNumber: string | null;
  readonly kid: string | null;
  readonly currency: string;
  readonly invoiceDate: string | null;
  readonly dueDate: string | null;
  readonly netOre: number;
  readonly vatOre: number;
  readonly grossOre: number;
  readonly notes: string | null;
  readonly lines: readonly SupplierInvoiceLineDetail[];
}

/** List this tenant's supplier invoices, newest first (RLS scopes to the current org). */
export async function listSupplierInvoices(tx: OrgTx): Promise<SupplierInvoiceListRow[]> {
  return tx
    .select({
      id: supplierInvoice.id,
      status: supplierInvoice.status,
      supplierName: supplierInvoice.supplierName,
      supplierInvoiceNumber: supplierInvoice.supplierInvoiceNumber,
      invoiceDate: supplierInvoice.invoiceDate,
      dueDate: supplierInvoice.dueDate,
      grossOre: supplierInvoice.grossOre,
      currency: supplierInvoice.currency,
    })
    .from(supplierInvoice)
    .orderBy(desc(supplierInvoice.createdAt));
}

/** Read one supplier invoice with its lines, scoped to the current org. `null` when absent. */
export async function readSupplierInvoice(
  tx: OrgTx,
  supplierInvoiceId: string,
): Promise<SupplierInvoiceDetail | null> {
  const [row] = await tx
    .select()
    .from(supplierInvoice)
    .where(eq(supplierInvoice.id, supplierInvoiceId))
    .limit(1);
  if (!row) return null;
  const lines = await tx
    .select()
    .from(supplierInvoiceLine)
    .where(eq(supplierInvoiceLine.supplierInvoiceId, supplierInvoiceId))
    .orderBy(asc(supplierInvoiceLine.lineNo));
  return {
    id: row.id,
    status: row.status,
    supplierId: row.supplierId,
    supplierName: row.supplierName,
    supplierOrgNr: row.supplierOrgNr,
    supplierInvoiceNumber: row.supplierInvoiceNumber,
    kid: row.kid,
    currency: row.currency,
    invoiceDate: row.invoiceDate,
    dueDate: row.dueDate,
    netOre: row.netOre,
    vatOre: row.vatOre,
    grossOre: row.grossOre,
    notes: row.notes,
    lines: lines.map((l) => ({
      id: l.id,
      lineNo: l.lineNo,
      description: l.description,
      quantity: l.quantity,
      unit: l.unit,
      unitPriceOre: l.unitPriceOre,
      accountId: l.accountId,
      vatCodeId: l.vatCodeId,
      deductible: l.deductible,
      nonDeductibleReason: l.nonDeductibleReason,
      netOre: l.netOre,
      vatOre: l.vatOre,
    })),
  };
}

// ── Derivation (the domain VAT engine, server-authoritative) ────────────────────────────────────────

/** Why preparing a supplier invoice failed — a non-purchase VAT code, or an unknown one. */
type SupplierPrepareError = 'output-code-not-a-purchase' | 'unknown-vat-code';

interface PreparedLine {
  readonly lineNo: number;
  readonly description: string;
  readonly quantity: string;
  readonly unit: string;
  readonly unitPriceOre: Øre;
  readonly accountId: string;
  readonly vatCodeId: string;
  readonly deductible: boolean;
  readonly nonDeductibleReason: string | null;
  readonly netOre: Øre;
  readonly vatOre: Øre;
}

type Prepared =
  | {
      readonly ok: true;
      readonly lines: readonly PreparedLine[];
      readonly net: Øre;
      readonly vat: Øre;
      readonly gross: Øre;
    }
  | { readonly ok: false; readonly error: SupplierPrepareError };

/** The current org's MVA status (RLS scopes `organization` to exactly the current tenant). */
async function currentOrgStatus(tx: OrgTx): Promise<MvaStatus> {
  const [row] = await tx.select({ mvaStatus: organization.mvaStatus }).from(organization).limit(1);
  return row!.mvaStatus as MvaStatus;
}

/**
 * Derive every line's net/VAT from the domain and enforce the per-line purchase gate. A line's VAT code
 * must NOT be an output code (a purchase never carries output VAT — that rejects the pure output codes
 * AND the domestic reverse-charge SALE code 51). A reverse-charge purchase line invoices NO VAT (the
 * supplier never charges it), so its document VAT is 0 — the self-accounted legs are a ledger artifact
 * posted later, not part of what the supplier billed. The whole document is refused if any line is
 * blocked.
 */
function prepareLines(input: SupplierInvoiceInput, codeById: Map<string, string>): Prepared {
  const prepared: PreparedLine[] = [];
  for (const [i, line] of input.lines.entries()) {
    const code = codeById.get(line.vatCodeId);
    const saft: SaftTaxCode | undefined = code
      ? STANDARD_TAX_CODE_INDEX.get(code as SaftTaxCode['code'])
      : undefined;
    if (!saft) return { ok: false, error: 'unknown-vat-code' };
    if (saft.direction === 'output') return { ok: false, error: 'output-code-not-a-purchase' };

    const unitPrice = line.unitPriceKr === '' ? øre(0) : parseKroner(line.unitPriceKr);
    const qtyNum = parseQuantity(line.quantity);
    if (unitPrice === null || qtyNum === null) {
      // Unreachable: the contract already validated these strings parse. Fail loud on an invariant breach.
      throw new Error(
        'supplier invoice prepare: unparseable price/quantity (the contract should reject this)',
      );
    }

    const net = lineNet(unitPrice, toQuantity(qtyNum));
    const isReverseCharge = saft.reverseCharge; // direction 'output' already rejected above
    const vat = isReverseCharge ? ZERO : mulRate(net, rateForCategory(saft.rateCategory));
    const reason = nullable(line.nonDeductibleReason);

    prepared.push({
      lineNo: i + 1,
      description: line.description,
      quantity: String(qtyNum),
      unit: line.unit,
      unitPriceOre: unitPrice,
      accountId: line.accountId,
      vatCodeId: line.vatCodeId,
      deductible: reason === null,
      nonDeductibleReason: reason,
      netOre: net,
      vatOre: vat,
    });
  }
  const net = sumØre(prepared.map((p) => p.netOre));
  const vat = sumØre(prepared.map((p) => p.vatOre));
  return { ok: true, lines: prepared, net, vat, gross: addØre(net, vat) };
}

/** Resolve the org's VAT-code ids to their committed SAF-T codes, then prepare the lines. */
async function prepareSupplierInvoice(tx: OrgTx, input: SupplierInvoiceInput): Promise<Prepared> {
  const vatRows = await tx.select({ id: vatCode.id, code: vatCode.code }).from(vatCode);
  const codeById = new Map(vatRows.map((r) => [r.id, r.code]));
  return prepareLines(input, codeById);
}

/** Header column values for create + update ('' → NULL; org-nr compacted). */
function headerColumns(organizationId: string, input: SupplierInvoiceInput) {
  return {
    organizationId,
    supplierId: nullable(input.supplierId),
    supplierName: input.supplierName,
    supplierOrgNr: nullable(input.supplierOrgNr.replace(/\s/g, '')),
    supplierInvoiceNumber: nullable(input.supplierInvoiceNumber),
    kid: nullable(input.kid),
    currency: input.currency,
    invoiceDate: nullable(input.invoiceDate),
    dueDate: nullable(input.dueDate),
    notes: nullable(input.notes),
  };
}

async function insertLines(
  tx: OrgTx,
  organizationId: string,
  supplierInvoiceId: string,
  lines: readonly PreparedLine[],
): Promise<void> {
  await tx.insert(supplierInvoiceLine).values(
    lines.map((l) => ({
      organizationId,
      supplierInvoiceId,
      lineNo: l.lineNo,
      description: l.description,
      quantity: l.quantity,
      unit: l.unit,
      unitPriceOre: l.unitPriceOre,
      accountId: l.accountId,
      vatCodeId: l.vatCodeId,
      deductible: l.deductible,
      nonDeductibleReason: l.nonDeductibleReason,
      netOre: l.netOre,
      vatOre: l.vatOre,
    })),
  );
}

// ── Mutations ───────────────────────────────────────────────────────────────────────────────────────

export type CreateResult =
  | { readonly ok: true; readonly id: string }
  | { readonly ok: false; readonly error: SupplierPrepareError };

export type UpdateResult =
  | { readonly ok: true; readonly id: string }
  | { readonly ok: false; readonly error: SupplierPrepareError | 'not-a-draft' };

/** Create a draft supplier invoice for the current org from validated input; returns the new id. */
export async function createDraft(
  tx: OrgTx,
  organizationId: string,
  input: SupplierInvoiceInput,
): Promise<CreateResult> {
  const prepared = await prepareSupplierInvoice(tx, input);
  if (!prepared.ok) return prepared;
  const [row] = await tx
    .insert(supplierInvoice)
    .values({
      ...headerColumns(organizationId, input),
      status: 'draft',
      netOre: prepared.net,
      vatOre: prepared.vat,
      grossOre: prepared.gross,
    })
    .returning({ id: supplierInvoice.id });
  const id = row!.id;
  await insertLines(tx, organizationId, id, prepared.lines);
  return { ok: true, id };
}

/**
 * Update a DRAFT in place (re-deriving its lines). Only drafts are editable — a posted document is
 * frozen by the SQL trigger; the `status = 'draft'` filter makes the not-a-draft case a no-op (404).
 */
export async function updateDraft(
  tx: OrgTx,
  organizationId: string,
  supplierInvoiceId: string,
  input: SupplierInvoiceInput,
): Promise<UpdateResult> {
  const prepared = await prepareSupplierInvoice(tx, input);
  if (!prepared.ok) return prepared;
  const updated = await tx
    .update(supplierInvoice)
    .set({
      ...headerColumns(organizationId, input),
      netOre: prepared.net,
      vatOre: prepared.vat,
      grossOre: prepared.gross,
      updatedAt: sql`now()`,
    })
    .where(and(eq(supplierInvoice.id, supplierInvoiceId), eq(supplierInvoice.status, 'draft')))
    .returning({ id: supplierInvoice.id });
  if (updated.length === 0) return { ok: false, error: 'not-a-draft' };
  await tx
    .delete(supplierInvoiceLine)
    .where(eq(supplierInvoiceLine.supplierInvoiceId, supplierInvoiceId));
  await insertLines(tx, organizationId, supplierInvoiceId, prepared.lines);
  return { ok: true, id: supplierInvoiceId };
}

export type PostResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly error: 'not-a-draft' | 'missing-invoice-date' | 'rule-violation';
    };

/**
 * Post a draft supplier invoice: book its AP voucher to the general ledger and move it to `posted`,
 * atomically in the caller's transaction. The leg arrangement is the PURE `derivePurchaseInvoice`
 * (per-line cost debit via the input-VAT fork, deductible input VAT per rate, self-accounted
 * reverse-charge legs, one supplier-payable credit) — never hand-rolled. The proposed voucher is gated
 * through the rules engine (the VAT-line rule, ADR 0002) before anything touches the ledger; the SQL
 * balance / posted-completeness / period-lock triggers verify the entry at COMMIT.
 */
export async function postSupplierInvoice(
  tx: OrgTx,
  organizationId: string,
  supplierInvoiceId: string,
): Promise<PostResult> {
  const detail = await readSupplierInvoice(tx, supplierInvoiceId);
  if (!detail || detail.status !== 'draft') return { ok: false, error: 'not-a-draft' };
  if (!detail.invoiceDate) return { ok: false, error: 'missing-invoice-date' };

  const status = await currentOrgStatus(tx);
  const accountRows = await tx.select({ id: account.id, number: account.number }).from(account);
  const numberByAccountId = new Map(accountRows.map((a) => [a.id, a.number]));
  const idByNumber = new Map(accountRows.map((a) => [a.number, a.id]));
  const vatRows = await tx.select({ id: vatCode.id, code: vatCode.code }).from(vatCode);
  const codeByVatId = new Map(vatRows.map((r) => [r.id, r.code]));
  const idByCode = new Map(vatRows.map((r) => [r.code, r.id]));

  // An org that doesn't deduct input VAT (under_threshold / unntatt) makes no deduction claim, so its
  // voucher lines carry NO input VAT code — mirroring `deriveStandardExpense`. The gross is booked to
  // cost either way (the supplier still charged the VAT); only the code (the deduction claim) is dropped.
  const registered = deductsInputVat(status);
  const lines: PurchaseInvoiceLine[] = detail.lines.map((l): PurchaseInvoiceLine => {
    const costNumber = numberByAccountId.get(l.accountId);
    const code = codeByVatId.get(l.vatCodeId);
    const saft = code ? STANDARD_TAX_CODE_INDEX.get(code as SaftTaxCode['code']) : undefined;
    if (!costNumber || !saft) {
      // Re-validated above; a missing account/code here is a should-never invariant breach.
      throw new Error(`supplier invoice ${detail.id}: line account/VAT code not provisioned`);
    }
    const net = øre(l.netOre);
    const vatRate = rateForCategory(saft.rateCategory);
    const isReverseCharge = saft.reverseCharge; // output codes are rejected at prepare

    if (isReverseCharge) {
      const kind = reverseChargeKind(saft);
      const rateCat = saft.rateCategory;
      const outputNo = (REVERSE_CHARGE_ACCOUNTS[kind].output as Record<string, string | undefined>)[
        rateCat
      ];
      const inputNo = (REVERSE_CHARGE_ACCOUNTS[kind].input as Record<string, string | undefined>)[
        rateCat
      ];
      const outputCode = (REVERSE_CHARGE_OUTPUT_CODES as Record<string, string | undefined>)[
        rateCat
      ];
      // Deductibility combines the committed SAF-T classification with the recorded business reason.
      const deductible = l.deductible && reverseChargeInputDeductible(saft);
      return {
        reverseCharge: true,
        net,
        vatRate,
        cost: costNumber as AccountNo,
        // Placeholders for a zero-rate code (no VAT legs are emitted, so they never post).
        outputVat: (outputNo ?? costNumber) as AccountNo,
        inputVat: (inputNo ?? costNumber) as AccountNo,
        deductible,
        // An unregistered buyer is outside the VAT system here (no self-account legs) → no codes.
        ...(registered && outputCode ? { outputVatCode: outputCode as VatCode } : {}),
        ...(registered ? { inputVatCode: code as VatCode } : {}),
      };
    }
    return {
      net,
      vatRate,
      cost: costNumber as AccountNo,
      inputVat: SUPPLIER_INVOICE_ACCOUNTS.inputVat as AccountNo,
      // An ordinary line deducts unless a non-deductible reason was recorded (the encoded §4.3 rule).
      deductible: isLineInputVatDeductible(l.nonDeductibleReason as NonDeductibleReason | null),
      ...(registered ? { vatCode: code as VatCode } : {}),
    };
  });

  const proposed: Voucher = derivePurchaseInvoice({
    payable: SUPPLIER_INVOICE_ACCOUNTS.payable as AccountNo,
    status,
    lines,
  });

  // The rules gate (ADR 0002): validate the proposed voucher's coded lines before it touches the ledger.
  const verdict = runRules([vatLineRule({ status, codes: STANDARD_TAX_CODE_INDEX })], proposed);
  if (!verdict.ok) return { ok: false, error: 'rule-violation' };

  const periodId = await ensureFiscalPeriod(
    tx,
    organizationId,
    Number(detail.invoiceDate.slice(0, 4)),
  );

  // Move the document to posted (the draft→posted UPDATE the immutability trigger permits), then book
  // the voucher linked back to it — both in this one transaction.
  await tx
    .update(supplierInvoice)
    .set({ status: 'posted', postedAt: sql`now()`, updatedAt: sql`now()` })
    .where(and(eq(supplierInvoice.id, supplierInvoiceId), eq(supplierInvoice.status, 'draft')));

  const [createdVoucher] = await tx
    .insert(voucher)
    .values({
      organizationId,
      type: 'purchase',
      periodId,
      supplierInvoiceId,
      postedAt: sql`now()`,
    })
    .returning({ id: voucher.id });
  const voucherId = createdVoucher!.id;

  await tx.insert(posting).values(
    proposed.lines.map((leg) => ({
      organizationId,
      voucherId,
      accountId: idByNumber.get(leg.account as string)!,
      vatCodeId: leg.vatCode ? (idByCode.get(leg.vatCode as string) ?? null) : null,
      debitOre: leg.debit,
      creditOre: leg.credit,
    })),
  );

  return { ok: true };
}

// ── Prefill + option lists ────────────────────────────────────────────────────────────────────────

/** A supplier's defaults, for prefilling a new document's header + lines. */
export interface SupplierPrefill {
  readonly id: string;
  readonly name: string;
  readonly orgNr: string | null;
  readonly currency: string;
  readonly paymentTermsDays: number;
  readonly defaultAccountId: string | null;
  readonly defaultVatCodeId: string | null;
}

/** Read a supplier's defaults for the new-invoice prefill (RLS-scoped). `null` when absent/not a supplier. */
export async function readSupplierPrefill(
  tx: OrgTx,
  contactId: string,
): Promise<SupplierPrefill | null> {
  const [row] = await tx
    .select({
      id: contact.id,
      name: contact.name,
      orgNr: contact.orgNr,
      currency: contact.currency,
      paymentTermsDays: contact.paymentTermsDays,
      defaultAccountId: contact.defaultAccountId,
      defaultVatCodeId: contact.defaultVatCodeId,
      isSupplier: contact.isSupplier,
    })
    .from(contact)
    .where(eq(contact.id, contactId))
    .limit(1);
  if (!row || !row.isSupplier) return null;
  return {
    id: row.id,
    name: row.name,
    orgNr: row.orgNr,
    currency: row.currency,
    paymentTermsDays: row.paymentTermsDays,
    defaultAccountId: row.defaultAccountId,
    defaultVatCodeId: row.defaultVatCodeId,
  };
}

/** Suppliers (the contact register filtered to suppliers) for the document's supplier picker. */
export interface SupplierOption {
  readonly id: string;
  readonly name: string;
}

/** List this org's suppliers for the document supplier picker (RLS-scoped). */
export async function listSupplierOptions(tx: OrgTx): Promise<SupplierOption[]> {
  return tx
    .select({ id: contact.id, name: contact.name })
    .from(contact)
    .where(eq(contact.isSupplier, true))
    .orderBy(asc(contact.name));
}

/** A VAT-code option enriched for a purchase line: rate, reverse-charge flag, and the SAF-T label. */
export interface PurchaseVatCodeOption {
  readonly id: string;
  readonly code: string;
  readonly rate: string;
  readonly reverseCharge: boolean;
  readonly description: string;
}

/**
 * List the org's purchase-valid VAT codes for a supplier-invoice line picker. Excludes pure output
 * codes (a purchase never carries output VAT) — leaving input, exempt/no-VAT, and reverse-charge
 * purchase codes — each enriched with its rate, reverse-charge flag, and committed SAF-T description.
 */
export async function listPurchaseVatCodeOptions(tx: OrgTx): Promise<PurchaseVatCodeOption[]> {
  const rows = await tx
    .select({ id: vatCode.id, code: vatCode.code, rate: vatCode.rate })
    .from(vatCode)
    .orderBy(asc(vatCode.code));
  const options: PurchaseVatCodeOption[] = [];
  for (const r of rows) {
    const saft = STANDARD_TAX_CODE_INDEX.get(r.code as SaftTaxCode['code']);
    if (!saft || saft.direction === 'output') continue; // not a purchase code (source-grounded)
    options.push({
      id: r.id,
      code: r.code,
      rate: r.rate,
      reverseCharge: saft.reverseCharge,
      description: saft.descriptionNo,
    });
  }
  return options;
}
