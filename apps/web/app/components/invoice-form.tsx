/**
 * The sales-document draft editor (build-spec §8.4) — shared by the new-invoice route and the draft
 * editor on the detail route. Semantic `<Form method="post">` is authoritative (it round-trips without
 * JS); React-Hook-Form adds inline validation and the live, in-browser net/VAT/gross preview, computed
 * by the PURE domain (`lineNet` / `mulRate`) exactly as the server will — but the action + SQL decide.
 *
 * A line may be free-text/ad-hoc or prefilled from a catalogue item (description/unit/price/account/VAT);
 * the document header prefills from a contact upstream (the loader seeds `defaultValues`). The per-line
 * MVA preview honours the registration gate: an unregistered org sees no output VAT and a warning, so
 * the UX mirrors the server's HARD BLOCK rather than promising VAT the action will refuse.
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
  parseKroner,
  quantity as toQuantity,
  rate,
  sumØre,
  ZERO,
  type Øre,
} from '@saldo/domain';
import { INVOICE_LANGUAGES, invoiceInput, parseQuantity, type InvoiceInput } from '~/contracts';
import type { AccountOption } from '~/db/org-defaults.server';
import type { CustomerOption, InvoiceVatCodeOption, ProductLineOption } from '~/db/invoices.server';
import { SelectField, TextField } from '~/components/form-field';
import { invoiceKindLabel } from '~/lib/invoice-format';
import { t } from '~/copy';
import { SubmitButton } from '~/components/ui/submit-button';

const KINDS = ['invoice', 'quote'] as const;

/** Empty line — a fresh, fully ad-hoc row. */
export function emptyLine(): InvoiceInput['lines'][number] {
  return {
    productId: '',
    description: '',
    quantity: '1',
    unit: 'stk',
    unitPriceKr: '',
    accountId: '',
    vatCodeId: '',
  };
}

export function InvoiceForm({
  defaultValues,
  customers,
  accounts,
  vatCodes,
  products,
  orgRegistered,
  submitLabel,
  intent,
  error,
  lockKind = false,
}: {
  defaultValues: InvoiceInput;
  customers: readonly CustomerOption[];
  accounts: readonly AccountOption[];
  vatCodes: readonly InvoiceVatCodeOption[];
  products: readonly ProductLineOption[];
  orgRegistered: boolean;
  submitLabel: string;
  intent?: string | undefined;
  error?: string | undefined;
  /** Draft editor: the document's kind is set at creation and immutable — show it, don't offer it. */
  lockKind?: boolean;
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
  } = useForm<InvoiceInput>({
    resolver: zodResolver(invoiceInput),
    mode: 'onTouched',
    defaultValues,
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'lines' });

  const onValid = () => submit(formRef.current, { method: 'post' });

  // Live preview: the line nets and the document totals, computed by the domain in the browser.
  // VAT is CATEGORY-LEVEL — grouped by charged rate and rounded once per rate (mirrors the server's
  // invoiceTotals, BR-CO-17 / ADR 0054) — so the preview matches the issued document to the øre.
  const watchedLines = watch('lines');
  const previews = (watchedLines ?? []).map((line) => previewLine(line, vatCodes, orgRegistered));
  const totalNet = sumØre(previews.map((p) => p.net));
  const baseByRate = new Map<number, Øre>();
  for (const p of previews) {
    if (p.chargedRate !== null) {
      baseByRate.set(p.chargedRate, addØre(baseByRate.get(p.chargedRate) ?? ZERO, p.net));
    }
  }
  const totalVat = sumØre(
    [...baseByRate.entries()].map(([r, base]) => mulRate(base, rate(r))),
  );
  const totalGross = addØre(totalNet, totalVat);

  // Does any line carry an output-VAT code the unregistered org may not charge? Then warn.
  const showUnregisteredWarning =
    !orgRegistered &&
    (watchedLines ?? []).some((l) => vatCodes.find((c) => c.id === l.vatCodeId)?.isOutput);

  /** Prefill a line from the chosen catalogue item (kept editable afterwards). */
  function prefillFromProduct(index: number, productId: string) {
    setValue(`lines.${index}.productId`, productId);
    const p = products.find((x) => x.id === productId);
    if (!p) return;
    setValue(`lines.${index}.description`, p.description ?? p.name);
    setValue(`lines.${index}.unit`, p.unit);
    setValue(
      `lines.${index}.unitPriceKr`,
      p.unitPriceOre === 0 ? '' : formatKr(p.unitPriceOre as Øre),
    );
    if (p.defaultAccountId) setValue(`lines.${index}.accountId`, p.defaultAccountId);
    if (p.defaultVatCodeId) setValue(`lines.${index}.vatCodeId`, p.defaultVatCodeId);
  }

  return (
    <Form
      method="post"
      ref={formRef}
      onSubmit={(event) => void handleSubmit(onValid)(event)}
      className="grid gap-6"
    >
      {intent ? <input type="hidden" name="intent" value={intent} /> : null}
      {/* A credit note's link to the invoice it corrects rides along on every save (identity — the
          server refuses a save that tries to change it). */}
      <input type="hidden" {...register('creditsInvoiceId')} />

      {/* ── Document type + customer ─────────────────────────────────────────── */}
      <fieldset className="grid gap-5">
        <legend className="font-text text-sm">{t('invoices.form.customerLegend')}</legend>
        <div className="grid gap-5 sm:grid-cols-2">
          {lockKind ? (
            <div className="grid content-start gap-1.5">
              <span className="font-text text-sm">{t('invoices.form.kindLegend')}</span>
              <p className="text-sm">{invoiceKindLabel(defaultValues.kind)}</p>
              <input type="hidden" {...register('kind')} />
            </div>
          ) : (
            <SelectField
              id="kind"
              label={t('invoices.form.kindLegend')}
              error={errors.kind?.message}
              registration={register('kind')}
            >
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {k === 'quote' ? t('invoices.kind.quote') : t('invoices.kind.invoice')}
                </option>
              ))}
            </SelectField>
          )}
          <SelectField
            id="customerId"
            label={t('invoices.form.customerPicker')}
            hint={t('invoices.form.customerPickerHint')}
            error={errors.customerId?.message}
            registration={register('customerId', {
              onChange: (e: React.ChangeEvent<HTMLSelectElement>) => {
                const picked = customers.find((c) => c.id === e.target.value);
                if (picked) setValue('customerName', picked.name);
              },
            })}
          >
            <option value="">{t('invoices.form.noneOption')}</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectField>
        </div>
        <TextField
          id="customerName"
          label={t('invoices.form.customerName')}
          error={errors.customerName?.message}
          registration={register('customerName')}
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            id="customerEmail"
            label={t('invoices.form.customerEmail')}
            error={errors.customerEmail?.message}
            registration={register('customerEmail')}
            type="email"
          />
          <TextField
            id="customerOrgNr"
            label={t('invoices.form.customerOrgNr')}
            error={errors.customerOrgNr?.message}
            registration={register('customerOrgNr')}
            tabular
          />
        </div>
        <TextField
          id="customerAddress"
          label={t('invoices.form.customerAddress')}
          error={errors.customerAddress?.message}
          registration={register('customerAddress')}
        />
      </fieldset>

      {/* ── Dates, currency, language ────────────────────────────────────────── */}
      <fieldset className="grid gap-5 sm:grid-cols-2">
        <legend className="font-text text-sm">{t('invoices.form.intro')}</legend>
        <TextField
          id="issueDate"
          label={t('invoices.form.issueDate')}
          error={errors.issueDate?.message}
          registration={register('issueDate')}
          type="date"
        />
        <TextField
          id="dueDate"
          label={t('invoices.form.dueDate')}
          error={errors.dueDate?.message}
          registration={register('dueDate')}
          type="date"
        />
        <TextField
          id="currency"
          label={t('invoices.form.currency')}
          error={errors.currency?.message}
          registration={register('currency')}
          uppercase
        />
        <SelectField
          id="language"
          label={t('invoices.form.language')}
          error={errors.language?.message}
          registration={register('language')}
        >
          {INVOICE_LANGUAGES.map((l) => (
            <option key={l} value={l}>
              {l === 'nb' ? 'Norsk' : 'English'}
            </option>
          ))}
        </SelectField>
      </fieldset>

      {/* ── Lines ────────────────────────────────────────────────────────────── */}
      <fieldset className="grid gap-4">
        <legend className="font-text text-sm">{t('invoices.form.linesLegend')}</legend>
        {errors.lines?.message && (
          <p role="alert" className="text-destructive text-sm">
            {errors.lines.message}
          </p>
        )}
        <ul className="grid gap-4">
          {fields.map((field, index) => (
            <li key={field.id} className="border-input grid gap-3 rounded-md border p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <SelectField
                  id={`lines.${index}.productId`}
                  label={t('invoices.form.line.product')}
                  error={errors.lines?.[index]?.productId?.message}
                  registration={register(`lines.${index}.productId`, {
                    onChange: (e: React.ChangeEvent<HTMLSelectElement>) =>
                      prefillFromProduct(index, e.target.value),
                  })}
                >
                  <option value="">{t('invoices.form.noneOption')}</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </SelectField>
              </div>
              <TextField
                id={`lines.${index}.description`}
                label={t('invoices.form.line.description')}
                error={errors.lines?.[index]?.description?.message}
                registration={register(`lines.${index}.description`)}
              />
              <div className="grid gap-3 sm:grid-cols-3">
                <TextField
                  id={`lines.${index}.quantity`}
                  label={t('invoices.form.line.quantity')}
                  error={errors.lines?.[index]?.quantity?.message}
                  registration={register(`lines.${index}.quantity`)}
                  inputMode="numeric"
                  tabular
                />
                <TextField
                  id={`lines.${index}.unit`}
                  label={t('invoices.form.line.unit')}
                  error={errors.lines?.[index]?.unit?.message}
                  registration={register(`lines.${index}.unit`)}
                />
                <TextField
                  id={`lines.${index}.unitPriceKr`}
                  label={t('invoices.form.line.price')}
                  error={errors.lines?.[index]?.unitPriceKr?.message}
                  registration={register(`lines.${index}.unitPriceKr`)}
                  inputMode="numeric"
                  tabular
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <SelectField
                  id={`lines.${index}.accountId`}
                  label={t('invoices.form.line.account')}
                  error={errors.lines?.[index]?.accountId?.message}
                  registration={register(`lines.${index}.accountId`)}
                >
                  <option value="">{t('invoices.form.chooseOption')}</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.number} — {a.name}
                    </option>
                  ))}
                </SelectField>
                <SelectField
                  id={`lines.${index}.vatCodeId`}
                  label={t('invoices.form.line.vat')}
                  error={errors.lines?.[index]?.vatCodeId?.message}
                  registration={register(`lines.${index}.vatCodeId`)}
                >
                  <option value="">{t('invoices.form.chooseOption')}</option>
                  {vatCodes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code}
                    </option>
                  ))}
                </SelectField>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-muted-foreground tabular text-sm">
                  {t('invoices.form.totalsNet')}: {formatKr(previews[index]?.net ?? ZERO)}{' '}
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
                    {t('invoices.form.removeLine')}
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
          {t('invoices.form.addLine')}
        </button>
      </fieldset>

      {/* ── Notes + totals ───────────────────────────────────────────────────── */}
      <div className="grid gap-1.5">
        <label htmlFor="notes" className="font-text text-sm">
          {t('invoices.form.notes')}
        </label>
        <textarea
          id="notes"
          rows={2}
          aria-describedby="notes-hint"
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
          {...register('notes')}
        />
        <p id="notes-hint" className="text-muted-foreground text-sm">
          {t('invoices.form.notesHint')}
        </p>
      </div>

      {showUnregisteredWarning && (
        <p role="alert" className="text-destructive text-sm">
          {t('invoices.form.unregisteredWarning')}
        </p>
      )}

      <dl className="border-input grid gap-1 border-t pt-4 text-sm" aria-live="polite">
        <div className="flex justify-between">
          <dt>{t('invoices.form.totalsNet')}</dt>
          <dd className="tabular">
            {formatKr(totalNet)} {t('common.currency')}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt>{t('invoices.form.totalsVat')}</dt>
          <dd className="tabular">
            {formatKr(totalVat)} {t('common.currency')}
          </dd>
        </div>
        <div className="font-text flex justify-between">
          <dt>{t('invoices.form.totalsGross')}</dt>
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

      <SubmitButton
        className="bg-primary text-primary-foreground font-text inline-flex min-h-11 w-fit items-center rounded-md px-4 py-2 text-sm"
      >
        {submitLabel}
      </SubmitButton>
    </Form>
  );
}

interface LinePreview {
  readonly net: Øre;
  /** The VAT rate this line charges (e.g. 0.25), or null for a non-charging line — the totals above
   * group by it and round once per rate (category-level, ADR 0054). */
  readonly chargedRate: number | null;
}

/** Compute one line's net (and whether/at what rate it charges VAT) for the live preview. */
function previewLine(
  line: InvoiceInput['lines'][number],
  vatCodes: readonly InvoiceVatCodeOption[],
  orgRegistered: boolean,
): LinePreview {
  const price = parseKroner(line.unitPriceKr.trim() === '' ? '0' : line.unitPriceKr);
  const qty = parseQuantity(line.quantity);
  if (price === null || qty === null) return { net: ZERO, chargedRate: null };
  const net = domainLineNet(price, toQuantity(qty));
  const code = vatCodes.find((c) => c.id === line.vatCodeId);
  const charge = orgRegistered && code?.isOutput === true;
  return { net, chargedRate: charge ? Number(code.rate) : null };
}
