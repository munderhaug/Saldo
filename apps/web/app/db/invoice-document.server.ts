/**
 * Issued-document presentation (build-spec §8.4, feat-invoice-pdf-email). Assembles the FROZEN sales
 * document into one resolved model that BOTH the PDF renderer and the EHF/PEPPOL builder consume — so
 * the customer/seller snapshot, the per-line VAT split and the per-rate MVA-grunnlag are derived once,
 * never twice. Money is NEVER recomputed: line net/VAT and the document totals are the immutable øre the
 * invoice was issued with; the VAT breakdown is summed from them via the pure `frozenVatBreakdown`.
 *
 * The per-line rate category + treatment come from the committed SAF-T code (resolved through the org's
 * provisioned VAT codes), the same engine the ledger used — never re-classified from memory. Server-only;
 * runs inside an RLS-scoped tenant transaction.
 */
import { asc, eq } from 'drizzle-orm';
import {
  type EhfInvoiceModel,
  type RateCategory,
  type Rate,
  type SaftTaxCode,
  type UnclVatCategory,
  type VatTreatment,
  type Øre,
  checkSalesLine,
  frozenVatBreakdown,
  orgNr as toOrgNr,
  rateForCategory,
  vatCategoryFor,
  øre,
} from '@saldo/domain';
import type { OrgTx } from '../auth/middleware.js';
import { invoice, invoiceLine, invoiceEmail, organization, vatCode } from './schema.js';
import { STANDARD_TAX_CODE_INDEX } from './provisioning.server.js';
import { readOrgMvaStatus } from './invoices.server.js';

/** A party snapshot on the document. */
interface DocParty {
  readonly orgNr: string | null;
  readonly name: string;
  readonly email: string | null;
  readonly address: string | null;
}

/** One resolved line: its frozen money + the VAT classification the renderers need. */
interface DocLine {
  readonly lineNo: number;
  readonly description: string;
  readonly quantity: string;
  readonly unit: string;
  readonly unitPriceOre: Øre;
  readonly netOre: Øre;
  readonly vatOre: Øre;
  readonly vatCodeLabel: string;
  readonly vatRate: Rate;
  readonly rateCategory: RateCategory;
  readonly treatment: VatTreatment;
  readonly vatCategory: UnclVatCategory;
}

/** The fully-resolved issued document (PDF + EHF share this). */
export interface InvoiceDocumentModel {
  readonly id: string;
  readonly kind: 'invoice' | 'credit_note' | 'quote';
  readonly invoiceNumber: number | null;
  readonly issueDate: string | null;
  readonly dueDate: string | null;
  readonly currency: string;
  readonly language: string;
  readonly kid: string | null;
  readonly seller: {
    readonly orgNr: string;
    readonly name: string;
    /** The org's configured payout account (BBAN/IBAN + optional holder name), or null if unset. */
    readonly paymentAccount: { readonly id: string; readonly name: string | null } | null;
  };
  readonly customer: DocParty;
  readonly lines: readonly DocLine[];
  readonly vatBuckets: ReturnType<typeof frozenVatBreakdown>;
  readonly netOre: Øre;
  readonly vatOre: Øre;
  readonly grossOre: Øre;
  readonly notes: string | null;
}

/**
 * Read an ISSUED document, fully resolved for rendering. `null` when the document is absent for this
 * tenant or still a draft (a draft has no gapless number / frozen figures to render).
 */
export async function readInvoiceDocument(
  tx: OrgTx,
  invoiceId: string,
): Promise<InvoiceDocumentModel | null> {
  const [head] = await tx.select().from(invoice).where(eq(invoice.id, invoiceId)).limit(1);
  if (!head || head.status === 'draft') return null;

  const [seller] = await tx
    .select({
      orgNr: organization.orgNr,
      name: organization.name,
      paymentAccount: organization.invoicePaymentAccount,
      paymentAccountName: organization.invoicePaymentAccountName,
    })
    .from(organization)
    .limit(1);
  const status = await readOrgMvaStatus(tx);

  const vatRows = await tx.select({ id: vatCode.id, code: vatCode.code }).from(vatCode);
  const codeById = new Map(vatRows.map((r) => [r.id, r.code]));

  const lineRows = await tx
    .select()
    .from(invoiceLine)
    .where(eq(invoiceLine.invoiceId, invoiceId))
    .orderBy(asc(invoiceLine.lineNo));

  const lines: DocLine[] = lineRows.map((l) => {
    const code = codeById.get(l.vatCodeId);
    const saft: SaftTaxCode | undefined = code
      ? STANDARD_TAX_CODE_INDEX.get(code as SaftTaxCode['code'])
      : undefined;
    if (!saft) throw new Error(`invoice ${invoiceId}: line VAT code not provisioned`);
    const treatment = checkSalesLine(status, saft).treatment;
    return {
      lineNo: l.lineNo,
      description: l.description,
      quantity: l.quantity,
      unit: l.unit,
      unitPriceOre: øre(l.unitPriceOre),
      netOre: øre(l.netOre),
      vatOre: øre(l.vatOre),
      vatCodeLabel: code ?? '',
      vatRate: rateForCategory(saft.rateCategory),
      rateCategory: saft.rateCategory,
      treatment,
      vatCategory: vatCategoryFor(treatment),
    };
  });

  return {
    id: head.id,
    kind: head.kind as InvoiceDocumentModel['kind'],
    invoiceNumber: head.invoiceNumber,
    issueDate: head.issueDate,
    dueDate: head.dueDate,
    currency: head.currency,
    language: head.language,
    kid: head.kid,
    seller: {
      orgNr: seller!.orgNr,
      name: seller!.name,
      paymentAccount: seller!.paymentAccount
        ? { id: seller!.paymentAccount, name: seller!.paymentAccountName }
        : null,
    },
    customer: {
      orgNr: head.customerOrgNr,
      name: head.customerName,
      email: head.customerEmail,
      address: head.customerAddress,
    },
    lines,
    vatBuckets: frozenVatBreakdown(
      lines.map((l) => ({ net: l.netOre, vat: l.vatOre, rateCategory: l.rateCategory })),
    ),
    netOre: øre(head.netOre),
    vatOre: øre(head.vatOre),
    grossOre: øre(head.grossOre),
    notes: head.notes,
  };
}

/**
 * Map a resolved document to the domain EHF model. Only invoices / credit notes carry an EHF
 * (a quote draws no number); `null` for anything else. The free-text customer address is placed in the
 * UBL `StreetName` and the country defaults to `NO` — structured city/postal-code are not captured yet,
 * so the local validator will report the address as incomplete (the honest "start now" posture; full
 * EHF address capture lands with `feat-peppol-send`).
 */
export function toEhfModel(doc: InvoiceDocumentModel): EhfInvoiceModel | null {
  if (doc.kind === 'quote' || doc.invoiceNumber === null) return null;
  const seller = {
    orgNr: toOrgNr(doc.seller.orgNr),
    name: doc.seller.name,
    countryCode: 'NO',
  };
  // The seller's payout account → cac:PayeeFinancialAccount (required by BIS for credit transfer,
  // code 30). Emitted only when the org has configured one; omitted otherwise (no regression).
  const payeeAccount = doc.seller.paymentAccount
    ? {
        id: doc.seller.paymentAccount.id,
        ...(doc.seller.paymentAccount.name ? { name: doc.seller.paymentAccount.name } : {}),
      }
    : undefined;
  const buyer = {
    orgNr: doc.customer.orgNr ? toOrgNr(doc.customer.orgNr) : toOrgNr(doc.seller.orgNr),
    name: doc.customer.name,
    ...(doc.customer.address ? { street: doc.customer.address } : {}),
    countryCode: 'NO',
  };
  return {
    kind: doc.kind,
    number: String(doc.invoiceNumber),
    issueDate: doc.issueDate ?? '',
    ...(doc.dueDate ? { dueDate: doc.dueDate } : {}),
    currency: doc.currency,
    seller,
    buyer,
    ...(doc.kid ? { paymentReference: doc.kid } : {}),
    ...(payeeAccount ? { payeeAccount } : {}),
    lines: doc.lines.map((l) => ({
      id: String(l.lineNo),
      description: l.description,
      quantity: l.quantity,
      unit: l.unit,
      unitPriceOre: l.unitPriceOre,
      netOre: l.netOre,
      vatCategory: l.vatCategory,
      vatPercent: (l.vatRate as number) * 100,
    })),
    taxSubtotals: doc.vatBuckets.map((b) => ({
      category: vatCategoryFor(categoryTreatment(b.rateCategory)),
      percent: (b.vatRate as number) * 100,
      baseOre: b.base,
      vatOre: b.vat,
    })),
    netOre: doc.netOre,
    vatOre: doc.vatOre,
    grossOre: doc.grossOre,
    ...(doc.notes ? { notes: doc.notes } : {}),
  };
}

/**
 * Approximate a VAT treatment from a rate category for the document-level breakdown's category code.
 * The line-level category is authoritative (it carries the real treatment); a bucket only knows its
 * rate, so a charging rate → standard, a zero rate / none → exempt-or-zero. Good enough for the subset
 * (the per-line categories are what BIS validates against the lines).
 */
function categoryTreatment(rateCategory: RateCategory): VatTreatment {
  return rateCategory === 'none'
    ? 'exempt'
    : rateCategory === 'zero'
      ? 'zero-rated-output'
      : 'output-vat';
}

/** Outcome of a send attempt, recorded to the append-only `invoice_email` log. */
export interface EmailSendRecord {
  readonly recipient: string;
  readonly status: 'sent' | 'failed';
  readonly providerMessageId?: string | null;
  readonly error?: string | null;
}

/** Record one send attempt (provenance for the §5.5 consequential act). RLS scopes it to the tenant. */
export async function recordEmailSend(
  tx: OrgTx,
  organizationId: string,
  invoiceId: string,
  record: EmailSendRecord,
): Promise<void> {
  await tx.insert(invoiceEmail).values({
    organizationId,
    invoiceId,
    recipient: record.recipient,
    status: record.status,
    providerMessageId: record.providerMessageId ?? null,
    error: record.error ?? null,
  });
}
