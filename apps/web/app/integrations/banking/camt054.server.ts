/**
 * camt.054 (ISO 20022 BankToCustomerDebitCreditNotification) parser — the self-built import path
 * (build-spec §8.7). It turns a camt.054 XML file into the source-agnostic {@link NormalisedBankTx}.
 * Structural XML→fields extraction lives HERE (uses `fast-xml-parser`); all money/sign/normalisation is
 * delegated to the PURE domain core (`normaliseCamtEntry`), so the money rules stay exhaustively tested.
 *
 * The element/field model is grounded in `db/reference/banking/camt-054.md`, never memory:
 *   Document › BkToCstmrDbtCdtNtfctn › Ntfctn › (Acct, Ntry…). Per Ntry: Amt(@Ccy) + CdtDbtInd carry
 *   the signed amount; BookgDt/ValDt the dates; NtryDtls/TxDtls the refs/remittance/counterparty.
 * Names are matched namespace-agnostically (`removeNSPrefix`) so versions …001.02–…001.08 all parse.
 *
 * Scope (a documented subset): BOOKED entries only; ONE transaction per Ntry (a batch Ntry bundling
 * many TxDtls collapses to the entry total — splitting batches is a reconciliation-era refinement). A
 * camt file is personal + financial data (`data-handling.md`): parsed transiently, never logged.
 */
import { XMLParser } from 'fast-xml-parser';
import { normaliseCamtEntry, type NormalisedBankTx } from '@saldo/domain';

export type ParseCamtResult =
  | { readonly ok: true; readonly transactions: readonly NormalisedBankTx[] }
  | { readonly ok: false; readonly reason: 'invalid-xml' | 'unrecognised' };

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  removeNSPrefix: true,
  trimValues: true,
  parseTagValue: false, // keep amounts/refs as strings — the domain parses money, never a float
  parseAttributeValue: false,
});

/** A parsed XML node: a record, a primitive, or an array of those. */
type Node = unknown;

const asArray = (node: Node): Node[] => (Array.isArray(node) ? node : node == null ? [] : [node]);
const isRecord = (node: Node): node is Record<string, Node> =>
  typeof node === 'object' && node !== null && !Array.isArray(node);

/** Read a nested path of single-valued elements (first match at each step), or undefined. */
function at(node: Node, ...path: string[]): Node {
  let current: Node = node;
  for (const key of path) {
    if (!isRecord(current)) return undefined;
    current = current[key];
    if (Array.isArray(current)) current = current[0];
  }
  return current;
}

/** The text content of a node: a string primitive, or its `#text` child (an element with attributes). */
function text(node: Node): string | null {
  if (node == null) return null;
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (isRecord(node) && typeof node['#text'] === 'string') return node['#text'];
  return null;
}

/** `Sts` is either a plain string (`BOOK`) or `{ Cd: 'BOOK' }` (newer versions). */
function statusOf(entry: Record<string, Node>): string | null {
  const sts = entry['Sts'];
  return text(sts) ?? text(at(sts, 'Cd'));
}

/** First non-empty reference from a TxDtls/Refs node, in the capture's documented priority. */
function refOf(entry: Record<string, Node>): string | null {
  const refs = at(entry, 'NtryDtls', 'TxDtls', 'Refs');
  return (
    text(at(refs, 'AcctSvcrRef')) ??
    text(at(refs, 'EndToEndId')) ??
    text(at(refs, 'TxId')) ??
    text(entry['AcctSvcrRef']) ??
    null
  );
}

/** Join the unstructured remittance lines of the first TxDtls, or null. */
function remittanceOf(entry: Record<string, Node>): string | null {
  const ustrd = at(entry, 'NtryDtls', 'TxDtls', 'RmtInf', 'Ustrd');
  const lines = asArray(ustrd)
    .map(text)
    .filter((s): s is string => s !== null && s.trim() !== '');
  return lines.length > 0 ? lines.join(' ') : null;
}

/**
 * Counterparty name, from the account owner's perspective: for a CRDT (money IN) the owner is the
 * creditor, so the counterparty is the **debtor** (payer); for a DBIT (money OUT) the owner is the
 * debtor, so the counterparty is the **creditor** (payee). No cross-fallback — falling back to the other
 * party would surface the account OWNER's own name, which is wrong and an unnecessary PII display.
 */
function counterpartyOf(entry: Record<string, Node>, indicator: string | null): string | null {
  const parties = at(entry, 'NtryDtls', 'TxDtls', 'RltdPties');
  return indicator === 'DBIT' ? text(at(parties, 'Cdtr', 'Nm')) : text(at(parties, 'Dbtr', 'Nm'));
}

/** Parse a camt.054 XML document into normalised, BOOKED transactions. */
export function parseCamt054(xml: string): ParseCamtResult {
  let doc: Node;
  try {
    doc = parser.parse(xml);
  } catch {
    return { ok: false, reason: 'invalid-xml' };
  }

  const notifications = asArray(at(doc, 'Document', 'BkToCstmrDbtCdtNtfctn'))
    .flatMap((ntfctn) => (isRecord(ntfctn) ? asArray(ntfctn['Ntfctn']) : []))
    .filter(isRecord);
  if (notifications.length === 0) return { ok: false, reason: 'unrecognised' };

  const transactions: NormalisedBankTx[] = [];
  for (const ntfctn of notifications) {
    const accountCcy = text(at(ntfctn, 'Acct', 'Ccy'));
    for (const entry of asArray(ntfctn['Ntry']).filter(isRecord)) {
      const status = statusOf(entry);
      if (status !== null && status !== 'BOOK') continue; // booked only; pending/unknown skipped

      const amountNode = entry['Amt'];
      const indicator = text(entry['CdtDbtInd']);
      const result = normaliseCamtEntry({
        externalId: refOf(entry),
        amount: text(amountNode) ?? '',
        creditDebit: indicator ?? '',
        currency: (isRecord(amountNode) ? text(amountNode['@_Ccy']) : null) ?? accountCcy,
        bookingDate: text(at(entry, 'BookgDt', 'Dt')),
        valueDate: text(at(entry, 'ValDt', 'Dt')),
        remittanceInfo: remittanceOf(entry),
        counterparty: counterpartyOf(entry, indicator),
      });
      if (result.ok) transactions.push(result.tx);
    }
  }
  return { ok: true, transactions };
}
