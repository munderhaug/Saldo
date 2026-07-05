import { Link, redirect } from 'react-router';
import { z } from 'zod';
import type { Route } from './+types/orgs.$orgId.products.new';
import { assertSameOrigin, withUserOrg } from '~/auth/auth.server';
import { createProduct, listAccountOptions, listVatCodeOptions } from '~/db/products.server';
import { recordAuditEvent } from '~/db/audit.server';
import { productInput, type ProductInput } from '~/contracts';
import { ProductForm } from '~/components/product-form';
import { t } from '~/copy';

export function meta() {
  return [{ title: t('products.form.newTitle') }];
}

export function headers() {
  return { 'Cache-Control': 'private, no-store' };
}

/** Load the default-picker options (the org's kontoplan + VAT codes), RLS-scoped to this tenant. */
export async function loader({ request, params }: Route.LoaderArgs) {
  if (!z.string().uuid().safeParse(params.orgId).success) {
    throw new Response('Not found', { status: 404 });
  }
  const { accounts, vatCodes } = await withUserOrg(request, params.orgId, async (tx) => ({
    accounts: await listAccountOptions(tx),
    vatCodes: await listVatCodeOptions(tx),
  }));
  return { orgId: params.orgId, accounts, vatCodes };
}

export async function action({ request, params }: Route.ActionArgs) {
  assertSameOrigin(request);
  if (!z.string().uuid().safeParse(params.orgId).success) {
    throw new Response('Not found', { status: 404 });
  }
  const form = await request.formData();
  const parsed = productInput.safeParse({
    name: form.get('name'),
    kind: form.get('kind'),
    description: form.get('description'),
    unit: form.get('unit'),
    unitPriceKr: form.get('unitPriceKr'),
    defaultAccountId: form.get('defaultAccountId'),
    defaultVatCodeId: form.get('defaultVatCodeId'),
  });
  if (!parsed.success) return { error: t('products.form.errorInvalidInput') };

  await withUserOrg(request, params.orgId, async (tx, { user }) => {
    const productId = await createProduct(tx, params.orgId, parsed.data);
    // Sporbarhet (ADR 0062): register writes feed legal documents — attribute them.
    await recordAuditEvent(tx, {
      organizationId: params.orgId,
      actorUserId: user.id,
      action: 'product.created',
      entityId: productId,
    });
  });
  return redirect(`/orgs/${params.orgId}/products`);
}

export default function NewProductRoute({ loaderData, actionData }: Route.ComponentProps) {
  const { orgId, accounts, vatCodes } = loaderData;
  const defaultValues: ProductInput = {
    name: '',
    kind: 'service',
    description: '',
    unit: 'stk',
    unitPriceKr: '',
    defaultAccountId: '',
    defaultVatCodeId: '',
  };

  return (
    <main className="mx-auto grid max-w-xl gap-6 p-6 sm:p-10">
      <header className="grid gap-1">
        <h1 className="font-serif text-3xl tracking-tight">{t('products.form.newTitle')}</h1>
        <p className="text-muted-foreground">{t('products.form.intro')}</p>
      </header>

      <ProductForm
        defaultValues={defaultValues}
        accounts={accounts}
        vatCodes={vatCodes}
        submitLabel={t('products.form.submitCreate')}
        error={actionData?.error}
      />

      <Link
        to={`/orgs/${orgId}/products`}
        className="text-primary font-text inline-flex min-h-11 w-fit items-center text-sm underline-offset-4 hover:underline"
      >
        {t('products.back')}
      </Link>
    </main>
  );
}
