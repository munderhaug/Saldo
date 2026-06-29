import { Link, redirect } from 'react-router';
import { z } from 'zod';
import { isValidBankAccount } from '@saldo/domain';
import type { Route } from './+types/orgs.$orgId.settings';
import { assertSameOrigin, withUserOrg } from '~/auth/auth.server';
import { readOrgPayout, updateOrgPayout } from '~/db/organizations.server';
import { orgPayoutInput, type OrgPayoutInput } from '~/contracts';
import { OrgPayoutForm } from '~/components/org-payout-form';
import { t } from '~/copy';

export function meta() {
  return [{ title: t('settings.title') }];
}

/** Org identity + payout account is financial data; keep the page off any shared cache. */
export function headers() {
  return { 'Cache-Control': 'private, no-store' };
}

const ids = z.object({ orgId: z.string().uuid() });

export async function loader({ request, params }: Route.LoaderArgs) {
  if (!ids.safeParse(params).success) throw new Response('Not found', { status: 404 });
  const org = await withUserOrg(request, params.orgId, (tx) => readOrgPayout(tx, params.orgId));
  if (!org) throw new Response('Not found', { status: 404 });
  return { orgId: params.orgId, org };
}

export async function action({ request, params }: Route.ActionArgs) {
  assertSameOrigin(request);
  if (!ids.safeParse(params).success) throw new Response('Not found', { status: 404 });
  const form = await request.formData();
  const parsed = orgPayoutInput.safeParse({
    invoicePaymentAccount: form.get('invoicePaymentAccount'),
    invoicePaymentAccountName: form.get('invoicePaymentAccountName'),
  });
  if (!parsed.success) return { error: t('settings.errorInvalidInput') };

  // The shape passed; the BBAN mod11 / IBAN mod-97 checksum is the domain's call (the org-nr pattern).
  const accountNo = parsed.data.invoicePaymentAccount.replace(/[\s.]/g, '');
  if (accountNo !== '' && !isValidBankAccount(accountNo)) {
    return { error: t('settings.errorInvalidAccount') };
  }

  const ok = await withUserOrg(request, params.orgId, (tx) =>
    updateOrgPayout(tx, params.orgId, parsed.data),
  );
  if (!ok) throw new Response('Not found', { status: 404 });
  return redirect(`/orgs/${params.orgId}`);
}

export default function OrgSettingsRoute({ loaderData, actionData }: Route.ComponentProps) {
  const { orgId, org } = loaderData;
  const defaultValues: OrgPayoutInput = {
    invoicePaymentAccount: org.invoicePaymentAccount ?? '',
    invoicePaymentAccountName: org.invoicePaymentAccountName ?? '',
  };

  return (
    <main className="mx-auto grid max-w-xl gap-6 p-6 sm:p-10">
      <header className="grid gap-1">
        <h1 className="font-serif text-3xl tracking-tight">{t('settings.title')}</h1>
        <p className="text-muted-foreground">{t('settings.intro')}</p>
      </header>

      <OrgPayoutForm defaultValues={defaultValues} error={actionData?.error} />

      <Link
        to={`/orgs/${orgId}`}
        className="text-primary font-text inline-flex min-h-11 w-fit items-center text-sm underline-offset-4 hover:underline"
      >
        {t('settings.back')}
      </Link>
    </main>
  );
}
