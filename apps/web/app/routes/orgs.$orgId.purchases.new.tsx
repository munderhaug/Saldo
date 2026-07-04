import { Link, redirect } from 'react-router';
import { z } from 'zod';
import type { Route } from './+types/orgs.$orgId.purchases.new';
import { assertSameOrigin, withUserOrg } from '~/auth/auth.server';
import { listAccountOptions } from '~/db/org-defaults.server';
import {
  createDraft,
  listPurchaseVatCodeOptions,
  listSupplierOptions,
  readSupplierPrefill,
} from '~/db/supplier-invoices.server';
import { supplierInvoiceInput, type SupplierInvoiceInput } from '~/contracts';
import { supplierInvoiceFormToObject } from '~/lib/supplier-invoice-form-data';
import { SupplierInvoiceForm, emptyLine } from '~/components/supplier-invoice-form';
import { t } from '~/copy';

export function headers() {
  return { 'Cache-Control': 'private, no-store' };
}

export async function loader({ request, params }: Route.LoaderArgs) {
  if (!z.string().uuid().safeParse(params.orgId).success) {
    throw new Response('Not found', { status: 404 });
  }
  const supplierId = new URL(request.url).searchParams.get('supplierId') ?? '';
  const data = await withUserOrg(request, params.orgId, async (tx) => ({
    suppliers: await listSupplierOptions(tx),
    accounts: await listAccountOptions(tx),
    vatCodes: await listPurchaseVatCodeOptions(tx),
    prefill: z.string().uuid().safeParse(supplierId).success
      ? await readSupplierPrefill(tx, supplierId)
      : null,
  }));
  return { orgId: params.orgId, ...data };
}

export async function action({ request, params }: Route.ActionArgs) {
  assertSameOrigin(request);
  if (!z.string().uuid().safeParse(params.orgId).success) {
    throw new Response('Not found', { status: 404 });
  }
  const parsed = supplierInvoiceInput.safeParse(
    supplierInvoiceFormToObject(await request.formData()),
  );
  if (!parsed.success) return { error: t('purchases.form.errorInvalidInput') };

  const result = await withUserOrg(request, params.orgId, (tx) =>
    createDraft(tx, params.orgId, parsed.data),
  );
  if (!result.ok) return { error: t(`purchases.error.${result.error}`) };
  return redirect(`/orgs/${params.orgId}/purchases/${result.id}`);
}

export default function NewPurchaseRoute({ loaderData, actionData }: Route.ComponentProps) {
  const { orgId, suppliers, accounts, vatCodes, prefill } = loaderData;

  const firstLine = emptyLine();
  if (prefill?.defaultAccountId) firstLine.accountId = prefill.defaultAccountId;
  if (prefill?.defaultVatCodeId) firstLine.vatCodeId = prefill.defaultVatCodeId;

  const defaultValues: SupplierInvoiceInput = {
    supplierId: prefill?.id ?? '',
    supplierName: prefill?.name ?? '',
    supplierOrgNr: prefill?.orgNr ?? '',
    supplierInvoiceNumber: '',
    kid: '',
    currency: prefill?.currency ?? 'NOK',
    invoiceDate: '',
    dueDate: '',
    notes: '',
    lines: [firstLine],
  };

  return (
    <main className="mx-auto grid max-w-2xl gap-6 p-6 sm:p-10">
      <header className="grid gap-1">
        <h1 className="font-serif text-3xl tracking-tight">{t('purchases.form.newTitle')}</h1>
        <p className="text-muted-foreground">{t('purchases.form.intro')}</p>
      </header>

      <SupplierInvoiceForm
        defaultValues={defaultValues}
        suppliers={suppliers}
        accounts={accounts}
        vatCodes={vatCodes}
        submitLabel={t('purchases.form.submitCreate')}
        error={actionData?.error}
      />

      <Link
        to={`/orgs/${orgId}/purchases`}
        className="text-primary font-text inline-flex min-h-11 w-fit items-center text-sm underline-offset-4 hover:underline"
      >
        {t('purchases.back')}
      </Link>
    </main>
  );
}
