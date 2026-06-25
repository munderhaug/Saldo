import { Link, redirect } from 'react-router';
import { z } from 'zod';
import { isValidOrgNr, orgNr as toOrgNr, proposeMvaStatusFromVatRegister } from '@saldo/domain';
import type { Route } from './+types/orgs.$orgId.contacts.new';
import { assertSameOrigin, withUserOrg } from '~/auth/auth.server';
import { createContact, listAccountOptions, listVatCodeOptions } from '~/db/contacts.server';
import { lookupByOrgNr } from '~/integrations/enhetsregisteret/client.server';
import { contactInput, type ContactInput } from '~/contracts';
import { ContactForm } from '~/components/contact-form';
import { t } from '~/copy';

export function meta() {
  return [{ title: t('contacts.form.newTitle') }];
}

export function headers() {
  return { 'Cache-Control': 'private, no-store' };
}

/**
 * Load the default-picker options (the org's kontoplan + VAT codes), and OPTIONALLY prefill from the
 * Enhetsregisteret lookup (reuses the `/oppslag` client): an `?orgnr=` query is looked up and the name,
 * address, and a PROPOSED MVA status (from the public VAT-register flag) are filled in. The proposal is
 * a deterministic register read, not AI; the human confirms it by submitting.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  if (!z.string().uuid().safeParse(params.orgId).success) {
    throw new Response('Not found', { status: 404 });
  }
  const { accounts, vatCodes } = await withUserOrg(request, params.orgId, async (tx) => ({
    accounts: await listAccountOptions(tx),
    vatCodes: await listVatCodeOptions(tx),
  }));

  const digits = (new URL(request.url).searchParams.get('orgnr') ?? '').replace(/\s/g, '');
  let prefill: { orgNr: string; name: string; mvaStatus: string; city: string } | null = null;
  if (/^\d{9}$/.test(digits) && isValidOrgNr(digits)) {
    const res = await lookupByOrgNr(toOrgNr(digits));
    if (res.ok) {
      prefill = {
        orgNr: digits,
        name: res.enhet.navn,
        mvaStatus: proposeMvaStatusFromVatRegister(res.enhet.registrertIMvaregisteret),
        city: res.enhet.forretningsadresse?.poststed ?? '',
      };
    }
  }
  return { orgId: params.orgId, accounts, vatCodes, prefill };
}

export async function action({ request, params }: Route.ActionArgs) {
  assertSameOrigin(request);
  if (!z.string().uuid().safeParse(params.orgId).success) {
    throw new Response('Not found', { status: 404 });
  }
  const form = await request.formData();
  const parsed = contactInput.safeParse({
    name: form.get('name'),
    role: form.get('role'),
    orgNr: form.get('orgNr'),
    email: form.get('email'),
    phone: form.get('phone'),
    addressLine: form.get('addressLine'),
    postalCode: form.get('postalCode'),
    city: form.get('city'),
    countryCode: form.get('countryCode'),
    mvaStatus: form.get('mvaStatus'),
    paymentTermsDays: form.get('paymentTermsDays'),
    defaultAccountId: form.get('defaultAccountId'),
    defaultVatCodeId: form.get('defaultVatCodeId'),
    currency: form.get('currency'),
    language: form.get('language'),
    notes: form.get('notes'),
  });
  if (!parsed.success) return { error: t('contacts.form.errorInvalidInput') };
  const orgNrDigits = parsed.data.orgNr.replace(/\s/g, '');
  if (orgNrDigits !== '' && !isValidOrgNr(orgNrDigits)) {
    return { error: t('contacts.form.errorInvalidOrgNr') };
  }

  await withUserOrg(request, params.orgId, (tx) => createContact(tx, params.orgId, parsed.data));
  return redirect(`/orgs/${params.orgId}/contacts`);
}

export default function NewContactRoute({ loaderData, actionData }: Route.ComponentProps) {
  const { orgId, accounts, vatCodes, prefill } = loaderData;
  const defaultValues: ContactInput = {
    name: prefill?.name ?? '',
    role: 'customer',
    orgNr: prefill?.orgNr ?? '',
    email: '',
    phone: '',
    addressLine: '',
    postalCode: '',
    city: prefill?.city ?? '',
    countryCode: 'NO',
    mvaStatus: (prefill?.mvaStatus as ContactInput['mvaStatus']) ?? 'under_threshold',
    paymentTermsDays: '14',
    defaultAccountId: '',
    defaultVatCodeId: '',
    currency: 'NOK',
    language: 'nb',
    notes: '',
  };

  return (
    <main className="mx-auto grid max-w-xl gap-6 p-6 sm:p-10">
      <header className="grid gap-1">
        <h1 className="font-serif text-3xl tracking-tight">{t('contacts.form.newTitle')}</h1>
        <p className="text-muted-foreground">{t('contacts.form.intro')}</p>
      </header>

      {prefill ? (
        <p className="text-muted-foreground text-sm">{t('contacts.form.prefilled')}</p>
      ) : (
        <Link
          to="/oppslag"
          className="text-muted-foreground inline-flex min-h-11 w-fit items-center text-sm underline-offset-4 hover:underline"
        >
          {t('contacts.form.findCta')}
        </Link>
      )}

      <ContactForm
        defaultValues={defaultValues}
        accounts={accounts}
        vatCodes={vatCodes}
        submitLabel={t('contacts.form.submitCreate')}
        error={actionData?.error}
      />

      <Link
        to={`/orgs/${orgId}/contacts`}
        className="text-primary font-text inline-flex min-h-11 w-fit items-center text-sm underline-offset-4 hover:underline"
      >
        {t('contacts.back')}
      </Link>
    </main>
  );
}
