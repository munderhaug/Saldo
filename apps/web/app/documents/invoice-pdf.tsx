/**
 * Invoice / credit-note PDF (build-spec §8.4, feat-invoice-pdf-email). Rendered with
 * `@react-pdf/renderer` on the persistent Node host (ADR 0015) — no headless browser. It is PURE
 * presentation over the already-resolved {@link InvoiceDocumentModel}: every figure is the FROZEN øre
 * the document was issued with, formatted through the domain helpers (`formatKr` / `formatVatRate`) —
 * money is NEVER recomputed in the renderer. Labels come from `t()` (keyed microcopy); figures use a
 * tabular layout (right-aligned money) and dark ink on a cold-white ground for legibility.
 *
 * This is a non-DOM renderer: it uses react-pdf primitives + the `style` prop, not Tailwind (see the
 * scoped eslint override). Server-only — rendered in the `.pdf` resource-route loader.
 */
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { formatKr, formatVatRate, øre } from '@saldo/domain';
import type { InvoiceDocumentModel } from '~/db/invoice-document.server';
import { t } from '~/copy';

// Cold-white ground, neutral-12 ink (design-system.md). Hex here is intrinsic to the PDF renderer
// (no token/className surface in react-pdf), not the arbitrary-colour anti-pattern the lint guards DOM.
const INK = '#1c1c1c';
const MUTED = '#5c5c5c';
const HAIR = '#d9d9d9';
const GROUND = '#fcfcfd';

const styles = StyleSheet.create({
  page: {
    backgroundColor: GROUND,
    color: INK,
    paddingVertical: 48,
    paddingHorizontal: 48,
    fontSize: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  title: { fontSize: 22 },
  numberLine: { fontSize: 10, color: MUTED, marginTop: 4 },
  parties: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20, gap: 24 },
  partyBlock: { flexGrow: 1, flexBasis: 0 },
  partyHeading: {
    fontSize: 8,
    color: MUTED,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  partyName: { fontSize: 11 },
  partyLine: { fontSize: 9, color: MUTED, marginTop: 2 },
  meta: { flexDirection: 'row', gap: 24, marginBottom: 20 },
  metaItem: { flexDirection: 'column' },
  metaLabel: { fontSize: 8, color: MUTED, textTransform: 'uppercase', letterSpacing: 1 },
  metaValue: { fontSize: 10, marginTop: 2 },
  table: { marginBottom: 18 },
  thead: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: INK, paddingBottom: 4 },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: HAIR,
    paddingVertical: 5,
  },
  cellDesc: { flexGrow: 1, flexBasis: 0 },
  cellQty: { width: 70, textAlign: 'right' },
  cellVat: { width: 50, textAlign: 'right' },
  cellNet: { width: 80, textAlign: 'right' },
  th: { fontSize: 8, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5 },
  vatSub: { fontSize: 8, color: MUTED, marginTop: 1 },
  summary: { flexDirection: 'row', justifyContent: 'space-between', gap: 32 },
  vatBasis: { flexGrow: 1, flexBasis: 0 },
  vatBasisHeading: {
    fontSize: 8,
    color: MUTED,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  vatBasisRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  vatBasisCell: { fontSize: 9, color: MUTED },
  totals: { width: 220 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  totalGrand: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 6,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: INK,
  },
  totalLabel: { fontSize: 10 },
  totalValue: { fontSize: 10, textAlign: 'right' },
  totalGrandValue: { fontSize: 12, textAlign: 'right' },
  footer: {
    position: 'absolute',
    bottom: 28,
    left: 48,
    right: 48,
    fontSize: 8,
    color: MUTED,
    textAlign: 'center',
  },
});

/** Money + currency unit, right-aligned style applied by the caller's cell. */
function kr(value: number): string {
  return `${formatKr(øre(value))} ${t('common.currency')}`;
}

export function InvoicePdf({ doc }: { doc: InvoiceDocumentModel }) {
  const isCredit = doc.kind === 'credit_note';
  const title = isCredit ? t('invoices.pdf.creditNoteTitle') : t('invoices.pdf.invoiceTitle');
  const numberText = doc.invoiceNumber !== null ? String(doc.invoiceNumber) : '';

  return (
    <Document title={`${title} ${numberText}`.trim()}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>{title}</Text>
            {numberText !== '' && (
              <Text style={styles.numberLine}>
                {t('invoices.pdf.invoiceNo')} {numberText}
              </Text>
            )}
          </View>
          <View>
            <Text style={styles.partyHeading}>{t('invoices.pdf.sellerHeading')}</Text>
            <Text style={styles.partyName}>{doc.seller.name}</Text>
            <Text style={styles.partyLine}>
              {t('invoices.pdf.orgNr')} {doc.seller.orgNr}
            </Text>
          </View>
        </View>

        <View style={styles.parties}>
          <View style={styles.partyBlock}>
            <Text style={styles.partyHeading}>{t('invoices.pdf.customerHeading')}</Text>
            <Text style={styles.partyName}>{doc.customer.name}</Text>
            {doc.customer.orgNr !== null && (
              <Text style={styles.partyLine}>
                {t('invoices.pdf.orgNr')} {doc.customer.orgNr}
              </Text>
            )}
            {doc.customer.address !== null && (
              <Text style={styles.partyLine}>{doc.customer.address}</Text>
            )}
            {doc.customer.email !== null && (
              <Text style={styles.partyLine}>{doc.customer.email}</Text>
            )}
          </View>
        </View>

        <View style={styles.meta}>
          {doc.issueDate !== null && (
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>{t('invoices.pdf.issueDate')}</Text>
              <Text style={styles.metaValue}>{doc.issueDate}</Text>
            </View>
          )}
          {doc.dueDate !== null && (
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>{t('invoices.pdf.dueDate')}</Text>
              <Text style={styles.metaValue}>{doc.dueDate}</Text>
            </View>
          )}
          {doc.kid !== null && (
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>{t('invoices.pdf.kid')}</Text>
              <Text style={styles.metaValue}>{doc.kid}</Text>
            </View>
          )}
        </View>

        <View style={styles.table}>
          <View style={styles.thead}>
            <Text style={[styles.cellDesc, styles.th]}>{t('invoices.pdf.lineDescription')}</Text>
            <Text style={[styles.cellQty, styles.th]}>{t('invoices.pdf.lineQuantity')}</Text>
            <Text style={[styles.cellVat, styles.th]}>{t('invoices.pdf.lineVat')}</Text>
            <Text style={[styles.cellNet, styles.th]}>{t('invoices.pdf.lineNet')}</Text>
          </View>
          {doc.lines.map((line) => (
            <View key={line.lineNo} style={styles.row} wrap={false}>
              <View style={styles.cellDesc}>
                <Text>{line.description}</Text>
                <Text style={styles.vatSub}>{line.vatCodeLabel}</Text>
              </View>
              <Text style={styles.cellQty}>
                {line.quantity} {line.unit}
              </Text>
              <Text style={styles.cellVat}>{formatVatRate(line.vatRate)}</Text>
              <Text style={styles.cellNet}>{kr(line.netOre)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.summary}>
          <View style={styles.vatBasis}>
            <Text style={styles.vatBasisHeading}>{t('invoices.pdf.vatBasisHeading')}</Text>
            <View style={styles.vatBasisRow}>
              <Text style={styles.vatBasisCell}>{t('invoices.pdf.vatBasisRate')}</Text>
              <Text style={styles.vatBasisCell}>{t('invoices.pdf.vatBasisBase')}</Text>
              <Text style={styles.vatBasisCell}>{t('invoices.pdf.vatBasisVat')}</Text>
            </View>
            {doc.vatBuckets.map((bucket) => (
              <View key={bucket.rateCategory} style={styles.vatBasisRow}>
                <Text style={styles.vatBasisCell}>{formatVatRate(bucket.vatRate)}</Text>
                <Text style={styles.vatBasisCell}>{kr(bucket.base)}</Text>
                <Text style={styles.vatBasisCell}>{kr(bucket.vat)}</Text>
              </View>
            ))}
          </View>

          <View style={styles.totals}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{t('invoices.pdf.totalNet')}</Text>
              <Text style={styles.totalValue}>{kr(doc.netOre)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{t('invoices.pdf.totalVat')}</Text>
              <Text style={styles.totalValue}>{kr(doc.vatOre)}</Text>
            </View>
            <View style={styles.totalGrand}>
              <Text style={styles.totalLabel}>{t('invoices.pdf.totalGross')}</Text>
              <Text style={styles.totalGrandValue}>{kr(doc.grossOre)}</Text>
            </View>
          </View>
        </View>

        {doc.notes !== null && <Text style={styles.partyLine}>{doc.notes}</Text>}

        <Text style={styles.footer} fixed>
          {t('invoices.pdf.generatedNote')}
        </Text>
      </Page>
    </Document>
  );
}
