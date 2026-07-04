/**
 * The supplier-invoice draft editor (build-spec §8.5) — shared by the new-purchase route and the draft
 * editor on the detail route. Semantic `<Form method="post">` is authoritative (it round-trips without
 * JS); React-Hook-Form adds inline validation and the live, in-browser net/VAT preview, computed by the
 * PURE domain (`lineNet` / `mulRate`) exactly as the server will — but the action + SQL decide.
 *
 * A purchase line books to a COST account at a SAF-T input/reverse-charge code; a per-line deduction
 * choice encodes the non-deductible-even-when-registered cases (representasjon / restricted vehicle /
 * private use, §4.3). A reverse-charge code carries no document VAT (the supplier never charges it) —
 * the buyer self-accounts both legs at posting — so the preview shows VAT only for ordinary codes.
 */
import { useEffect, useRef } from 'react';
import { Form, useSubmit } from 'react-router';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  addØre,
  formatKr,
  lineNet as domainLineNet,
  mulRate,
  NON_DEDUCTIBLE_REASONS,
  parseKroner,
  quantity as toQuantity,
  rate,
  sumØre,
  ZERO,
  type Øre,
} from '@saldo/domain';
import { parseQuantity, supplierInvoiceInput, type SupplierInvoiceInput } from '~/contracts';
import type { AccountOption } from '~/db/org-defaults.server';
import type { PurchaseVatCodeOption, SupplierOption } from '~/db/supplier-invoices.server';
import { SelectField, TextField } from '~/components/form-field';
import { t } from '~/copy';

/** Empty line — a fresh, fully ad-hoc, deductible row. */
export function emptyLine(): SupplierInvoiceInput['lines'][number] {
  return {
    description: '',
    quantity: '1',
    unit: 'stk',
    unitPriceKr: '',
    accountId: '',
    vatCodeId: '',
    nonDeductibleReason: '',
  };
}

export function SupplierInvoiceForm({
  defaultValues,
  suppliers,
  accounts,
  vatCodes,
  submitLabel,
  intent,
  error,
}: {
  defaultValues: SupplierInvoiceInput;
  suppliers: readonly SupplierOption[];
  accounts: readonly AccountOption[];
  vatCodes: readonly PurchaseVatCodeOption[];
  submitLabel: string;
  intent?: string | undefined;
  error?: string | undefined;
}) {
  const submit = useSubmit();
  const formRef = useRef<HTMLFormElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const addLineRef = useRef<HTMLButtonElement>(null);

  // Move focus to the server error when one appears, so it is announced and reachable (WCAG 3.3.1).
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    formState: { errors },
  } = useForm<SupplierInvoiceInput>({
    resolver: zodResolver(supplierInvoiceInput),
    mode: 'onTouched',
    defaultValues,
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'lines' });

  const onValid = () => submit(formRef.current, { method: 'post' });

  // Live preview: the line nets/VAT and the document totals, computed by the domain in the browser.
  const watchedLines = watch('lines');
  const previews = (watchedLines ?? []).map((line) => previewLine(line, vatCodes));
  const totalNet = sumØre(previews.map((p) => p.net));
  const totalVat = sumØre(previews.map((p) => p.vat));
  const totalGross = addØre(totalNet, totalVat);

  return (
    <Form
      method="post"
      ref={formRef}
      onSubmit={(event) => void handleSubmit(onValid)(event)}
      className="grid gap-6"
    >
      {intent ? <input type="hidden" name="intent" value={intent} /> : null}

      {/* ── Supplier ─────────────────────────────────────────────────────────── */}
      <fieldset className="grid gap-5">
        <legend className="font-text text-sm">{t('purchases.form.supplierLegend')}</legend>
        <SelectField
          id="supplierId"
          label={t('purchases.form.supplierPicker')}
          hint={t('purchases.form.supplierPickerHint')}
          error={errors.supplierId?.message}
          registration={register('supplierId', {
            onChange: (e: React.ChangeEvent<HTMLSelectElement>) => {
              const picked = suppliers.find((s) => s.id === e.target.value);
              if (picked) setValue('supplierName', picked.name);
            },
          })}
        >
          <option value="">{t('purchases.form.noneOption')}</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </SelectField>
        <TextField
          id="supplierName"
          label={t('purchases.form.supplierName')}
          error={errors.supplierName?.message}
          registration={register('supplierName')}
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            id="supplierOrgNr"
            label={t('purchases.form.supplierOrgNr')}
            error={errors.supplierOrgNr?.message}
            registration={register('supplierOrgNr')}
            tabular
          />
          <TextField
            id="supplierInvoiceNumber"
            label={t('purchases.form.invoiceNumber')}
            error={errors.supplierInvoiceNumber?.message}
            registration={register('supplierInvoiceNumber')}
          />
        </div>
      </fieldset>

      {/* ── Dates, KID, currency ─────────────────────────────────────────────── */}
      <fieldset className="grid gap-5 sm:grid-cols-2">
        <legend className="font-text text-sm">{t('purchases.form.intro')}</legend>
        <TextField
          id="invoiceDate"
          label={t('purchases.form.invoiceDate')}
          error={errors.invoiceDate?.message}
          registration={register('invoiceDate')}
          type="date"
        />
        <TextField
          id="dueDate"
          label={t('purchases.form.dueDate')}
          error={errors.dueDate?.message}
          registration={register('dueDate')}
          type="date"
        />
        <TextField
          id="kid"
          label={t('purchases.form.kid')}
          error={errors.kid?.message}
          registration={register('kid')}
          tabular
        />
        <TextField
          id="currency"
          label={t('purchases.form.currency')}
          error={errors.currency?.message}
          registration={register('currency')}
          uppercase
        />
      </fieldset>

      {/* ── Lines ────────────────────────────────────────────────────────────── */}
      <fieldset className="grid gap-4">
        <legend className="font-text text-sm">{t('purchases.form.linesLegend')}</legend>
        {errors.lines?.message && (
          <p role="alert" className="text-destructive text-sm">
            {errors.lines.message}
          </p>
        )}
        <ul className="grid gap-4">
          {fields.map((field, index) => (
            <li key={field.id} className="border-input grid gap-3 rounded-md border p-4">
              <TextField
                id={`lines.${index}.description`}
                label={t('purchases.form.line.description')}
                error={errors.lines?.[index]?.description?.message}
                registration={register(`lines.${index}.description`)}
              />
              <div className="grid gap-3 sm:grid-cols-3">
                <TextField
                  id={`lines.${index}.quantity`}
                  label={t('purchases.form.line.quantity')}
                  error={errors.lines?.[index]?.quantity?.message}
                  registration={register(`lines.${index}.quantity`)}
                  inputMode="numeric"
                  tabular
                />
                <TextField
                  id={`lines.${index}.unit`}
                  label={t('purchases.form.line.unit')}
                  error={errors.lines?.[index]?.unit?.message}
                  registration={register(`lines.${index}.unit`)}
                />
                <TextField
                  id={`lines.${index}.unitPriceKr`}
                  label={t('purchases.form.line.price')}
                  error={errors.lines?.[index]?.unitPriceKr?.message}
                  registration={register(`lines.${index}.unitPriceKr`)}
                  inputMode="numeric"
                  tabular
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <SelectField
                  id={`lines.${index}.accountId`}
                  label={t('purchases.form.line.account')}
                  error={errors.lines?.[index]?.accountId?.message}
                  registration={register(`lines.${index}.accountId`)}
                >
                  <option value="">{t('purchases.form.chooseOption')}</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.number} — {a.name}
                    </option>
                  ))}
                </SelectField>
                <SelectField
                  id={`lines.${index}.vatCodeId`}
                  label={t('purchases.form.line.vat')}
                  error={errors.lines?.[index]?.vatCodeId?.message}
                  registration={register(`lines.${index}.vatCodeId`)}
                >
                  <option value="">{t('purchases.form.chooseOption')}</option>
                  {vatCodes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} — {c.description}
                    </option>
                  ))}
                </SelectField>
              </div>
              <SelectField
                id={`lines.${index}.nonDeductibleReason`}
                label={t('purchases.form.line.deduction')}
                error={errors.lines?.[index]?.nonDeductibleReason?.message}
                registration={register(`lines.${index}.nonDeductibleReason`)}
              >
                <option value="">{t('purchases.form.deduction.full')}</option>
                {NON_DEDUCTIBLE_REASONS.map((reason) => (
                  <option key={reason} value={reason}>
                    {t(`purchases.form.deduction.${reason}`)}
                  </option>
                ))}
              </SelectField>
              <div className="flex items-center justify-between">
                <p className="text-muted-foreground tabular text-sm">
                  {t('purchases.form.totalsNet')}: {formatKr(previews[index]?.net ?? ZERO)}{' '}
                  {t('common.currency')}
                </p>
                {fields.length > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      remove(index);
                      // Removing a row destroys its focus; restore it to a stable target (WCAG 2.4.3).
                      addLineRef.current?.focus();
                    }}
                    className="text-destructive font-text inline-flex min-h-11 items-center text-sm underline-offset-4 hover:underline"
                  >
                    {t('purchases.form.removeLine')}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
        <button
          ref={addLineRef}
          type="button"
          onClick={() => append(emptyLine())}
          className="border-input font-text inline-flex min-h-11 w-fit items-center rounded-md border px-4 py-2 text-sm"
        >
          {t('purchases.form.addLine')}
        </button>
      </fieldset>

      {/* ── Notes + totals ───────────────────────────────────────────────────── */}
      <div className="grid gap-1.5">
        <label htmlFor="notes" className="font-text text-sm">
          {t('purchases.form.notes')}
        </label>
        <textarea
          id="notes"
          rows={2}
          aria-describedby="notes-hint"
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
          {...register('notes')}
        />
        <p id="notes-hint" className="text-muted-foreground text-sm">
          {t('purchases.form.notesHint')}
        </p>
      </div>

      <dl className="border-input grid gap-1 border-t pt-4 text-sm" aria-live="polite">
        <div className="flex justify-between">
          <dt>{t('purchases.form.totalsNet')}</dt>
          <dd className="tabular">
            {formatKr(totalNet)} {t('common.currency')}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt>{t('purchases.form.totalsVat')}</dt>
          <dd className="tabular">
            {formatKr(totalVat)} {t('common.currency')}
          </dd>
        </div>
        <div className="font-text flex justify-between">
          <dt>{t('purchases.form.totalsGross')}</dt>
          <dd className="tabular">
            {formatKr(totalGross)} {t('common.currency')}
          </dd>
        </div>
      </dl>

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

interface LinePreview {
  readonly net: Øre;
  readonly vat: Øre;
}

/** Compute one line's net + VAT for the live preview — the same maths the server runs, in the browser. */
function previewLine(
  line: SupplierInvoiceInput['lines'][number],
  vatCodes: readonly PurchaseVatCodeOption[],
): LinePreview {
  const price = parseKroner(line.unitPriceKr.trim() === '' ? '0' : line.unitPriceKr);
  const qty = parseQuantity(line.quantity);
  if (price === null || qty === null) return { net: ZERO, vat: ZERO };
  const net = domainLineNet(price, toQuantity(qty));
  const code = vatCodes.find((c) => c.id === line.vatCodeId);
  // A reverse-charge purchase carries no document VAT (the supplier never charges it); the buyer
  // self-accounts both legs at posting, so the document total stays at the net.
  const vat = code && !code.reverseCharge ? mulRate(net, rate(Number(code.rate))) : ZERO;
  return { net, vat };
}
