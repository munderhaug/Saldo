/**
 * Sales-invoice queries (build-spec §8.4). Sales documents — quote / invoice / credit note — and their
 * lines, read/written inside an already-scoped tenant transaction (call via `withUserOrg`, which proves
 * membership and sets the RLS tenant context), so the unfiltered reads/writes below are scoped to the
 * current org by RLS and the same-org composite FKs keep every reference (customer, line account/VAT
 * code/catalogue source, credited invoice) inside this tenant. Server-only.
 *
 * The money/VAT is DERIVED here by the PURE domain (`computeLine` / `invoiceTotals`), never trusted from
 * the client: the per-line VAT registration HARD BLOCK (an org that may not charge output VAT cannot put
 * an output-VAT line on a document) is `checkSalesLine` against the committed SAF-T code list — the same
 * engine the ledger uses. Issuing draws the GAPLESS number from `allocate_invoice_number` inside the tx
 * (ADR 0007) and mints the per-invoice KID; from there the document is immutable in SQL (the issue
 * trigger), so corrections are a kreditnota, never an edit.
 */
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import {
  type AccountNo,
  type ComputedLine,
  type InvoiceKind,
  type InvoiceStatus,
  type MvaStatus,
  type Øre,
  type SaftTaxCode,
  type SalesInvoiceLine,
  type VatCode,
  canTransition,
  checkSalesLine,
  computeLine,
  deriveSalesInvoice,
  drawsInvoiceNumber,
  invoiceKid,
  invoiceTotals,
  parseKroner,
  quantity as toQuantity,
  rate,
  rateForCategory,
  reverseVoucher,
  øre,
} from '@saldo/domain';
import type { OrgTx } from '../auth/middleware.js';
import type { InvoiceInput } from '../contracts/invoice.js';
import { parseQuantity } from '../contracts/invoice.js';
import {
  account,
  contact,
  invoice,
  invoiceLine,
  organization,
  posting,
  product,
  vatCode,
  voucher,
} from './schema.js';
import { STANDARD_TAX_CODE_INDEX } from './provisioning.server.js';
import { SALES_INVOICE_ACCOUNTS, ensureFiscalPeriod } from './posting.server.js';

/** '' (the form's "not given") becomes NULL; everything else is the trimmed string. */
const nullable = (value: string): string | null => (value === '' ? null : value);

// ── Read models ───────────────────────────────────────────────────────────────────────────────────

/** Row shape for the documents list — the everyday columns. */
export interface InvoiceListRow {
  readonly id: string;
  readonly kind: string;
  readonly status: string;
  readonly invoiceNumber: number | null;
  readonly customerName: string;
  readonly issueDate: string | null;
  readonly dueDate: string | null;
  readonly grossOre: number;
  readonly currency: string;
}

/** One line of a document, as stored (amounts already derived and frozen). */
interface InvoiceLineDetail {
  readonly id: string;
  readonly lineNo: number;
  readonly productId: string | null;
  readonly description: string;
  readonly quantity: string;
  readonly unit: string;
  readonly unitPriceOre: number;
  readonly accountId: string;
  readonly vatCodeId: string;
  readonly netOre: number;
  readonly vatOre: number;
}

/** The full detail of one document (the detail view + the draft editor's load + a credit-note copy). */
export interface InvoiceDetail {
  readonly id: string;
  readonly kind: InvoiceKind;
  readonly status: InvoiceStatus;
  readonly invoiceNumber: number | null;
  readonly customerId: string | null;
  readonly customerName: string;
  readonly customerEmail: string | null;
  readonly customerOrgNr: string | null;
  readonly customerAddress: string | null;
  readonly currency: string;
  readonly language: string;
  readonly issueDate: string | null;
  readonly dueDate: string | null;
  readonly kid: string | null;
  readonly creditsInvoiceId: string | null;
  readonly netOre: number;
  readonly vatOre: number;
  readonly grossOre: number;
  readonly notes: string | null;
  readonly lines: readonly InvoiceLineDetail[];
}

/** List this tenant's sales documents, newest first (RLS scopes to the current org). */
export async function listInvoices(tx: OrgTx): Promise<InvoiceListRow[]> {
  return tx
    .select({
      id: invoice.id,
      kind: invoice.kind,
      status: invoice.status,
      invoiceNumber: invoice.invoiceNumber,
      customerName: invoice.customerName,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      grossOre: invoice.grossOre,
      currency: invoice.currency,
    })
    .from(invoice)
    .orderBy(desc(invoice.createdAt));
}

/** Read one document with its lines, scoped to the current org. `null` when absent for this tenant. */
export async function readInvoice(tx: OrgTx, invoiceId: string): Promise<InvoiceDetail | null> {
  const [row] = await tx.select().from(invoice).where(eq(invoice.id, invoiceId)).limit(1);
  if (!row) return null;
  const lines = await tx
    .select()
    .from(invoiceLine)
    .where(eq(invoiceLine.invoiceId, invoiceId))
    .orderBy(asc(invoiceLine.lineNo));
  return {
    id: row.id,
    kind: row.kind as InvoiceKind,
    status: row.status as InvoiceStatus,
    invoiceNumber: row.invoiceNumber,
    customerId: row.customerId,
    customerName: row.customerName,
    customerEmail: row.customerEmail,
    customerOrgNr: row.customerOrgNr,
    customerAddress: row.customerAddress,
    currency: row.currency,
    language: row.language,
    issueDate: row.issueDate,
    dueDate: row.dueDate,
    kid: row.kid,
    creditsInvoiceId: row.creditsInvoiceId,
    netOre: row.netOre,
    vatOre: row.vatOre,
    grossOre: row.grossOre,
    notes: row.notes,
    lines: lines.map((l) => ({
      id: l.id,
      lineNo: l.lineNo,
      productId: l.productId,
      description: l.description,
      quantity: l.quantity,
      unit: l.unit,
      unitPriceOre: l.unitPriceOre,
      accountId: l.accountId,
      vatCodeId: l.vatCodeId,
      netOre: l.netOre,
      vatOre: l.vatOre,
    })),
  };
}

/**
 * Whether an issued document has been booked to the general ledger (its AR voucher exists). RLS scopes
 * the lookup to the current tenant. Used only to surface a sober "posted" confirmation on the detail
 * view — the ledger legs themselves stay depth-on-demand (the everyday surface shows no debit/credit).
 */
export async function isInvoicePosted(tx: OrgTx, invoiceId: string): Promise<boolean> {
  const [row] = await tx
    .select({ id: voucher.id })
    .from(voucher)
    .where(eq(voucher.invoiceId, invoiceId))
    .limit(1);
  return row !== undefined;
}

// ── Derivation (the domain VAT engine, server-authoritative) ────────────────────────────────────────

/** Why preparing an invoice failed — a per-line VAT block, or an unknown/foreign VAT code. */
type PrepareError =
  | 'output-vat-requires-registration'
  | 'zero-rated-requires-registration'
  | 'input-deduction-requires-registration'
  | 'input-code-not-a-sale'
  | 'reverse-charge-not-a-sale'
  | 'unknown-vat-code';

interface PreparedLine {
  readonly lineNo: number;
  readonly productId: string | null;
  readonly description: string;
  readonly quantity: string;
  readonly unit: string;
  readonly unitPriceOre: Øre;
  readonly accountId: string;
  readonly vatCodeId: string;
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
  | { readonly ok: false; readonly error: PrepareError };

/** The current org's MVA status (RLS scopes `organization` to exactly the current tenant). */
export async function readOrgMvaStatus(tx: OrgTx): Promise<MvaStatus> {
  const [row] = await tx.select({ mvaStatus: organization.mvaStatus }).from(organization).limit(1);
  return row!.mvaStatus as MvaStatus;
}

const currentOrgStatus = readOrgMvaStatus;

/** A VAT-code option enriched for the invoice form: its rate and whether it is an output-VAT code. */
export interface InvoiceVatCodeOption {
  readonly id: string;
  readonly code: string;
  readonly rate: string;
  readonly isOutput: boolean;
}

/** List the org's VAT codes for an invoice line picker, with the rate + output flag the preview needs. */
export async function listInvoiceVatCodeOptions(tx: OrgTx): Promise<InvoiceVatCodeOption[]> {
  const rows = await tx
    .select({
      id: vatCode.id,
      code: vatCode.code,
      rate: vatCode.rate,
      direction: vatCode.direction,
    })
    .from(vatCode)
    .orderBy(asc(vatCode.code));
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    rate: r.rate,
    isOutput: r.direction === 'output',
  }));
}

/**
 * Derive every line's net/VAT from the domain and enforce the per-line sales gate. Resolves each line's
 * VAT-code id to its committed SAF-T code (so `checkSalesLine` / `computeLine` see the real treatment),
 * and refuses the whole document if any line is blocked — a blocked line never persists.
 */
async function prepareInvoice(tx: OrgTx, input: InvoiceInput): Promise<Prepared> {
  const status = await currentOrgStatus(tx);
  const vatRows = await tx.select({ id: vatCode.id, code: vatCode.code }).from(vatCode);
  const codeById = new Map(vatRows.map((r) => [r.id, r.code]));

  const prepared: PreparedLine[] = [];
  const computed: ComputedLine[] = [];
  for (const [i, line] of input.lines.entries()) {
    const code = codeById.get(line.vatCodeId);
    const saft: SaftTaxCode | undefined = code
      ? STANDARD_TAX_CODE_INDEX.get(code as SaftTaxCode['code'])
      : undefined;
    if (!saft) return { ok: false, error: 'unknown-vat-code' };

    const unitPrice = line.unitPriceKr === '' ? øre(0) : parseKroner(line.unitPriceKr);
    const qtyNum = parseQuantity(line.quantity);
    if (unitPrice === null || qtyNum === null) {
      // Unreachable: the contract (contracts/invoice.ts) already validated these strings parse. A
      // failure here is an invariant breach, not a VAT-code error — fail loud rather than mislabel it.
      throw new Error(
        'invoice prepare: unparseable price/quantity (the contract should reject this)',
      );
    }

    const line_ = computeLine(status, saft, unitPrice, toQuantity(qtyNum));
    if (!line_.verdict.ok) {
      return { ok: false, error: line_.verdict.reason ?? 'input-code-not-a-sale' };
    }
    computed.push(line_);
    prepared.push({
      lineNo: i + 1,
      productId: nullable(line.productId),
      description: line.description,
      quantity: String(qtyNum),
      unit: line.unit,
      unitPriceOre: unitPrice,
      accountId: line.accountId,
      vatCodeId: line.vatCodeId,
      netOre: line_.net,
      vatOre: line_.vat,
    });
  }
  // Document totals are CATEGORY-LEVEL (VAT rounded once per rate category — BR-CO-17, ADR 0054);
  // the stored per-line vat_ore stays the per-line display figure and may sum ±øre off the total.
  const totals = invoiceTotals(computed);
  return { ok: true, lines: prepared, net: totals.net, vat: totals.vat, gross: totals.gross };
}

/**
 * The header columns a draft save may change ('' → NULL; org-nr compacted). `kind` and
 * `creditsInvoiceId` are deliberately NOT here: they are the document's identity, set at creation and
 * immutable thereafter — a credit-note draft must never revert to a plain (positive) invoice.
 */
function editableHeaderColumns(input: InvoiceInput) {
  return {
    customerId: nullable(input.customerId),
    customerName: input.customerName,
    customerEmail: nullable(input.customerEmail),
    customerOrgNr: nullable(input.customerOrgNr.replace(/\s/g, '')),
    customerAddress: nullable(input.customerAddress),
    currency: input.currency,
    language: input.language,
    issueDate: nullable(input.issueDate),
    dueDate: nullable(input.dueDate),
    notes: nullable(input.notes),
  };
}

/** All header columns for a NEW document (identity included). */
function headerColumns(organizationId: string, input: InvoiceInput) {
  return {
    organizationId,
    kind: input.kind,
    creditsInvoiceId: nullable(input.creditsInvoiceId),
    ...editableHeaderColumns(input),
  };
}

async function insertLines(
  tx: OrgTx,
  organizationId: string,
  invoiceId: string,
  lines: readonly PreparedLine[],
): Promise<void> {
  await tx.insert(invoiceLine).values(
    lines.map((l) => ({
      organizationId,
      invoiceId,
      lineNo: l.lineNo,
      productId: l.productId,
      description: l.description,
      quantity: l.quantity,
      unit: l.unit,
      unitPriceOre: l.unitPriceOre,
      accountId: l.accountId,
      vatCodeId: l.vatCodeId,
      netOre: l.netOre,
      vatOre: l.vatOre,
    })),
  );
}

// ── Mutations ───────────────────────────────────────────────────────────────────────────────────────

export type CreateResult =
  { readonly ok: true; readonly id: string } | { readonly ok: false; readonly error: PrepareError };

/** updateDraft can additionally fail because the target is no longer an editable draft, or because
 * the input tries to change the document's identity (kind / credited invoice). */
export type UpdateResult =
  | { readonly ok: true; readonly id: string }
  | { readonly ok: false; readonly error: PrepareError | 'not-a-draft' | 'kind-immutable' };

/** Create a draft document for the current org from validated input; returns the new id. */
export async function createDraft(
  tx: OrgTx,
  organizationId: string,
  input: InvoiceInput,
): Promise<CreateResult> {
  const prepared = await prepareInvoice(tx, input);
  if (!prepared.ok) return prepared;
  const [row] = await tx
    .insert(invoice)
    .values({
      ...headerColumns(organizationId, input),
      status: 'draft',
      netOre: prepared.net,
      vatOre: prepared.vat,
      grossOre: prepared.gross,
    })
    .returning({ id: invoice.id });
  const invoiceId = row!.id;
  await insertLines(tx, organizationId, invoiceId, prepared.lines);
  return { ok: true, id: invoiceId };
}

/**
 * Update a DRAFT in place (re-deriving its lines). Only drafts are editable — an issued document is
 * frozen by the SQL trigger; the `status = 'draft'` filter makes the not-a-draft case a no-op (404).
 * The document's IDENTITY — `kind` and `creditsInvoiceId` — is immutable: input that tries to change
 * either is refused (`kind-immutable`), and neither column is ever in the UPDATE's SET. Otherwise a
 * stale/tampered form could revert a credit-note draft into a second POSITIVE invoice of the same
 * amounts — double-booking revenue instead of correcting it.
 */
export async function updateDraft(
  tx: OrgTx,
  organizationId: string,
  invoiceId: string,
  input: InvoiceInput,
): Promise<UpdateResult> {
  const [current] = await tx
    .select({
      status: invoice.status,
      kind: invoice.kind,
      creditsInvoiceId: invoice.creditsInvoiceId,
    })
    .from(invoice)
    .where(eq(invoice.id, invoiceId))
    .limit(1);
  if (!current || current.status !== 'draft') return { ok: false, error: 'not-a-draft' };
  if (
    input.kind !== current.kind ||
    nullable(input.creditsInvoiceId) !== current.creditsInvoiceId
  ) {
    return { ok: false, error: 'kind-immutable' };
  }
  const prepared = await prepareInvoice(tx, input);
  if (!prepared.ok) return prepared;
  const updated = await tx
    .update(invoice)
    .set({
      ...editableHeaderColumns(input),
      netOre: prepared.net,
      vatOre: prepared.vat,
      grossOre: prepared.gross,
      updatedAt: sql`now()`,
    })
    .where(and(eq(invoice.id, invoiceId), eq(invoice.status, 'draft')))
    .returning({ id: invoice.id });
  if (updated.length === 0) return { ok: false, error: 'not-a-draft' }; // raced away mid-tx
  await tx.delete(invoiceLine).where(eq(invoiceLine.invoiceId, invoiceId));
  await insertLines(tx, organizationId, invoiceId, prepared.lines);
  return { ok: true, id: invoiceId };
}

export type IssueResult =
  | { readonly ok: true; readonly invoiceNumber: number | null }
  | {
      readonly ok: false;
      readonly error: PrepareError | 'not-a-draft' | 'credit-note-source-not-posted';
    };

/**
 * Issue a draft: re-validate every line against the domain (authoritative), draw the GAPLESS number +
 * mint the KID (invoice / credit note only) inside this tx, stamp the issue + due dates, and move to
 * `issued`. The pre-issue UPDATE is permitted (the immutability trigger only freezes once `issued_at`
 * is set); from here the document is append-only.
 */
export async function issueInvoice(
  tx: OrgTx,
  organizationId: string,
  invoiceId: string,
  dates: { readonly issueDate: string; readonly dueDate: string },
): Promise<IssueResult> {
  // Lock the document row FIRST (FOR UPDATE): a concurrent issue (double-click) serializes here, and
  // the loser sees `issued` and returns typed — BEFORE it can draw a gapless number it would then
  // have to waste. The not-a-draft answer must never cost a number.
  const [locked] = await tx
    .select({ status: invoice.status })
    .from(invoice)
    .where(eq(invoice.id, invoiceId))
    .limit(1)
    .for('update');
  if (!locked || locked.status !== 'draft') return { ok: false, error: 'not-a-draft' };
  const current = await readInvoice(tx, invoiceId);
  if (!current || current.status !== 'draft') return { ok: false, error: 'not-a-draft' };

  // Re-derive from the stored lines: the HARD BLOCK is checked again at the moment of issue.
  const status = await currentOrgStatus(tx);
  const vatRows = await tx.select({ id: vatCode.id, code: vatCode.code }).from(vatCode);
  const codeById = new Map(vatRows.map((r) => [r.id, r.code]));
  for (const line of current.lines) {
    const code = codeById.get(line.vatCodeId);
    const saft = code ? STANDARD_TAX_CODE_INDEX.get(code as SaftTaxCode['code']) : undefined;
    if (!saft) return { ok: false, error: 'unknown-vat-code' };
    const verdict = computeLine(
      status,
      saft,
      øre(line.unitPriceOre),
      toQuantity(Number(line.quantity)),
    ).verdict;
    if (!verdict.ok) return { ok: false, error: verdict.reason ?? 'input-code-not-a-sale' };
  }

  // A credit note MUST reverse a real, posted source voucher — never an unlinked motbilag (review §5).
  // Resolve it here, before any number allocation, so a malformed credit note (e.g. issued via the
  // generic draft path with a blank/unresolvable creditsInvoiceId) fails typed and atomic rather than
  // posting a reversal with no provenance back to the original.
  if (current.kind === 'credit_note') {
    const source = current.creditsInvoiceId
      ? await tx
          .select({ id: voucher.id })
          .from(voucher)
          .where(eq(voucher.invoiceId, current.creditsInvoiceId))
          .limit(1)
      : [];
    if (!source[0]) return { ok: false, error: 'credit-note-source-not-posted' };
  }

  let invoiceNumber: number | null = null;
  let kid: string | null = null;
  if (drawsInvoiceNumber(current.kind)) {
    const allocated = (await tx.execute(
      sql`select allocate_invoice_number(${organizationId}) as n`,
    )) as unknown as Array<{ n: string | number }>;
    invoiceNumber = Number(allocated[0]!.n);
    kid = invoiceKid(invoiceNumber);
  }

  const issued = await tx
    .update(invoice)
    .set({
      status: 'issued',
      invoiceNumber,
      kid,
      issueDate: dates.issueDate,
      dueDate: dates.dueDate,
      issuedAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(and(eq(invoice.id, invoiceId), eq(invoice.status, 'draft')))
    .returning({ id: invoice.id });
  // Unreachable under the FOR UPDATE lock above; if it ever misses, a number may already be drawn, so
  // THROW to roll the whole issue back (gapless counter included) rather than commit a half-issue.
  if (issued.length === 0) {
    throw new Error(`invoice ${invoiceId} stopped being a draft mid-issue`);
  }

  // Post the AR voucher to the general ledger in THIS SAME transaction (atomic with the number
  // allocation). A quote has no ledger effect (it drew no number); an invoice / credit note books one.
  if (drawsInvoiceNumber(current.kind)) {
    await postIssuedVoucher(tx, organizationId, { ...current, issueDate: dates.issueDate });
  }
  return { ok: true, invoiceNumber };
}

/**
 * Post an issued sales document's AR voucher to the general ledger, in the caller's issuing transaction
 * (so number allocation + the posted voucher commit atomically, or not at all). The leg arrangement is
 * the PURE `deriveSalesInvoice` (debit receivable gross, credit revenue per line, credit output VAT per
 * rate); the leg layout is never hand-rolled here. A credit note posts the reversing motbilag
 * (`reverseVoucher`) of ITS OWN derived voucher — which, for the full copy `createCreditNoteDraft`
 * makes, mirrors the original — linked to the original invoice's voucher via `reverses_voucher_id` for
 * provenance. The receivable + per-rate output-VAT accounts are the source-grounded
 * `SALES_INVOICE_ACCOUNTS`; each line's revenue account is the line's own `account_id`. The SQL balance
 * / posted-completeness / period-lock triggers verify the entry at COMMIT — app code does not re-check.
 *
 * Throws (rolling back the whole issue) on the should-never-happen cases — a line that the sales gate
 * would block (already re-validated by the caller) or a designated account missing from the org's
 * provisioned kontoplan — so an issued document is NEVER left without its ledger entry.
 */
async function postIssuedVoucher(
  tx: OrgTx,
  organizationId: string,
  inv: InvoiceDetail,
): Promise<void> {
  // The voucher lands in the fiscal period of the ISSUE date (created or looked up).
  const periodId = await ensureFiscalPeriod(tx, organizationId, Number(inv.issueDate!.slice(0, 4)));

  const accountRows = await tx.select({ id: account.id, number: account.number }).from(account);
  const numberByAccountId = new Map(accountRows.map((a) => [a.id, a.number]));
  const idByNumber = new Map(accountRows.map((a) => [a.number, a.id]));
  const vatRows = await tx.select({ id: vatCode.id, code: vatCode.code }).from(vatCode);
  const codeByVatId = new Map(vatRows.map((r) => [r.id, r.code]));
  const idByCode = new Map(vatRows.map((r) => [r.code, r.id]));
  const outputVatByRate: Record<string, string> = SALES_INVOICE_ACCOUNTS.outputVatByRate;

  const status = await currentOrgStatus(tx);
  const lines: SalesInvoiceLine[] = inv.lines.map((l): SalesInvoiceLine => {
    const revenue = numberByAccountId.get(l.accountId);
    const code = codeByVatId.get(l.vatCodeId);
    const saft = code ? STANDARD_TAX_CODE_INDEX.get(code as SaftTaxCode['code']) : undefined;
    if (!revenue || !saft)
      throw new Error(`invoice ${inv.id}: line account/VAT code not provisioned`);
    // Charge output VAT on EXACTLY the lines `computeLine` did (the same gate that produced the frozen
    // `vat_ore`): only a permitted `output-vat` treatment. A zero-rated / exempt / REVERSE-CHARGE line
    // (a non-blocking advisory that may carry a non-zero rate category) charged no VAT on the document,
    // so it posts at rate 0 — no phantom VAT leg, and the voucher ties out to the stored amounts.
    const verdict = checkSalesLine(status, saft);
    const charges = verdict.ok && verdict.treatment === 'output-vat';
    return {
      net: øre(l.netOre),
      vatRate: charges ? rateForCategory(saft.rateCategory) : rate(0),
      revenue: revenue as AccountNo,
      // A real output-VAT account for a charging rate; the regular account is an unused placeholder for
      // a non-charging line (deriveSales emits NO VAT leg there, so it never actually posts).
      outputVat: (outputVatByRate[saft.rateCategory] ??
        SALES_INVOICE_ACCOUNTS.outputVatByRate.regular) as AccountNo,
      vatCode: code as VatCode,
    };
  });

  const derived = deriveSalesInvoice({
    receivable: SALES_INVOICE_ACCOUNTS.receivable as AccountNo,
    status,
    lines,
  });
  if (!derived.ok)
    throw new Error(`invoice ${inv.id} derived an unpostable voucher: ${derived.error}`);

  // A credit note reverses the original invoice's voucher (the motbilag); a plain invoice posts as-is.
  // The source voucher MUST resolve — issueInvoice already returned 'credit-note-source-not-posted' if
  // it didn't, so reaching here without one is a should-never-happen; throw to roll back rather than
  // post an unlinked reversal (review §5).
  let toPost = derived.voucher;
  let reversesVoucherId: string | null = null;
  if (inv.kind === 'credit_note') {
    const [orig] = inv.creditsInvoiceId
      ? await tx
          .select({ id: voucher.id })
          .from(voucher)
          .where(eq(voucher.invoiceId, inv.creditsInvoiceId))
          .limit(1)
      : [];
    if (!orig) throw new Error(`credit note ${inv.id}: no posted source voucher to reverse`);
    reversesVoucherId = orig.id;
    toPost = reverseVoucher(derived.voucher, reversesVoucherId);
  }

  const [createdVoucher] = await tx
    .insert(voucher)
    .values({
      organizationId,
      type: toPost.type,
      periodId,
      invoiceId: inv.id,
      reversesVoucherId,
      postedAt: sql`now()`,
    })
    .returning({ id: voucher.id });
  const voucherId = createdVoucher!.id;

  await tx.insert(posting).values(
    toPost.lines.map((leg) => ({
      organizationId,
      voucherId,
      accountId: idByNumber.get(leg.account as string)!,
      vatCodeId: leg.vatCode ? (idByCode.get(leg.vatCode as string) ?? null) : null,
      debitOre: leg.debit,
      creditOre: leg.credit,
    })),
  );
}

/**
 * Advance the lifecycle of an issued document (sent / viewed / paid / overdue), stamping its time.
 * The UPDATE is a compare-and-set on the status read above (predicate + row count), so a concurrent
 * transition that commits in between makes this one return false instead of silently double-stamping
 * — the reconcile settlement path relies on that to refuse a second "paid".
 */
export async function transitionInvoice(
  tx: OrgTx,
  invoiceId: string,
  to: InvoiceStatus,
): Promise<boolean> {
  const [cur] = await tx
    .select({ status: invoice.status })
    .from(invoice)
    .where(eq(invoice.id, invoiceId))
    .limit(1);
  if (!cur || !canTransition(cur.status as InvoiceStatus, to)) return false;
  const stamp =
    to === 'sent'
      ? { sentAt: sql`now()` }
      : to === 'viewed'
        ? { viewedAt: sql`now()` }
        : to === 'paid'
          ? { paidAt: sql`now()` }
          : {};
  const updated = await tx
    .update(invoice)
    .set({ status: to, updatedAt: sql`now()`, ...stamp })
    .where(and(eq(invoice.id, invoiceId), eq(invoice.status, cur.status)))
    .returning({ id: invoice.id });
  return updated.length > 0;
}

/**
 * Create a DRAFT credit note that corrects an issued invoice: copy its customer snapshot + lines and
 * link it via `credits_invoice_id`. The user reviews and issues it (which draws its own gapless number).
 * `null` when the source is not an issued invoice for this tenant.
 */
export async function createCreditNoteDraft(
  tx: OrgTx,
  organizationId: string,
  sourceInvoiceId: string,
): Promise<string | null> {
  const src = await readInvoice(tx, sourceInvoiceId);
  if (!src || src.kind !== 'invoice' || src.status === 'draft') return null;
  const [row] = await tx
    .insert(invoice)
    .values({
      organizationId,
      kind: 'credit_note',
      status: 'draft',
      customerId: src.customerId,
      customerName: src.customerName,
      customerEmail: src.customerEmail,
      customerOrgNr: src.customerOrgNr,
      customerAddress: src.customerAddress,
      currency: src.currency,
      language: src.language,
      creditsInvoiceId: src.id,
      netOre: src.netOre,
      vatOre: src.vatOre,
      grossOre: src.grossOre,
      notes: src.notes,
    })
    .returning({ id: invoice.id });
  const creditNoteId = row!.id;
  await tx.insert(invoiceLine).values(
    src.lines.map((l) => ({
      organizationId,
      invoiceId: creditNoteId,
      lineNo: l.lineNo,
      productId: l.productId,
      description: l.description,
      quantity: l.quantity,
      unit: l.unit,
      unitPriceOre: l.unitPriceOre,
      accountId: l.accountId,
      vatCodeId: l.vatCodeId,
      netOre: l.netOre,
      vatOre: l.vatOre,
    })),
  );
  return creditNoteId;
}

/** A contact's invoice-relevant defaults, for prefilling a new document's header + lines. */
export interface CustomerPrefill {
  readonly id: string;
  readonly name: string;
  readonly email: string | null;
  readonly orgNr: string | null;
  readonly address: string | null;
  readonly currency: string;
  readonly language: string;
  readonly paymentTermsDays: number;
  readonly defaultAccountId: string | null;
  readonly defaultVatCodeId: string | null;
}

/** Read a customer's defaults for the new-invoice prefill (RLS-scoped). `null` when absent. */
export async function readCustomerPrefill(
  tx: OrgTx,
  contactId: string,
): Promise<CustomerPrefill | null> {
  const [row] = await tx
    .select({
      id: contact.id,
      name: contact.name,
      email: contact.email,
      orgNr: contact.orgNr,
      addressLine: contact.addressLine,
      postalCode: contact.postalCode,
      city: contact.city,
      currency: contact.currency,
      language: contact.language,
      paymentTermsDays: contact.paymentTermsDays,
      defaultAccountId: contact.defaultAccountId,
      defaultVatCodeId: contact.defaultVatCodeId,
      isCustomer: contact.isCustomer,
    })
    .from(contact)
    .where(eq(contact.id, contactId))
    .limit(1);
  if (!row || !row.isCustomer) return null;
  const address = [row.addressLine, [row.postalCode, row.city].filter(Boolean).join(' ').trim()]
    .filter((s) => s && s.length > 0)
    .join(', ');
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    orgNr: row.orgNr,
    address: address.length > 0 ? address : null,
    currency: row.currency,
    language: row.language,
    paymentTermsDays: row.paymentTermsDays,
    defaultAccountId: row.defaultAccountId,
    defaultVatCodeId: row.defaultVatCodeId,
  };
}

/** Catalogue items as line-prefill options (id + the fields that seed a line). RLS-scoped. */
export interface ProductLineOption {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly unit: string;
  readonly unitPriceOre: number;
  readonly defaultAccountId: string | null;
  readonly defaultVatCodeId: string | null;
}

/** List the catalogue as line-prefill options, alphabetical (RLS-scoped). */
export async function listProductLineOptions(tx: OrgTx): Promise<ProductLineOption[]> {
  return tx
    .select({
      id: product.id,
      name: product.name,
      description: product.description,
      unit: product.unit,
      unitPriceOre: product.unitPriceOre,
      defaultAccountId: product.defaultAccountId,
      defaultVatCodeId: product.defaultVatCodeId,
    })
    .from(product)
    .orderBy(asc(product.name));
}

/** Customers (the contact register filtered to customers) for the document's customer picker. */
export interface CustomerOption {
  readonly id: string;
  readonly name: string;
}

/** List this org's customers for the document customer picker (RLS-scoped). */
export async function listCustomerOptions(tx: OrgTx): Promise<CustomerOption[]> {
  return tx
    .select({ id: contact.id, name: contact.name })
    .from(contact)
    .where(eq(contact.isCustomer, true))
    .orderBy(asc(contact.name));
}
