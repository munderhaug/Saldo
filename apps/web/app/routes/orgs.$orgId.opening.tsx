import { useRef } from 'react';
import { TextField } from '~/components/form-field';
import { Form, Link, redirect, useSubmit } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { parseKroner, systemClock } from '@saldo/domain';
import type { Route } from './+types/orgs.$orgId.opening';
import { assertSameOrigin, withUserOrg } from '~/auth/auth.server';
import { recordOpeningBalance } from '~/db/posting.server';
import { organization } from '~/db/schema';
import { openingBalanceInput, OPENING_FIELDS, type OpeningBalanceInput } from '~/contracts';
import { t } from '~/copy';
import { SubmitButton } from '~/components/ui/submit-button';

/**
 * Inngående balanse (feat-opening-balances, build-spec §8.1) — the migration entry for a business
 * arriving mid-year with existing books. The user states what the business owns and owes in everyday
 * words; the action posts ONE balanced opening voucher through the ordinary posting path (the pure
 * `deriveOpeningBalance` + `insertPostedVoucher`), with the difference plugged to equity. Append-only
 * like every voucher — a wrong opening is corrected with a motbilag, never edited (ADR 0061).
 */

export function meta() {
  return [{ title: t('opening.title') }];
}

/** This records ledger positions (an ENK's financial data); keep the page off any shared cache. */
export function headers() {
  return { 'Cache-Control': 'private, no-store' };
}

const orgIdSchema = z.string().uuid();

export async function loader({ request, params }: Route.LoaderArgs) {
  if (!orgIdSchema.safeParse(params.orgId).success) {
    throw new Response('Not found', { status: 404 });
  }
  const org = await withUserOrg(request, params.orgId, async (tx) => {
    const [row] = await tx
      .select({ name: organization.name })
      .from(organization)
      .where(eq(organization.id, params.orgId))
      .limit(1);
    return row ?? null;
  });
  if (!org) throw new Response('Not found', { status: 404 });
  return { orgId: params.orgId, orgName: org.name };
}

export async function action({ request, params }: Route.ActionArgs) {
  assertSameOrigin(request);
  if (!orgIdSchema.safeParse(params.orgId).success) {
    throw new Response('Not found', { status: 404 });
  }
  const form = await request.formData();
  const parsed = openingBalanceInput.safeParse(
    Object.fromEntries(OPENING_FIELDS.map((field) => [field, form.get(field)])),
  );
  if (!parsed.success) return { error: t('opening.errorInvalidInput') };

  // Every field passed the boundary's `parseKroner` refine (empty = not applicable = zero).
  const toOre = (value: string) => (value === '' ? 0 : parseKroner(value)!);
  const year = systemClock.now().getFullYear();

  const result = await withUserOrg(request, params.orgId, (tx) =>
    recordOpeningBalance(tx, {
      organizationId: params.orgId,
      balances: {
        bank: toOre(parsed.data.bank),
        receivable: toOre(parsed.data.receivable),
        fixtures: toOre(parsed.data.fixtures),
        payable: toOre(parsed.data.payable),
        vatSettlement: toOre(parsed.data.vatSettlement),
      },
      year,
    }),
  );
  if (!result.ok) {
    return {
      error: result.reason === 'empty' ? t('opening.errorEmpty') : t('opening.errorGeneric'),
    };
  }
  // Land on the honest-number reveal, which now starts from the right position.
  return redirect('/');
}

const OWN_FIELDS = ['bank', 'receivable', 'fixtures'] as const;
const OWE_FIELDS = ['payable', 'vatSettlement'] as const;
const FIELD_LABEL_KEY = {
  bank: 'opening.bankLabel',
  receivable: 'opening.receivableLabel',
  fixtures: 'opening.fixturesLabel',
  payable: 'opening.payableLabel',
  vatSettlement: 'opening.vatLabel',
} as const;

export default function OpeningBalance({ loaderData, actionData }: Route.ComponentProps) {
  const { orgId, orgName } = loaderData;
  const submit = useSubmit();
  const formRef = useRef<HTMLFormElement>(null);

  // RHF drives inline validation; the real <Form> stays server-authoritative (works without JS — the
  // action re-validates with the same Zod schema and is the source of truth).
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<OpeningBalanceInput>({
    resolver: zodResolver(openingBalanceInput),
    mode: 'onTouched',
    defaultValues: { bank: '', receivable: '', fixtures: '', payable: '', vatSettlement: '' },
  });
  const onValid = () => submit(formRef.current, { method: 'post' });

  return (
    <main className="mx-auto grid max-w-xl gap-6 p-6 sm:p-10">
      <header className="grid gap-1">
        <p className="font-text text-muted-foreground text-sm">{orgName}</p>
        <h1 className="font-text text-2xl tracking-tight">{t('opening.title')}</h1>
        <p className="text-muted-foreground">{t('opening.intro')}</p>
      </header>

      <Form
        method="post"
        ref={formRef}
        onSubmit={(event) => void handleSubmit(onValid)(event)}
        className="grid gap-5"
      >
        <fieldset className="grid gap-4">
          <legend className="font-text text-sm">{t('opening.ownLegend')}</legend>
          {OWN_FIELDS.map((field) => (
            <TextField
              key={field}
              id={field}
              label={t(FIELD_LABEL_KEY[field])}
              hint={t('opening.amountHint')}
              error={errors[field]?.message}
              registration={register(field)}
              inputMode="decimal"
              tabular
            />
          ))}
        </fieldset>

        <fieldset className="grid gap-4">
          <legend className="font-text text-sm">{t('opening.oweLegend')}</legend>
          {OWE_FIELDS.map((field) => (
            <TextField
              key={field}
              id={field}
              label={t(FIELD_LABEL_KEY[field])}
              hint={t('opening.amountHint')}
              error={errors[field]?.message}
              registration={register(field)}
              inputMode="decimal"
              tabular
            />
          ))}
        </fieldset>

        <p className="text-muted-foreground text-sm">{t('opening.equityNote')}</p>
        <p className="text-muted-foreground text-sm">{t('opening.confirmNote')}</p>

        {actionData?.error && (
          <p role="alert" className="text-destructive text-sm">
            {actionData.error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-4">
          <SubmitButton className="bg-primary text-primary-foreground font-text inline-flex min-h-11 items-center rounded-md px-4 py-2 text-sm">
            {t('opening.submit')}
          </SubmitButton>
          <Link
            to={`/orgs/${orgId}`}
            className="text-muted-foreground inline-flex min-h-11 items-center text-sm underline-offset-4 hover:underline"
          >
            {t('opening.cancel')}
          </Link>
        </div>
      </Form>
    </main>
  );
}
