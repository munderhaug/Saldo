import { Form, Link, redirect } from 'react-router';
import { z } from 'zod';
import { formatKr, øre, type Øre } from '@saldo/domain';
import type { Route } from './+types/orgs.$orgId.purchases.$purchaseId';
import { assertSameOrigin, withUserOrg } from '~/auth/auth.server';
import { listAccountOptions } from '~/db/org-defaults.server';
import {
  listPurchaseVatCodeOptions,
  listSupplierOptions,
  postSupplierInvoice,
  readSupplierInvoice,
  updateDraft,
  type SupplierInvoiceDetail,
} from '~/db/supplier-invoices.server';
import { supplierInvoiceInput, type SupplierInvoiceInput } from '~/contracts';
import { supplierInvoiceFormToObject } from '~/lib/supplier-invoice-form-data';
import { SupplierInvoiceForm } from '~/components/supplier-invoice-form';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';
import { t } from '~/copy';

export function meta() {
  return [{ title: t('purchases.detail.postedTitle') }];
}

export function headers() {
  return { 'Cache-Control': 'private, no-store' };
}

const idSchema = z.string().uuid();

export async function loader({ request, params }: Route.LoaderArgs) {
  if (!idSchema.safeParse(params.orgId).success || !idSchema.safeParse(params.purchaseId).success) {
    throw new Response('Not found', { status: 404 });
  }
  const data = await withUserOrg(request, params.orgId, async (tx) => {
    const detail = await readSupplierInvoice(tx, params.purchaseId);
    if (!detail) return null;
    return {
      detail,
      suppliers: await listSupplierOptions(tx),
      accounts: await listAccountOptions(tx),
      vatCodes: await listPurchaseVatCodeOptions(tx),
    };
  });
  if (!data) throw new Response('Not found', { status: 404 });
  return { orgId: params.orgId, ...data };
}

export async function action({ request, params }: Route.ActionArgs) {
  assertSameOrigin(request);
  if (!idSchema.safeParse(params.orgId).success || !idSchema.safeParse(params.purchaseId).success) {
    throw new Response('Not found', { status: 404 });
  }
  const form = await request.formData();
  const intent = form.get('intent');

  if (intent === 'post') {
    const result = await withUserOrg(request, params.orgId, (tx) =>
      postSupplierInvoice(tx, params.orgId, params.purchaseId),
    );
    if (!result.ok) return { error: t(`purchases.error.${result.error}`) };
    return redirect(`/orgs/${params.orgId}/purchases/${params.purchaseId}`);
  }

  // Default intent: save the draft (re-derive its lines).
  const parsed = supplierInvoiceInput.safeParse(supplierInvoiceFormToObject(form));
  if (!parsed.success) return { error: t('purchases.form.errorInvalidInput') };
  const result = await withUserOrg(request, params.orgId, (tx) =>
    updateDraft(tx, params.orgId, params.purchaseId, parsed.data),
  );
  if (!result.ok) return { error: t(`purchases.error.${result.error}`) };
  return redirect(`/orgs/${params.orgId}/purchases/${params.purchaseId}`);
}

/** Stored draft → the editor's all-string default values (money formatted so `parseKroner` round-trips). */
function toFormValues(detail: SupplierInvoiceDetail): SupplierInvoiceInput {
  return {
    supplierId: detail.supplierId ?? '',
    supplierName: detail.supplierName,
    supplierOrgNr: detail.supplierOrgNr ?? '',
    supplierInvoiceNumber: detail.supplierInvoiceNumber ?? '',
    kid: detail.kid ?? '',
    currency: detail.currency,
    invoiceDate: detail.invoiceDate ?? '',
    dueDate: detail.dueDate ?? '',
    notes: detail.notes ?? '',
    lines: detail.lines.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unit: l.unit,
      unitPriceKr: l.unitPriceOre === 0 ? '' : formatKr(l.unitPriceOre as Øre),
      accountId: l.accountId,
      vatCodeId: l.vatCodeId,
      nonDeductibleReason: l.nonDeductibleReason ?? '',
    })),
  };
}

export default function PurchaseDetailRoute({ loaderData, actionData }: Route.ComponentProps) {
  const { orgId, detail, suppliers, accounts, vatCodes } = loaderData;

  if (detail.status === 'posted') {
    return <PostedView orgId={orgId} detail={detail} />;
  }

  return (
    <main className="mx-auto grid max-w-2xl gap-6 p-6 sm:p-10">
      <header className="grid gap-1">
        <h1 className="font-serif text-3xl tracking-tight">{t('purchases.form.editTitle')}</h1>
        <p className="text-muted-foreground">{t('purchases.form.intro')}</p>
      </header>

      <SupplierInvoiceForm
        defaultValues={toFormValues(detail)}
        suppliers={suppliers}
        accounts={accounts}
        vatCodes={vatCodes}
        submitLabel={t('purchases.form.submitSave')}
        intent="update"
        error={actionData?.error}
      />

      {/* Posting is a §5.5 money-touching act: a separate, sober confirmation, plain language. */}
      <section className="border-input grid gap-3 border-t pt-6">
        <p className="text-muted-foreground text-sm">{t('purchases.detail.postIntro')}</p>
        <Form method="post">
          <input type="hidden" name="intent" value="post" />
          <button
            type="submit"
            className="bg-primary text-primary-foreground font-text inline-flex min-h-11 items-center rounded-md px-4 py-2 text-sm"
          >
            {t('purchases.detail.post')}
          </button>
        </Form>
      </section>

      <Link
        to={`/orgs/${orgId}/purchases`}
        className="text-primary font-text inline-flex min-h-11 w-fit items-center text-sm underline-offset-4 hover:underline"
      >
        {t('purchases.back')}
      </Link>
    </main>
  );
}

function PostedView({ orgId, detail }: { orgId: string; detail: SupplierInvoiceDetail }) {
  return (
    <main className="mx-auto grid max-w-2xl gap-6 p-6 sm:p-10">
      <header className="grid gap-1">
        <h1 className="font-serif text-3xl tracking-tight">{t('purchases.detail.postedTitle')}</h1>
        <p className="text-muted-foreground">{detail.supplierName}</p>
      </header>

      <dl className="grid gap-3 text-sm">
        <Row label={t('purchases.detail.invoiceNumber')}>{detail.supplierInvoiceNumber ?? '—'}</Row>
        <Row label={t('purchases.detail.date')}>{detail.invoiceDate ?? '—'}</Row>
        <Row label={t('purchases.detail.due')}>{detail.dueDate ?? '—'}</Row>
      </dl>

      <Table>
        <TableCaption>{t('purchases.detail.linesCaption')}</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">{t('purchases.detail.lineHeaderDescription')}</TableHead>
            <TableHead scope="col" className="text-right">
              {t('purchases.detail.lineHeaderAmount')}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {detail.lines.map((l) => (
            <TableRow key={l.id}>
              <TableCell>{l.description}</TableCell>
              <TableCell className="tabular text-right">
                {formatKr(øre(l.netOre))} {t('common.currency')}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <dl className="border-input grid gap-1 border-t pt-4 text-sm">
        <Row label={t('purchases.detail.net')}>
          <span className="tabular">
            {formatKr(øre(detail.netOre))} {t('common.currency')}
          </span>
        </Row>
        <Row label={t('purchases.detail.vat')}>
          <span className="tabular">
            {formatKr(øre(detail.vatOre))} {t('common.currency')}
          </span>
        </Row>
        <Row label={t('purchases.detail.gross')}>
          <span className="tabular font-text">
            {formatKr(øre(detail.grossOre))} {t('common.currency')}
          </span>
        </Row>
      </dl>

      <p className="text-muted-foreground text-sm">{t('purchases.detail.postedNote')}</p>

      <Link
        to={`/orgs/${orgId}/purchases`}
        className="text-primary font-text inline-flex min-h-11 w-fit items-center text-sm underline-offset-4 hover:underline"
      >
        {t('purchases.back')}
      </Link>
    </main>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
