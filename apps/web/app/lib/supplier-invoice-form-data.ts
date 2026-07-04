/**
 * Reconstruct the nested supplier-invoice shape from the editor's flat FormData (`lines.0.description`,
 * …) so the action can validate it with the `supplierInvoiceInput` Zod contract. The field-array inputs
 * are contiguous (RHF reindexes on remove), so iterate while a line's description key is present. Pure
 * (no I/O); every value is a string, matching the all-string contract boundary.
 */
export function supplierInvoiceFormToObject(form: FormData): unknown {
  const str = (key: string): string => {
    const value = form.get(key);
    return typeof value === 'string' ? value : '';
  };
  const lines: unknown[] = [];
  for (let i = 0; form.has(`lines.${i}.description`); i += 1) {
    lines.push({
      description: str(`lines.${i}.description`),
      quantity: str(`lines.${i}.quantity`),
      unit: str(`lines.${i}.unit`),
      unitPriceKr: str(`lines.${i}.unitPriceKr`),
      accountId: str(`lines.${i}.accountId`),
      vatCodeId: str(`lines.${i}.vatCodeId`),
      nonDeductibleReason: str(`lines.${i}.nonDeductibleReason`),
    });
  }
  return {
    supplierId: str('supplierId'),
    supplierName: str('supplierName'),
    supplierOrgNr: str('supplierOrgNr'),
    supplierInvoiceNumber: str('supplierInvoiceNumber'),
    kid: str('kid'),
    currency: str('currency'),
    invoiceDate: str('invoiceDate'),
    dueDate: str('dueDate'),
    notes: str('notes'),
    lines,
  };
}
