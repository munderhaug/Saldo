/**
 * Settings form for the org's invoice payout account (the EHF `cac:PayeeFinancialAccount`). Used by
 * `orgs.$orgId.settings`. Semantic-HTML, server-authoritative: a real `<Form method="post">` is the
 * source of truth (the action re-validates with the same `orgPayoutInput` schema PLUS the domain
 * BBAN/IBAN checksum), so the page works without JS; React Hook Form adds inline validation only.
 *
 * This is a §5.5 "money" surface (the account a customer pays into), so the voice stays plain and calm.
 * Accessibility: `TextField` owns the label↔control↔error wiring; the server-error summary takes focus
 * on the no-JS round-trip.
 */
import { useEffect, useRef } from 'react';
import { Form, useSubmit } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { orgPayoutInput, type OrgPayoutInput } from '~/contracts';
import { TextField } from '~/components/form-field';
import { t } from '~/copy';

export interface OrgPayoutFormProps {
  readonly defaultValues: OrgPayoutInput;
  readonly error?: string | undefined;
}

export function OrgPayoutForm({ defaultValues, error }: OrgPayoutFormProps) {
  const submit = useSubmit();
  const formRef = useRef<HTMLFormElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<OrgPayoutInput>({
    resolver: zodResolver(orgPayoutInput),
    mode: 'onTouched',
    defaultValues,
  });
  const onValid = () => submit(formRef.current, { method: 'post' });

  // The action returns a single summary error on the no-JS round-trip; move focus to it (WCAG 3.3.1).
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  return (
    <Form
      method="post"
      ref={formRef}
      onSubmit={(event) => void handleSubmit(onValid)(event)}
      className="grid gap-5"
    >
      <TextField
        id="invoicePaymentAccount"
        label={t('settings.accountLabel')}
        hint={t('settings.accountHint')}
        error={errors.invoicePaymentAccount?.message}
        registration={register('invoicePaymentAccount')}
        tabular
      />
      <TextField
        id="invoicePaymentAccountName"
        label={t('settings.accountNameLabel')}
        hint={t('settings.accountNameHint')}
        error={errors.invoicePaymentAccountName?.message}
        registration={register('invoicePaymentAccountName')}
      />

      {error && (
        <p ref={errorRef} tabIndex={-1} role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      <button
        type="submit"
        className="bg-primary text-primary-foreground font-text inline-flex min-h-11 w-fit items-center rounded-md px-4 py-2 text-sm"
      >
        {t('settings.submitSave')}
      </button>
    </Form>
  );
}
