/**
 * Presentation helper for the products catalogue: a keyed goods/service label from `~/copy`. Pure —
 * it runs in loaders and in the browser. Money is formatted via the domain `formatKr`, not here.
 */
import { t } from '~/copy';

/** "Vare" / "Tjeneste" from the goods/service classification. */
export function productKindLabel(kind: string): string {
  return kind === 'service' ? t('products.kind.service') : t('products.kind.goods');
}
