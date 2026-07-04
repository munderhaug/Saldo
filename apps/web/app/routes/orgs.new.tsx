import { useRef } from 'react';
import { TextField } from '~/components/form-field';
import { Form, Link, redirect, useSubmit } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  isValidOrgNr,
  MVA_STATUSES,
  orgNr as toOrgNr,
  proposeMvaStatusFromVatRegister,
} from '@saldo/domain';
import type { Route } from './+types/orgs.new';
import { db } from '~/db/client';
import { assertSameOrigin, requireUser } from '~/auth/auth.server';
import { createOrganization } from '~/db/organizations.server';
import { lookupByOrgNr } from '~/integrations/enhetsregisteret/client.server';
import { createOrgInput, type CreateOrgInput } from '~/contracts';
import { mvaStatusDesc, mvaStatusLabel } from '~/lib/org-format';
import { t } from '~/copy';
import { SubmitButton } from '~/components/ui/submit-button';

export function meta() {
  return [{ title: t('orgs.new.title') }];
}

/**
 * Prefill from the Enhetsregisteret lookup (consumes `/oppslag`): an `?orgnr=` query is looked up and
 * the name + a PROPOSED MVA status (from the public VAT-register flag) are filled in. The proposal is a
 * deterministic register read, not AI; the human confirms it by submitting (the status forks all posting).
 */
export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);
  const digits = (new URL(request.url).searchParams.get('orgnr') ?? '').replace(/\s/g, '');
  if (!/^\d{9}$/.test(digits) || !isValidOrgNr(digits)) return { prefill: null };

  const res = await lookupByOrgNr(toOrgNr(digits));
  if (!res.ok) return { prefill: null };
  const proposed = proposeMvaStatusFromVatRegister(res.enhet.registrertIMvaregisteret);
  return { prefill: { orgNr: digits, name: res.enhet.navn, mvaStatus: proposed } };
}

export async function action({ request }: Route.ActionArgs) {
  assertSameOrigin(request);
  const user = await requireUser(request);
  const form = await request.formData();

  const parsed = createOrgInput.safeParse({
    orgNr: form.get('orgNr'),
    name: form.get('name'),
    mvaStatus: form.get('mvaStatus'),
  });
  if (!parsed.success) return { error: t('orgs.new.errorInvalidInput') };
  if (!isValidOrgNr(parsed.data.orgNr)) return { error: t('orgs.new.errorInvalidOrgNr') };

  const result = await createOrganization(db, { userId: user.id, ...parsed.data });
  if (!result.ok) return { error: t('orgs.new.errorDuplicate') };
  return redirect(`/orgs/${result.orgId}`);
}

export default function NewOrg({ loaderData, actionData }: Route.ComponentProps) {
  const { prefill } = loaderData;
  const submit = useSubmit();
  const formRef = useRef<HTMLFormElement>(null);

  // React Hook Form drives inline client validation; the real <Form> stays server-authoritative so the
  // page works without JS (the action re-validates with the same Zod schema and is the source of truth).
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateOrgInput>({
    resolver: zodResolver(createOrgInput),
    mode: 'onTouched',
    defaultValues: {
      orgNr: prefill?.orgNr ?? '',
      name: prefill?.name ?? '',
      mvaStatus: prefill?.mvaStatus ?? 'under_threshold',
    },
  });
  const onValid = () => submit(formRef.current, { method: 'post' });

  return (
    <main className="mx-auto grid max-w-xl gap-6 p-6 sm:p-10">
      <header className="grid gap-1">
        <h1 className="font-serif text-3xl tracking-tight">{t('orgs.new.title')}</h1>
        <p className="text-muted-foreground">{t('orgs.new.intro')}</p>
      </header>

      <Form
        method="post"
        ref={formRef}
        onSubmit={(event) => void handleSubmit(onValid)(event)}
        className="grid gap-5"
      >
        {prefill && <p className="text-muted-foreground text-sm">{t('orgs.new.prefilled')}</p>}

        <TextField
          id="orgNr"
          label={t('orgs.new.orgNrLabel')}
          hint={t('orgs.new.orgNrHint')}
          error={errors.orgNr?.message}
          registration={register('orgNr')}
          inputMode="numeric"
          tabular
        />

        <TextField
          id="name"
          label={t('orgs.new.nameLabel')}
          error={errors.name?.message}
          registration={register('name')}
          autoComplete="organization"
        />

        {/* Consequential choice (§5.5): plain language, each option explained, no default magic. */}
        <fieldset className="grid gap-3">
          <legend className="font-text text-sm">{t('orgs.new.mvaLegend')}</legend>
          <p id="mva-hint" className="text-muted-foreground text-sm">
            {t('orgs.new.mvaHint')}
          </p>
          {MVA_STATUSES.map((status) => (
            <label key={status} className="flex items-start gap-3">
              <input
                type="radio"
                value={status}
                aria-describedby={
                  errors.mvaStatus
                    ? `mva-hint mva-${status}-desc mva-error`
                    : `mva-hint mva-${status}-desc`
                }
                className="mt-1"
                {...register('mvaStatus')}
              />
              <span className="grid gap-0.5">
                <span className="font-text text-sm">{mvaStatusLabel(status)}</span>
                <span id={`mva-${status}-desc`} className="text-muted-foreground text-sm">
                  {mvaStatusDesc(status)}
                </span>
              </span>
            </label>
          ))}
          {errors.mvaStatus && (
            <p id="mva-error" role="alert" className="text-destructive text-sm">
              {errors.mvaStatus.message}
            </p>
          )}
        </fieldset>

        {actionData?.error && (
          <p role="alert" className="text-destructive text-sm">
            {actionData.error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-4">
          <SubmitButton className="bg-primary text-primary-foreground font-text inline-flex min-h-11 items-center rounded-md px-4 py-2 text-sm">
            {t('orgs.new.submit')}
          </SubmitButton>
          <Link
            to="/oppslag"
            className="text-muted-foreground inline-flex min-h-11 items-center text-sm underline-offset-4 hover:underline"
          >
            {t('orgs.new.findCta')}
          </Link>
        </div>
      </Form>
    </main>
  );
}

/** A labelled field wrapper: associates label, optional hint, and an announced error with the input. */
