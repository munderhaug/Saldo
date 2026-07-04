/**
 * Add a bank account (build-spec §8.7). A small register form: a label, an optional account number/IBAN,
 * currency, and an optional GoCardless account id that links it to live AIS fetches. RHF + the shared
 * `bankAccountInput` Zod schema drive inline validation; the real `<Form>` stays server-authoritative
 * (the action re-validates — the client is authoritative for nothing). Account number is financial data.
 */
import { useRef } from 'react';
import { TextField } from '~/components/form-field';
import { Form, Link, redirect, useSubmit } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { Route } from './+types/orgs.$orgId.bank.new';
import { assertSameOrigin, withUserOrg } from '~/auth/auth.server';
import { createBankAccount } from '~/db/bank.server';
import { bankAccountInput, type BankAccountInput } from '~/contracts';
import { t } from '~/copy';
import { SubmitButton } from '~/components/ui/submit-button';

export function meta() {
  return [{ title: t('bank.form.title') }];
}

export function headers() {
  return { 'Cache-Control': 'private, no-store' };
}

export async function loader({ request, params }: Route.LoaderArgs) {
  if (!z.string().uuid().safeParse(params.orgId).success) {
    throw new Response('Not found', { status: 404 });
  }
  // Prove membership + tenant access before showing the form (no data to load).
  await withUserOrg(request, params.orgId, () => Promise.resolve(null));
  return { orgId: params.orgId };
}

export async function action({ request, params }: Route.ActionArgs) {
  assertSameOrigin(request);
  if (!z.string().uuid().safeParse(params.orgId).success) {
    throw new Response('Not found', { status: 404 });
  }
  const form = await request.formData();
  const parsed = bankAccountInput.safeParse({
    label: form.get('label'),
    accountNumber: form.get('accountNumber'),
    currency: form.get('currency'),
    gocardlessAccountId: form.get('gocardlessAccountId'),
  });
  if (!parsed.success) return { error: t('bank.form.errorInvalid') };

  const id = await withUserOrg(request, params.orgId, (tx) =>
    createBankAccount(tx, params.orgId, parsed.data),
  );
  return redirect(`/orgs/${params.orgId}/bank/${id}`);
}

export default function NewBankAccountRoute({ loaderData, actionData }: Route.ComponentProps) {
  const { orgId } = loaderData;
  const submit = useSubmit();
  const formRef = useRef<HTMLFormElement>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<BankAccountInput>({
    resolver: zodResolver(bankAccountInput),
    mode: 'onTouched',
    defaultValues: { label: '', accountNumber: '', currency: 'NOK', gocardlessAccountId: '' },
  });
  const onValid = () => submit(formRef.current, { method: 'post' });

  return (
    <main className="mx-auto grid max-w-xl gap-6 p-6 sm:p-10">
      <header className="grid gap-1">
        <h1 className="font-serif text-3xl tracking-tight">{t('bank.form.title')}</h1>
        <p className="text-muted-foreground">{t('bank.form.intro')}</p>
      </header>

      <Form
        method="post"
        ref={formRef}
        onSubmit={(event) => void handleSubmit(onValid)(event)}
        className="grid gap-5"
      >
        <TextField
          id="label"
          label={t('bank.form.labelLabel')}
          hint={t('bank.form.labelHint')}
          error={errors.label?.message}
          registration={register('label')}
        />
        <TextField
          id="accountNumber"
          label={t('bank.form.accountNumberLabel')}
          hint={t('bank.form.accountNumberHint')}
          error={errors.accountNumber?.message}
          registration={register('accountNumber')}
          inputMode="numeric"
          tabular
        />
        <TextField
          id="currency"
          label={t('bank.form.currencyLabel')}
          error={errors.currency?.message}
          registration={register('currency')}
          uppercase
        />
        <TextField
          id="gocardlessAccountId"
          label={t('bank.form.gocardlessLabel')}
          hint={t('bank.form.gocardlessHint')}
          error={errors.gocardlessAccountId?.message}
          registration={register('gocardlessAccountId')}
          autoComplete="off"
        />

        {actionData?.error && (
          <p role="alert" className="text-destructive text-sm">
            {actionData.error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-4">
          <SubmitButton className="bg-primary text-primary-foreground font-text inline-flex min-h-11 items-center rounded-md px-4 py-2 text-sm">
            {t('bank.form.submit')}
          </SubmitButton>
          <Link
            to={`/orgs/${orgId}/bank`}
            className="text-muted-foreground inline-flex min-h-11 items-center text-sm underline-offset-4 hover:underline"
          >
            {t('bank.form.cancel')}
          </Link>
        </div>
      </Form>
    </main>
  );
}
