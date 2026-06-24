import { describe, expect, it } from 'vitest';
import { øre } from '@saldo/domain';
import { aiProvenance, llmExtractionFields, receiptExtraction } from './receipt-extraction';

const validProvenance = {
  aiAssisted: true as const,
  model: 'qwen2.5-vl',
  modelVersion: 'qwen2.5-vl:7b',
  confidence: 0.9,
};

describe('aiProvenance — the Art. 50(2) provenance gate', () => {
  it('accepts a fully-disclosed provenance', () => {
    expect(aiProvenance.parse(validProvenance)).toEqual(validProvenance);
  });

  it('REFUSES a proposal that does not disclose AI (aiAssisted must be the literal true)', () => {
    expect(aiProvenance.safeParse({ ...validProvenance, aiAssisted: false }).success).toBe(false);
    expect(aiProvenance.safeParse({ ...validProvenance, aiAssisted: undefined }).success).toBe(
      false,
    );
  });

  it('requires a non-empty model + version and a 0..1 confidence', () => {
    expect(aiProvenance.safeParse({ ...validProvenance, model: '' }).success).toBe(false);
    expect(aiProvenance.safeParse({ ...validProvenance, modelVersion: '' }).success).toBe(false);
    expect(aiProvenance.safeParse({ ...validProvenance, confidence: 1.5 }).success).toBe(false);
    expect(aiProvenance.safeParse({ ...validProvenance, confidence: -0.1 }).success).toBe(false);
  });
});

describe('llmExtractionFields — boundary validation of the raw model JSON', () => {
  const base = {
    supplier: 'Rema 1000',
    documentDate: '2026-06-20',
    direction: 'purchase',
    currency: 'NOK',
    net: '1250.50',
    vat: '312.63',
    confidence: 0.88,
  };

  it('parses amounts (string or number) to integer øre and upper-cases the currency', () => {
    const parsed = llmExtractionFields.parse({ ...base, currency: 'nok', net: 1250.5, vat: 0 });
    expect(parsed.net).toBe(øre(125050));
    expect(parsed.vat).toBe(øre(0));
    expect(parsed.currency).toBe('NOK');
  });

  it('accepts a null supplier/date (the model couldn’t read them)', () => {
    const parsed = llmExtractionFields.parse({ ...base, supplier: null, documentDate: null });
    expect(parsed.supplier).toBeNull();
    expect(parsed.documentDate).toBeNull();
  });

  it('rejects a malformed amount, a bad date, an out-of-range confidence, and an unknown direction', () => {
    expect(llmExtractionFields.safeParse({ ...base, net: 'abc' }).success).toBe(false);
    expect(llmExtractionFields.safeParse({ ...base, net: '-5' }).success).toBe(false);
    expect(llmExtractionFields.safeParse({ ...base, documentDate: '20.06.2026' }).success).toBe(
      false,
    );
    expect(llmExtractionFields.safeParse({ ...base, confidence: 2 }).success).toBe(false);
    expect(llmExtractionFields.safeParse({ ...base, direction: 'refund' }).success).toBe(false);
  });
});

describe('receiptExtraction — every extraction carries its provenance', () => {
  const fields = {
    supplier: 'Rema 1000',
    documentDate: '2026-06-20',
    direction: 'purchase' as const,
    currency: 'NOK',
    net: øre(125050),
    vat: øre(31263),
  };

  it('parses an extraction with provenance', () => {
    const parsed = receiptExtraction.parse({ ...fields, provenance: validProvenance });
    expect(parsed.provenance.aiAssisted).toBe(true);
    expect(parsed.net).toBe(øre(125050));
  });

  it('REFUSES an extraction with no provenance — the code-level AI-Act gate', () => {
    expect(receiptExtraction.safeParse(fields).success).toBe(false);
  });
});
