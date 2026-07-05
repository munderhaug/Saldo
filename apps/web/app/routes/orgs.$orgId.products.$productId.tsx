import { Link, redirect } from 'react-router';
import { z } from 'zod';
import { formatKr, øre } from '@saldo/domain';
import type { Route } from './+types/orgs.$orgId.products.$productId';
import { assertSameOrigin, withUserOrg } from '~/auth/auth.server';
import {
  listAccountOptions,
  listVatCodeOptions,
  readProduct,
  updateProduct,
} from '~/db/products.server';
import { recordAuditEvent } from '~/db/audit.server';
import { productInput, type ProductInput } from '~/contracts';
import { ProductForm } from '~/components/product-form';
import { t } from '~/copy';

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: loaderData?.product.name ?? t('products.form.editTitle') }];
}

export function headers() {
  return { 'Cache-Control': 'private, no-store' };
}

const ids = z.object({ orgId: z.string().uuid(), productId: z.string().uuid() });

export async function loader({ request, params }: Route.LoaderArgs) {
  if (!ids.safeParse(params).success) throw new Response('Not found', { status: 404 });
  const data = await withUserOrg(request, params.orgId, async (tx) => ({
    product: await readProduct(tx, params.productId),
    accounts: await listAccountOptions(tx),
    vatCodes: await listVatCodeOptions(tx),
  }));
  if (!data.product) throw new Response('Not found', { status: 404 });
  return { orgId: params.orgId, ...data, product: data.product };
}

export async function action({ request, params }: Route.ActionArgs) {
  assertSameOrigin(request);
  if (!ids.safeParse(params).success) throw new Response('Not found', { status: 404 });
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

  const ok = await withUserOrg(request, params.orgId, async (tx, { user }) => {
    const updated = await updateProduct(tx, params.orgId, params.productId, parsed.data);
    if (updated) {
      // Sporbarhet (ADR 0062): register writes feed legal documents — attribute them.
      await recordAuditEvent(tx, {
        organizationId: params.orgId,
        actorUserId: user.id,
        action: 'product.updated',
        entityId: params.productId,
      });
    }
    return updated;
  });
  if (!ok) throw new Response('Not found', { status: 404 });
  return redirect(`/orgs/${params.orgId}/products`);
}

export default function EditProductRoute({ loaderData, actionData }: Route.ComponentProps) {
  const { orgId, product, accounts, vatCodes } = loaderData;
  const defaultValues: ProductInput = {
    name: product.name,
    kind: product.kind as ProductInput['kind'],
    description: product.description ?? '',
    unit: product.unit,
    // Net øre → the kroner string the form edits (e.g. 125000 → "1250,00"); blank stays "0".
    unitPriceKr: product.unitPriceOre === 0 ? '' : formatKr(øre(product.unitPriceOre)),
    defaultAccountId: product.defaultAccountId ?? '',
    defaultVatCodeId: product.defaultVatCodeId ?? '',
  };

  return (
    <main className="mx-auto grid max-w-xl gap-6 p-6 sm:p-10">
      <header className="grid gap-1">
        <h1 className="font-serif text-3xl tracking-tight">{product.name}</h1>
        <p className="text-muted-foreground">{t('products.form.editTitle')}</p>
      </header>

      <ProductForm
        defaultValues={defaultValues}
        accounts={accounts}
        vatCodes={vatCodes}
        submitLabel={t('products.form.submitSave')}
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
