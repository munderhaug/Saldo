import { Link, redirect } from 'react-router';
import { z } from 'zod';
import { isValidOrgNr } from '@saldo/domain';
import type { Route } from './+types/orgs.$orgId.contacts.$contactId';
import { assertSameOrigin, withUserOrg } from '~/auth/auth.server';
import {
  listAccountOptions,
  listVatCodeOptions,
  readContact,
  updateContact,
} from '~/db/contacts.server';
import { contactInput, roleFromFlags, type ContactInput } from '~/contracts';
import { ContactForm } from '~/components/contact-form';
import { t } from '~/copy';

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: loaderData?.contact.name ?? t('contacts.form.editTitle') }];
}

export function headers() {
  return { 'Cache-Control': 'private, no-store' };
}

const ids = z.object({ orgId: z.string().uuid(), contactId: z.string().uuid() });

export async function loader({ request, params }: Route.LoaderArgs) {
  if (!ids.safeParse(params).success) throw new Response('Not found', { status: 404 });
  const data = await withUserOrg(request, params.orgId, async (tx) => ({
    contact: await readContact(tx, params.contactId),
    accounts: await listAccountOptions(tx),
    vatCodes: await listVatCodeOptions(tx),
  }));
  if (!data.contact) throw new Response('Not found', { status: 404 });
  return { orgId: params.orgId, ...data, contact: data.contact };
}

export async function action({ request, params }: Route.ActionArgs) {
  assertSameOrigin(request);
  if (!ids.safeParse(params).success) throw new Response('Not found', { status: 404 });
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

  const ok = await withUserOrg(request, params.orgId, (tx) =>
    updateContact(tx, params.orgId, params.contactId, parsed.data),
  );
  if (!ok) throw new Response('Not found', { status: 404 });
  return redirect(`/orgs/${params.orgId}/contacts`);
}

export default function EditContactRoute({ loaderData, actionData }: Route.ComponentProps) {
  const { orgId, contact, accounts, vatCodes } = loaderData;
  const defaultValues: ContactInput = {
    name: contact.name,
    role: roleFromFlags(contact.isCustomer, contact.isSupplier),
    orgNr: contact.orgNr ?? '',
    email: contact.email ?? '',
    phone: contact.phone ?? '',
    addressLine: contact.addressLine ?? '',
    postalCode: contact.postalCode ?? '',
    city: contact.city ?? '',
    countryCode: contact.countryCode,
    mvaStatus: contact.mvaStatus as ContactInput['mvaStatus'],
    paymentTermsDays: String(contact.paymentTermsDays),
    defaultAccountId: contact.defaultAccountId ?? '',
    defaultVatCodeId: contact.defaultVatCodeId ?? '',
    currency: contact.currency,
    language: contact.language as ContactInput['language'],
    notes: contact.notes ?? '',
  };

  return (
    <main className="mx-auto grid max-w-xl gap-6 p-6 sm:p-10">
      <header className="grid gap-1">
        <h1 className="font-serif text-3xl tracking-tight">{contact.name}</h1>
        <p className="text-muted-foreground">{t('contacts.form.editTitle')}</p>
      </header>

      <ContactForm
        defaultValues={defaultValues}
        accounts={accounts}
        vatCodes={vatCodes}
        submitLabel={t('contacts.form.submitSave')}
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
