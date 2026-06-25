import { Link, redirect } from 'react-router';
import { z } from 'zod';
import { chargesOutputVat } from '@saldo/domain';
import type { Route } from './+types/orgs.$orgId.invoices.new';
import { assertSameOrigin, withUserOrg } from '~/auth/auth.server';
import { listAccountOptions } from '~/db/org-defaults.server';
import {
  createDraft,
  listCustomerOptions,
  listInvoiceVatCodeOptions,
  listProductLineOptions,
  readCustomerPrefill,
  readOrgMvaStatus,
} from '~/db/invoices.server';
import { invoiceInput, type InvoiceInput } from '~/contracts';
import { invoiceFormToObject } from '~/lib/invoice-form-data';
import { InvoiceForm, emptyLine } from '~/components/invoice-form';
import { t } from '~/copy';

export function headers() {
  return { 'Cache-Control': 'private, no-store' };
}

export async function loader({ request, params }: Route.LoaderArgs) {
  if (!z.string().uuid().safeParse(params.orgId).success) {
    throw new Response('Not found', { status: 404 });
  }
  const customerId = new URL(request.url).searchParams.get('customerId') ?? '';
  const data = await withUserOrg(request, params.orgId, async (tx) => ({
    status: await readOrgMvaStatus(tx),
    customers: await listCustomerOptions(tx),
    accounts: await listAccountOptions(tx),
    vatCodes: await listInvoiceVatCodeOptions(tx),
    products: await listProductLineOptions(tx),
    prefill: z.string().uuid().safeParse(customerId).success
      ? await readCustomerPrefill(tx, customerId)
      : null,
  }));
  return { orgId: params.orgId, ...data, orgRegistered: chargesOutputVat(data.status) };
}

export async function action({ request, params }: Route.ActionArgs) {
  assertSameOrigin(request);
  if (!z.string().uuid().safeParse(params.orgId).success) {
    throw new Response('Not found', { status: 404 });
  }
  const parsed = invoiceInput.safeParse(invoiceFormToObject(await request.formData()));
  if (!parsed.success) return { error: t('invoices.form.errorInvalidInput') };

  const result = await withUserOrg(request, params.orgId, (tx) =>
    createDraft(tx, params.orgId, parsed.data),
  );
  if (!result.ok) return { error: t(`invoices.error.${result.error}`) };
  return redirect(`/orgs/${params.orgId}/invoices/${result.id}`);
}

export default function NewInvoiceRoute({ loaderData, actionData }: Route.ComponentProps) {
  const { orgId, customers, accounts, vatCodes, products, orgRegistered, prefill } = loaderData;

  const firstLine = emptyLine();
  if (prefill?.defaultAccountId) firstLine.accountId = prefill.defaultAccountId;
  if (prefill?.defaultVatCodeId) firstLine.vatCodeId = prefill.defaultVatCodeId;

  const defaultValues: InvoiceInput = {
    kind: 'invoice',
    customerId: prefill?.id ?? '',
    customerName: prefill?.name ?? '',
    customerEmail: prefill?.email ?? '',
    customerOrgNr: prefill?.orgNr ?? '',
    customerAddress: prefill?.address ?? '',
    currency: prefill?.currency ?? 'NOK',
    language: (prefill?.language as InvoiceInput['language']) ?? 'nb',
    issueDate: '',
    dueDate: '',
    creditsInvoiceId: '',
    notes: '',
    lines: [firstLine],
  };

  return (
    <main className="mx-auto grid max-w-2xl gap-6 p-6 sm:p-10">
      <header className="grid gap-1">
        <h1 className="font-serif text-3xl tracking-tight">{t('invoices.form.newTitle')}</h1>
        <p className="text-muted-foreground">{t('invoices.form.intro')}</p>
      </header>

      <InvoiceForm
        defaultValues={defaultValues}
        customers={customers}
        accounts={accounts}
        vatCodes={vatCodes}
        products={products}
        orgRegistered={orgRegistered}
        submitLabel={t('invoices.form.submitCreate')}
        error={actionData?.error}
      />

      <Link
        to={`/orgs/${orgId}/invoices`}
        className="text-primary font-text inline-flex min-h-11 w-fit items-center text-sm underline-offset-4 hover:underline"
      >
        {t('invoices.back')}
      </Link>
    </main>
  );
}
