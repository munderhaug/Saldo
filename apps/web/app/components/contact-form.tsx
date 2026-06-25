/**
 * Shared create/edit form for a contact (register §8.2). Used by `contacts.new` and
 * `contacts.$contactId`. Semantic-HTML, server-authoritative: a real `<Form method="post">` is the
 * source of truth (the action re-validates with the same `contactInput` Zod schema); React Hook Form
 * adds inline client validation only, so the page works without JS.
 *
 * Accessibility: `TextField`/`SelectField` own the label↔control↔error wiring so every control that
 * can show an error is `aria-invalid` and `aria-describedby` its hint + error (WCAG 1.3.1/3.3.1/4.1.3),
 * never left to the call site. The server-error summary takes focus when the action returns one (the
 * no-JS round-trip path).
 */
import { useEffect, useRef } from 'react';
import { Form, useSubmit } from 'react-router';
import { useForm, type UseFormRegisterReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { MVA_STATUSES } from '@saldo/domain';
import { contactInput, CONTACT_LANGUAGES, CONTACT_ROLES, type ContactInput } from '~/contracts';
import type { AccountOption, VatCodeOption } from '~/db/contacts.server';
import { mvaStatusLabel } from '~/lib/org-format';
import { contactLanguageLabel, contactRoleLabel } from '~/lib/contact-format';
import { cn } from '~/lib/utils';
import { t } from '~/copy';

export interface ContactFormProps {
  readonly defaultValues: ContactInput;
  readonly accounts: readonly AccountOption[];
  readonly vatCodes: readonly VatCodeOption[];
  readonly submitLabel: string;
  readonly error?: string | undefined;
}

export function ContactForm({
  defaultValues,
  accounts,
  vatCodes,
  submitLabel,
  error,
}: ContactFormProps) {
  const submit = useSubmit();
  const formRef = useRef<HTMLFormElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ContactInput>({
    resolver: zodResolver(contactInput),
    mode: 'onTouched',
    defaultValues,
  });
  const onValid = () => submit(formRef.current, { method: 'post' });

  // The action returns a single summary error on the no-JS round-trip; move focus to it so a
  // screen-reader user is told, rather than silently re-rendering the page (WCAG 3.3.1).
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
        id="name"
        label={t('contacts.form.nameLabel')}
        error={errors.name?.message}
        registration={register('name')}
      />

      <fieldset className="grid gap-2">
        <legend className="font-text text-sm">{t('contacts.form.roleLegend')}</legend>
        <p id="role-hint" className="text-muted-foreground text-sm">
          {t('contacts.form.roleHint')}
        </p>
        {CONTACT_ROLES.map((role) => (
          <label key={role} className="flex items-center gap-3">
            <input
              type="radio"
              value={role}
              aria-describedby={errors.role ? 'role-hint role-error' : 'role-hint'}
              className="size-4"
              {...register('role')}
            />
            <span className="font-text text-sm">
              {contactRoleLabel(role !== 'supplier', role !== 'customer')}
            </span>
          </label>
        ))}
        {errors.role && (
          <p id="role-error" role="alert" className="text-destructive text-sm">
            {errors.role.message}
          </p>
        )}
      </fieldset>

      <TextField
        id="orgNr"
        label={t('contacts.form.orgNrLabel')}
        hint={t('contacts.form.orgNrHint')}
        error={errors.orgNr?.message}
        registration={register('orgNr')}
        inputMode="numeric"
        tabular
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          id="email"
          label={t('contacts.form.emailLabel')}
          error={errors.email?.message}
          registration={register('email')}
          type="email"
        />
        <TextField
          id="phone"
          label={t('contacts.form.phoneLabel')}
          error={errors.phone?.message}
          registration={register('phone')}
          type="tel"
        />
      </div>

      <fieldset className="grid gap-5">
        <legend className="font-text text-sm">{t('contacts.form.addressLegend')}</legend>
        <TextField
          id="addressLine"
          label={t('contacts.form.addressLineLabel')}
          error={errors.addressLine?.message}
          registration={register('addressLine')}
        />
        <div className="grid gap-5 sm:grid-cols-3">
          <TextField
            id="postalCode"
            label={t('contacts.form.postalCodeLabel')}
            error={errors.postalCode?.message}
            registration={register('postalCode')}
            inputMode="numeric"
            tabular
          />
          <TextField
            id="city"
            label={t('contacts.form.cityLabel')}
            error={errors.city?.message}
            registration={register('city')}
          />
          <TextField
            id="countryCode"
            label={t('contacts.form.countryCodeLabel')}
            error={errors.countryCode?.message}
            registration={register('countryCode')}
            maxLength={2}
            uppercase
          />
        </div>
      </fieldset>

      <SelectField
        id="mvaStatus"
        label={t('contacts.form.mvaLegend')}
        hint={t('contacts.form.mvaHint')}
        error={errors.mvaStatus?.message}
        registration={register('mvaStatus')}
      >
        {MVA_STATUSES.map((status) => (
          <option key={status} value={status}>
            {mvaStatusLabel(status)}
          </option>
        ))}
      </SelectField>

      <fieldset className="grid gap-5">
        <legend className="font-text text-sm">{t('contacts.form.defaultsLegend')}</legend>
        <p id="defaults-hint" className="text-muted-foreground text-sm">
          {t('contacts.form.defaultsHint')}
        </p>
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            id="paymentTermsDays"
            label={t('contacts.form.paymentTermsLabel')}
            error={errors.paymentTermsDays?.message}
            registration={register('paymentTermsDays')}
            type="number"
            inputMode="numeric"
            min={0}
            max={365}
            tabular
          />
          <TextField
            id="currency"
            label={t('contacts.form.currencyLabel')}
            error={errors.currency?.message}
            registration={register('currency')}
            maxLength={3}
            uppercase
          />
          <SelectField
            id="defaultAccountId"
            label={t('contacts.form.defaultAccountLabel')}
            error={errors.defaultAccountId?.message}
            registration={register('defaultAccountId')}
          >
            <option value="">{t('contacts.form.noneOption')}</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.number} — {a.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            id="defaultVatCodeId"
            label={t('contacts.form.defaultVatCodeLabel')}
            error={errors.defaultVatCodeId?.message}
            registration={register('defaultVatCodeId')}
          >
            <option value="">{t('contacts.form.noneOption')}</option>
            {vatCodes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code}
              </option>
            ))}
          </SelectField>
          <SelectField
            id="language"
            label={t('contacts.form.languageLabel')}
            error={errors.language?.message}
            registration={register('language')}
          >
            {CONTACT_LANGUAGES.map((lang) => (
              <option key={lang} value={lang}>
                {contactLanguageLabel(lang)}
              </option>
            ))}
          </SelectField>
        </div>
      </fieldset>

      <div className="grid gap-1.5">
        <label htmlFor="notes" className="font-text text-sm">
          {t('contacts.form.notesLabel')}
        </label>
        <textarea
          id="notes"
          rows={3}
          aria-invalid={errors.notes ? true : undefined}
          aria-describedby={errors.notes ? 'notes-error' : undefined}
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
          {...register('notes')}
        />
        {errors.notes && (
          <p id="notes-error" role="alert" className="text-destructive text-sm">
            {errors.notes.message}
          </p>
        )}
      </div>

      {error && (
        <p ref={errorRef} tabIndex={-1} role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      <button
        type="submit"
        className="bg-primary text-primary-foreground font-text inline-flex min-h-11 w-fit items-center rounded-md px-4 py-2 text-sm"
      >
        {submitLabel}
      </button>
    </Form>
  );
}

/** Programmatic description: hint + error ids, in reading order, or `undefined` when neither exists. */
function describedBy(id: string, hasHint: boolean, hasError: boolean): string | undefined {
  const ids = [hasHint ? `${id}-hint` : '', hasError ? `${id}-error` : ''].filter(Boolean);
  return ids.length ? ids.join(' ') : undefined;
}

interface FieldShared {
  readonly id: string;
  readonly label: string;
  readonly hint?: string | undefined;
  readonly error?: string | undefined;
  readonly registration: UseFormRegisterReturn;
}

/** A labelled text input that wires label, hint, error, and the aria error association together. */
function TextField({
  id,
  label,
  hint,
  error,
  registration,
  type = 'text',
  inputMode,
  maxLength,
  min,
  max,
  uppercase,
  tabular,
}: FieldShared & {
  type?: string;
  inputMode?: 'numeric';
  maxLength?: number;
  min?: number;
  max?: number;
  uppercase?: boolean;
  tabular?: boolean;
}) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="font-text text-sm">
        {label}
      </label>
      <input
        id={id}
        type={type}
        inputMode={inputMode}
        maxLength={maxLength}
        min={min}
        max={max}
        autoComplete="off"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, !!hint, !!error)}
        className={cn(
          'border-input bg-background rounded-md border px-3 py-2 text-sm',
          tabular && 'tabular',
          uppercase && 'uppercase',
        )}
        {...registration}
      />
      {hint && (
        <p id={`${id}-hint`} className="text-muted-foreground text-sm">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  );
}

/** A labelled select with the same label/hint/error + aria wiring as `TextField`. */
function SelectField({
  id,
  label,
  hint,
  error,
  registration,
  children,
}: FieldShared & { children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="font-text text-sm">
        {label}
      </label>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, !!hint, !!error)}
        className="border-input bg-background rounded-md border px-3 py-2 text-sm"
        {...registration}
      >
        {children}
      </select>
      {hint && (
        <p id={`${id}-hint`} className="text-muted-foreground text-sm">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
