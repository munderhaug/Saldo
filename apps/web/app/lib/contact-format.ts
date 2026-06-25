/**
 * Presentation helpers for the contacts register: a keyed role label (customer / supplier / both)
 * and a language label, from `~/copy`. Pure — they run in loaders and in the browser. MVA-status and
 * org-number formatting reuse `org-format` (one vocabulary across the org and its contacts).
 */
import { t } from '~/copy';

/** "Kunde" / "Leverandør" / "Kunde og leverandør" from the two independent role flags. */
export function contactRoleLabel(isCustomer: boolean, isSupplier: boolean): string {
  if (isCustomer && isSupplier) return t('contacts.role.both');
  if (isSupplier) return t('contacts.role.supplier');
  return t('contacts.role.customer');
}

/** Document/UI language label for a contact. */
export function contactLanguageLabel(language: string): string {
  return language === 'en' ? t('contacts.language.en') : t('contacts.language.nb');
}
