/**
 * Shared create/edit form for a catalogue item (products & services §8.3). Used by `products.new` and
 * `products.$productId`. Semantic-HTML, server-authoritative: a real `<Form method="post">` is the
 * source of truth (the action re-validates with the same `productInput` Zod schema); React Hook Form
 * adds inline client validation only, so the page works without JS.
 *
 * Optimistic UX (frontend.md): the "incl. VAT" figure re-runs the pure domain `grossFromNet` in the
 * browser as the user types a price or picks a VAT code, for instant feedback. The client is
 * authoritative for nothing — the stored price is the net øre the action parses.
 *
 * Accessibility: the shared `TextField`/`SelectField` own the label↔control↔error wiring; the
 * server-error summary takes focus when the action returns one (the no-JS round-trip path).
 */
import { useEffect, useRef } from 'react';
import { Form, useSubmit } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { formatKr, grossFromNet, parseKroner, rate } from '@saldo/domain';
import { productInput, PRODUCT_KINDS, type ProductInput } from '~/contracts';
import type { AccountOption, VatCodeOption } from '~/db/products.server';
import { productKindLabel } from '~/lib/product-format';
import { SelectField, TextField } from '~/components/form-field';
import { t } from '~/copy';
import { SubmitButton } from '~/components/ui/submit-button';

export interface ProductFormProps {
  readonly defaultValues: ProductInput;
  readonly accounts: readonly AccountOption[];
  readonly vatCodes: readonly VatCodeOption[];
  readonly submitLabel: string;
  readonly error?: string | undefined;
}

export function ProductForm({
  defaultValues,
  accounts,
  vatCodes,
  submitLabel,
  error,
}: ProductFormProps) {
  const submit = useSubmit();
  const formRef = useRef<HTMLFormElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ProductInput>({
    resolver: zodResolver(productInput),
    mode: 'onTouched',
    defaultValues,
  });
  const onValid = () => submit(formRef.current, { method: 'post' });

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  // Live incl-VAT preview: net price × the chosen VAT code's rate, via the pure domain helper.
  const priceInclVat = grossPreview(watch('unitPriceKr'), watch('defaultVatCodeId'), vatCodes);

  return (
    <Form
      method="post"
      ref={formRef}
      onSubmit={(event) => void handleSubmit(onValid)(event)}
      className="grid gap-5"
    >
      <TextField
        id="name"
        label={t('products.form.nameLabel')}
        error={errors.name?.message}
        registration={register('name')}
      />

      <fieldset className="grid gap-2">
        <legend className="font-text text-sm">{t('products.form.kindLegend')}</legend>
        <p id="kind-hint" className="text-muted-foreground text-sm">
          {t('products.form.kindHint')}
        </p>
        {PRODUCT_KINDS.map((kind) => (
          <label key={kind} className="flex items-center gap-3">
            <input
              type="radio"
              value={kind}
              aria-describedby={errors.kind ? 'kind-hint kind-error' : 'kind-hint'}
              className="size-4"
              {...register('kind')}
            />
            <span className="font-text text-sm">{productKindLabel(kind)}</span>
          </label>
        ))}
        {errors.kind && (
          <p id="kind-error" role="alert" className="text-destructive text-sm">
            {errors.kind.message}
          </p>
        )}
      </fieldset>

      <div className="grid gap-1.5">
        <label htmlFor="description" className="font-text text-sm">
          {t('products.form.descriptionLabel')}
        </label>
        <textarea
          id="description"
          rows={3}
          aria-invalid={errors.description ? true : undefined}
          aria-describedby={
            errors.description ? 'description-hint description-error' : 'description-hint'
          }
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
          {...register('description')}
        />
        <p id="description-hint" className="text-muted-foreground text-sm">
          {t('products.form.descriptionHint')}
        </p>
        {errors.description && (
          <p id="description-error" role="alert" className="text-destructive text-sm">
            {errors.description.message}
          </p>
        )}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          id="unit"
          label={t('products.form.unitLabel')}
          hint={t('products.form.unitHint')}
          error={errors.unit?.message}
          registration={register('unit')}
        />
        <div className="grid gap-1.5">
          <TextField
            id="unitPriceKr"
            label={t('products.form.priceLabel')}
            hint={t('products.form.priceHint')}
            error={errors.unitPriceKr?.message}
            registration={register('unitPriceKr')}
            inputMode="numeric"
            tabular
            extraDescribedBy={priceInclVat !== null ? 'unitPriceKr-incl' : undefined}
          />
          {/* Status region: kept mounted so updates are announced; empty until a gross is derivable. */}
          <p
            id="unitPriceKr-incl"
            className="text-muted-foreground tabular text-sm"
            aria-live="polite"
          >
            {priceInclVat !== null ? t('products.form.priceInclVat', { amount: priceInclVat }) : ''}
          </p>
        </div>
      </div>

      <fieldset className="grid gap-5">
        <legend className="font-text text-sm">{t('products.form.defaultsLegend')}</legend>
        <p id="defaults-hint" className="text-muted-foreground text-sm">
          {t('products.form.defaultsHint')}
        </p>
        <div className="grid gap-5 sm:grid-cols-2">
          <SelectField
            id="defaultAccountId"
            label={t('products.form.defaultAccountLabel')}
            error={errors.defaultAccountId?.message}
            registration={register('defaultAccountId')}
          >
            <option value="">{t('products.form.noneOption')}</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.number} — {a.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            id="defaultVatCodeId"
            label={t('products.form.defaultVatCodeLabel')}
            error={errors.defaultVatCodeId?.message}
            registration={register('defaultVatCodeId')}
          >
            <option value="">{t('products.form.noneOption')}</option>
            {vatCodes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code}
              </option>
            ))}
          </SelectField>
        </div>
      </fieldset>

      {error && (
        <p ref={errorRef} tabIndex={-1} role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      <SubmitButton
        className="bg-primary text-primary-foreground font-text inline-flex min-h-11 w-fit items-center rounded-md px-4 py-2 text-sm"
      >
        {submitLabel}
      </SubmitButton>
    </Form>
  );
}

/**
 * The gross (incl. VAT) figure for the preview, or `null` when there's nothing to show (no valid
 * price, or no VAT code chosen). Pure: parses the kroner string to øre and applies the chosen code's
 * rate through the domain `grossFromNet`, then formats once via `formatKr` — no float math here.
 */
function grossPreview(
  priceKr: string,
  vatCodeId: string,
  vatCodes: readonly VatCodeOption[],
): string | null {
  const net = parseKroner(priceKr.trim() === '' ? '0' : priceKr);
  if (net === null) return null;
  const chosen = vatCodes.find((c) => c.id === vatCodeId);
  if (!chosen) return null;
  return formatKr(grossFromNet(net, rate(Number(chosen.rate))).gross);
}
