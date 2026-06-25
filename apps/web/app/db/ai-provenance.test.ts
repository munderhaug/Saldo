import { describe, expect, it } from 'vitest';
import { pino } from 'pino';
import { aiProvenanceLogFields } from './ai-provenance.server.js';

// Pure unit test (no Docker). The provenance log line is the one place an AI-assisted post reaches the
// logs (Art. 50(2) observability, ADR 0037). The data-handling rule forbids logging personal data: this
// proves the logged shape is model/version/confidence + linkage ONLY — never the supplier (// personal),
// the amounts (PII), or the image. `aiProvenanceLogFields` is the single definition of what we log, so a
// future edit that adds a personal field fails here rather than silently leaking it.
describe('ai provenance log fields (no personal data)', () => {
  const input = {
    organizationId: 'org-123',
    voucherId: 'voucher-456',
    model: 'qwen2.5-vl',
    modelVersion: 'qwen2.5-vl:7b',
    confidence: 0.9,
  };

  it('emits exactly the minimal provenance keys — and no personal/financial field', () => {
    const fields = aiProvenanceLogFields(input);
    expect(Object.keys(fields).sort()).toEqual([
      'confidence',
      'event',
      'model',
      'modelVersion',
      'organizationId',
      'voucherId',
    ]);
    // The personal/financial fields that exist on the extraction must NEVER appear here.
    for (const banned of ['supplier', 'amount', 'net', 'vat', 'image', 'documentDate']) {
      expect(fields).not.toHaveProperty(banned);
    }
  });

  it('the serialized pino line contains the model but no supplier/amount even when those are in scope', () => {
    // Simulate a careless caller who has the full extraction in scope: only the minimal fields are logged.
    const extraction = { ...input, supplier: 'Kari Nordmann', net: 40_000, vat: 10_000 };
    let line = '';
    const log = pino({ base: null }, { write: (s: string) => (line += s) });
    log.info(aiProvenanceLogFields(extraction), 'AI-assisted voucher posted');

    expect(line).toContain('qwen2.5-vl');
    expect(line).toContain('voucher-456');
    expect(line).not.toContain('Kari Nordmann');
    expect(line).not.toContain('40000');
  });
});
