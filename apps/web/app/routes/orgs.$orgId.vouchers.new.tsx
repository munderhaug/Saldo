import { useRef } from 'react';
import { Form, Link, redirect, useSubmit } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { chargesOutputVat, parseKroner, systemClock } from '@saldo/domain';
import type { Route } from './+types/orgs.$orgId.vouchers.new';
import { assertSameOrigin, withUserOrg } from '~/auth/auth.server';
import { recordManualVoucher } from '~/db/posting.server';
import { organization } from '~/db/schema';
import { asMvaStatus } from '~/lib/org-format';
import { manualVoucherInput, VOUCHER_KINDS, type ManualVoucherInput } from '~/contracts';
import { t } from '~/copy';

export function meta() {
  return [{ title: t('vouchers.new.title') }];
}

/** This records ledger activity (an ENK's financial data); keep the page off any shared cache. */
export function headers() {
  return { 'Cache-Control': 'private, no-store' };
}

const orgIdSchema = z.string().uuid();

/** Prove membership + tenant scope, and read the org header we need to tailor the sober copy. */
export async function loader({ request, params }: Route.LoaderArgs) {
  if (!orgIdSchema.safeParse(params.orgId).success) {
    throw new Response('Not found', { status: 404 });
  }
  const org = await withUserOrg(request, params.orgId, async (tx) => {
    const [row] = await tx
      .select({ name: organization.name, mvaStatus: organization.mvaStatus })
      .from(organization)
      .where(eq(organization.id, params.orgId))
      .limit(1);
    return row ?? null;
  });
  if (!org) throw new Response('Not found', { status: 404 });
  return {
    orgId: params.orgId,
    orgName: org.name,
    isRegistered: chargesOutputVat(asMvaStatus(org.mvaStatus)),
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  assertSameOrigin(request);
  if (!orgIdSchema.safeParse(params.orgId).success) {
    throw new Response('Not found', { status: 404 });
  }
  const form = await request.formData();
  const parsed = manualVoucherInput.safeParse({
    kind: form.get('kind'),
    amount: form.get('amount'),
  });
  if (!parsed.success) return { error: t('vouchers.new.errorInvalidInput') };

  // The amount passed the boundary's `parseKroner` refine, so re-parsing it is total here.
  const net = parseKroner(parsed.data.amount)!;
  const year = systemClock.now().getFullYear();

  const result = await withUserOrg(request, params.orgId, (tx) =>
    recordManualVoucher(tx, {
      organizationId: params.orgId,
      kind: parsed.data.kind,
      net,
      year,
    }),
  );
  if (!result.ok) {
    return {
      error:
        result.reason === 'vat-not-registered'
          ? t('vouchers.new.errorVatNotRegistered')
          : t('vouchers.new.errorGeneric'),
    };
  }
  // Land on the honest-number reveal, which now shows real figures.
  return redirect('/');
}

export default function NewVoucher({ loaderData, actionData }: Route.ComponentProps) {
  const { orgId, orgName, isRegistered } = loaderData;
  const submit = useSubmit();
  const formRef = useRef<HTMLFormElement>(null);

  // RHF drives inline validation; the real <Form> stays server-authoritative (works without JS — the
  // action re-validates with the same Zod schema and is the source of truth).
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ManualVoucherInput>({
    resolver: zodResolver(manualVoucherInput),
    mode: 'onTouched',
    defaultValues: { kind: 'income', amount: '' },
  });
  const onValid = () => submit(formRef.current, { method: 'post' });

  return (
    <main className="mx-auto grid max-w-xl gap-6 p-6 sm:p-10">
      <header className="grid gap-1">
        <p className="font-text text-muted-foreground text-sm">{orgName}</p>
        {/* A money-touching act (§5.5): plain, sober heading — no display serif, no flourish. */}
        <h1 className="font-text text-2xl tracking-tight">{t('vouchers.new.title')}</h1>
        <p className="text-muted-foreground">{t('vouchers.new.intro')}</p>
      </header>

      <Form
        method="post"
        ref={formRef}
        onSubmit={(event) => void handleSubmit(onValid)(event)}
        className="grid gap-5"
      >
        <fieldset className="grid gap-3">
          <legend className="font-text text-sm">{t('vouchers.new.kindLegend')}</legend>
          {VOUCHER_KINDS.map((kind) => (
            <label key={kind} className="flex items-start gap-3">
              <input
                type="radio"
                value={kind}
                aria-describedby={
                  errors.kind ? `kind-${kind}-desc kind-error` : `kind-${kind}-desc`
                }
                className="mt-1"
                {...register('kind')}
              />
              <span className="grid gap-0.5">
                <span className="font-text text-sm">{t(`vouchers.new.kind.${kind}.label`)}</span>
                <span id={`kind-${kind}-desc`} className="text-muted-foreground text-sm">
                  {t(`vouchers.new.kind.${kind}.desc`)}
                </span>
              </span>
            </label>
          ))}
          {errors.kind && (
            <p id="kind-error" role="alert" className="text-destructive text-sm">
              {errors.kind.message}
            </p>
          )}
        </fieldset>

        <div className="grid gap-1.5">
          <label htmlFor="amount" className="font-text text-sm">
            {t('vouchers.new.amountLabel')}
          </label>
          <input
            id="amount"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            aria-describedby={errors.amount ? 'amount-error amount-hint' : 'amount-hint'}
            aria-invalid={errors.amount ? true : undefined}
            className="border-input bg-background tabular rounded-md border px-3 py-2 text-sm"
            {...register('amount')}
          />
          <p id="amount-hint" className="text-muted-foreground text-sm">
            {isRegistered
              ? t('vouchers.new.amountHintRegistered')
              : t('vouchers.new.amountHintPlain')}
          </p>
          {errors.amount && (
            <p id="amount-error" role="alert" className="text-destructive text-sm">
              {errors.amount.message}
            </p>
          )}
        </div>

        <p className="text-muted-foreground text-sm">{t('vouchers.new.confirmNote')}</p>

        {actionData?.error && (
          <p role="alert" className="text-destructive text-sm">
            {actionData.error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-4">
          <button
            type="submit"
            className="bg-primary text-primary-foreground font-text inline-flex min-h-11 items-center rounded-md px-4 py-2 text-sm"
          >
            {t('vouchers.new.submit')}
          </button>
          <Link
            to={`/orgs/${orgId}`}
            className="text-muted-foreground inline-flex min-h-11 items-center text-sm underline-offset-4 hover:underline"
          >
            {t('vouchers.new.cancel')}
          </Link>
        </div>
      </Form>
    </main>
  );
}
