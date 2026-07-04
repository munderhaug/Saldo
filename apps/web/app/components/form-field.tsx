/**
 * Labelled form-field primitives shared by the create/edit forms (contacts §8.2, products §8.3).
 * Each owns the label↔control↔error wiring so every control that can show an error is `aria-invalid`
 * and `aria-describedby` its hint + error (WCAG 1.3.1/3.3.1/4.1.3), never left to the call site.
 * Presentation only — the parent `<Form>` + the action's Zod re-validation are authoritative.
 */
import type { UseFormRegisterReturn } from 'react-hook-form';
import { cn } from '~/lib/utils';

/**
 * Programmatic description: hint + error ids (and any caller-supplied extra id, e.g. a derived-value
 * readout), in reading order, or `undefined` when none exists.
 */
function describedBy(
  id: string,
  hasHint: boolean,
  hasError: boolean,
  extra?: string,
): string | undefined {
  const ids = [hasHint ? `${id}-hint` : '', hasError ? `${id}-error` : '', extra ?? ''].filter(
    Boolean,
  );
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
export function TextField({
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
  autoComplete,
  uppercase,
  tabular,
  extraDescribedBy,
}: FieldShared & {
  type?: string;
  inputMode?: 'numeric' | 'decimal';
  maxLength?: number;
  min?: number;
  max?: number;
  /** Browser autofill hint. Left undefined by default — autofill is the user's helper, never
   * blanket-disabled (review 2026-07-03 §13); pass 'off' only where autofill is truly nonsense. */
  autoComplete?: string;
  uppercase?: boolean;
  tabular?: boolean;
  /** An extra element id to fold into `aria-describedby` (e.g. a derived incl-VAT readout). */
  extraDescribedBy?: string | undefined;
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
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, !!hint, !!error, extraDescribedBy)}
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
export function SelectField({
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
