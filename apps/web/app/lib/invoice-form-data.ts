/**
 * Reconstruct the nested invoice shape from the editor's flat FormData (`lines.0.description`, …) so
 * the action can validate it with the `invoiceInput` Zod contract. The field-array inputs are
 * contiguous (RHF reindexes on remove), so iterate while a line's description key is present. Pure
 * (no I/O); every value is a string, matching the all-string contract boundary.
 */
export function invoiceFormToObject(form: FormData): unknown {
  const str = (key: string): string => {
    const value = form.get(key);
    return typeof value === 'string' ? value : '';
  };
  const lines: unknown[] = [];
  for (let i = 0; form.has(`lines.${i}.description`); i += 1) {
    lines.push({
      productId: str(`lines.${i}.productId`),
      description: str(`lines.${i}.description`),
      quantity: str(`lines.${i}.quantity`),
      unit: str(`lines.${i}.unit`),
      unitPriceKr: str(`lines.${i}.unitPriceKr`),
      accountId: str(`lines.${i}.accountId`),
      vatCodeId: str(`lines.${i}.vatCodeId`),
    });
  }
  return {
    kind: str('kind'),
    customerId: str('customerId'),
    customerName: str('customerName'),
    customerEmail: str('customerEmail'),
    customerOrgNr: str('customerOrgNr'),
    customerAddress: str('customerAddress'),
    currency: str('currency'),
    language: str('language'),
    issueDate: str('issueDate'),
    dueDate: str('dueDate'),
    creditsInvoiceId: str('creditsInvoiceId'),
    notes: str('notes'),
    lines,
  };
}
