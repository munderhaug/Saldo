import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseCamt054 } from './camt054.server';

/** Load a committed camt.054 fixture from `db/reference/banking/fixtures/`. */
const fixture = (name: string): string =>
  readFileSync(
    new URL(`../../../../../db/reference/banking/fixtures/${name}`, import.meta.url),
    'utf8',
  );

describe('parseCamt054 — committed camt.054.001.08 fixture', () => {
  it('parses booked entries, skips pending, and signs by CdtDbtInd', () => {
    const result = parseCamt054(fixture('camt.054.001.08-sample.xml'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.transactions).toEqual([
      {
        externalId: 'E2E-001', // Refs/EndToEndId wins (no Refs/AcctSvcrRef present)
        amount: 123450, // CRDT → positive øre
        currency: 'NOK',
        bookingDate: '2026-06-01',
        valueDate: '2026-06-01',
        remittanceInfo: 'Faktura 42 KID 1234567890128',
        counterparty: 'Kunde AS',
      },
      {
        externalId: 'ENTRY-REF-002', // Refs/AcctSvcrRef
        amount: -9990, // DBIT → negative øre
        currency: 'NOK',
        bookingDate: '2026-06-02',
        valueDate: '2026-06-02',
        remittanceInfo: 'Kortkjøp dagligvare',
        counterparty: 'Leverandør Butikk',
      },
    ]);
  });

  it('falls back to the account currency when an entry Amt has no Ccy attribute', () => {
    const xml = `<?xml version="1.0"?>
      <Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.054.001.08"><BkToCstmrDbtCdtNtfctn>
        <GrpHdr><MsgId>m</MsgId></GrpHdr>
        <Ntfctn><Id>n</Id><Acct><Ccy>EUR</Ccy></Acct>
          <Ntry><Amt>10.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><Sts>BOOK</Sts></Ntry>
        </Ntfctn>
      </BkToCstmrDbtCdtNtfctn></Document>`;
    const result = parseCamt054(xml);
    expect(result.ok && result.transactions[0]?.currency).toBe('EUR');
    expect(result.ok && result.transactions[0]?.amount).toBe(1000);
  });

  it('parses namespace-prefixed documents (removeNSPrefix)', () => {
    const xml = `<?xml version="1.0"?>
      <ns:Document xmlns:ns="urn:iso:std:iso:20022:tech:xsd:camt.054.001.02"><ns:BkToCstmrDbtCdtNtfctn>
        <ns:Ntfctn><ns:Acct><ns:Ccy>NOK</ns:Ccy></ns:Acct>
          <ns:Ntry><ns:Amt ns:Ccy="NOK">5.00</ns:Amt><ns:CdtDbtInd>DBIT</ns:CdtDbtInd></ns:Ntry>
        </ns:Ntfctn>
      </ns:BkToCstmrDbtCdtNtfctn></ns:Document>`;
    const result = parseCamt054(xml);
    expect(result.ok && result.transactions[0]?.amount).toBe(-500);
  });

  it('returns invalid-xml for malformed input and unrecognised for a non-camt document', () => {
    expect(parseCamt054('<not closed')).toEqual({ ok: false, reason: 'invalid-xml' });
    expect(parseCamt054('<Document><Foo/></Document>')).toEqual({
      ok: false,
      reason: 'unrecognised',
    });
  });
});
