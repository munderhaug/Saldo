/**
 * A money figure rendered for both eyes and assistive tech (WCAG 1.3.1). The visible "kr" glyph is
 * hidden from screen readers, which instead read the spelled-out "kroner" — otherwise they announce the
 * letters "k r", or, with no unit at all, a bare number with no indication it is money. The honest-number reveal reuses `MoneyText`. Format comes from the domain helper (`formatKr`), never
 * raw `toFixed`.
 */
import { formatKr, øre } from '@saldo/domain';
import { t } from '~/copy';

export function Money({ ore }: { ore: number }) {
  return <MoneyText value={formatKr(øre(ore))} />;
}

/** The same accessible unit treatment for an ALREADY-formatted kroner string (loader-formatted
 * figures like the honest-number reveal) — one implementation, not a per-route `Amount` copy. */
export function MoneyText({ value }: { value: string }) {
  return (
    <>
      {value}&nbsp;<span aria-hidden="true">{t('common.currency')}</span>
      <span className="sr-only">{t('common.currencyLong')}</span>
    </>
  );
}

/** A muted dash for an empty/zero cell — real text (not aria-hidden) so it is announced, not skipped. */
export function ZeroCell() {
  return <span className="text-muted-foreground">—</span>;
}
