import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { øre } from '@saldo/domain';
import { extractReceipt } from './client.server';

/** A deterministic OpenAI-compatible completion whose content is the model's JSON extraction. */
function completion(fields: unknown, model = 'qwen2.5-vl:7b'): unknown {
  return { model, choices: [{ message: { content: JSON.stringify(fields) } }] };
}

const validFields = {
  supplier: 'Rema 1000',
  documentDate: '2026-06-20',
  direction: 'purchase',
  currency: 'NOK',
  net: 1250,
  vat: 312.5,
  confidence: 0.91,
};

/** Stub global fetch to return one response body. */
function mockFetch(body: unknown, init?: ResponseInit): void {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(payload, init))),
  );
}

const image = { bytes: new Uint8Array([1, 2, 3]), mediaType: 'image/jpeg' };

beforeEach(() => {
  process.env.LLM_BASE_URL = 'http://localhost:11434/v1';
  process.env.LLM_MODEL = 'qwen2.5-vl';
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.LLM_BASE_URL;
  delete process.env.LLM_MODEL;
  delete process.env.LLM_API_KEY;
  delete process.env.LLM_EU_RESIDENT;
});

describe('extractReceipt', () => {
  it('returns a validated extraction with provenance when the backend is configured', async () => {
    mockFetch(completion(validFields));
    const result = await extractReceipt(image);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const { extraction } = result;
      expect(extraction.direction).toBe('purchase');
      expect(extraction.net).toBe(øre(125000));
      expect(extraction.vat).toBe(øre(31250));
      // Provenance (Art. 50(2)): always disclosed; the served tag is the pinned version.
      expect(extraction.provenance.aiAssisted).toBe(true);
      expect(extraction.provenance.model).toBe('qwen2.5-vl');
      expect(extraction.provenance.modelVersion).toBe('qwen2.5-vl:7b');
      expect(extraction.provenance.confidence).toBe(0.91);
    }
  });

  it('is not-configured (no external default) when LLM_BASE_URL is unset', async () => {
    delete process.env.LLM_BASE_URL;
    const result = await extractReceipt(image);
    expect(result).toEqual({ ok: false, reason: 'not-configured' });
  });

  it('residency gate: blocks a non-on-prem endpoint unless EU residency is confirmed', async () => {
    process.env.LLM_BASE_URL = 'https://api.openai.com/v1';
    mockFetch(completion(validFields)); // even if a server answered, the gate must fail closed first
    expect(await extractReceipt(image)).toEqual({ ok: false, reason: 'not-configured' });
  });

  it('residency gate: allows a confirmed-EU hosted endpoint', async () => {
    process.env.LLM_BASE_URL = 'https://llm.eu.example.com/v1';
    process.env.LLM_EU_RESIDENT = 'true';
    mockFetch(completion(validFields));
    expect((await extractReceipt(image)).ok).toBe(true);
  });

  it('maps a network failure to a typed error, never a throw', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('network'))),
    );
    expect(await extractReceipt(image)).toEqual({ ok: false, reason: 'error' });
  });

  it('maps a non-OK HTTP status to error', async () => {
    mockFetch('nope', { status: 500 });
    expect(await extractReceipt(image)).toEqual({ ok: false, reason: 'error' });
  });

  it('rejects a malformed envelope as invalid-response', async () => {
    mockFetch({ choices: [] });
    expect(await extractReceipt(image)).toEqual({ ok: false, reason: 'invalid-response' });
  });

  it('rejects non-JSON model content as invalid-response', async () => {
    // The envelope is valid but the message content is not parseable JSON.
    mockFetch({ model: 'm', choices: [{ message: { content: 'not json at all' } }] });
    expect(await extractReceipt(image)).toEqual({ ok: false, reason: 'invalid-response' });
  });

  it('rejects model content that fails the field contract as invalid-response', async () => {
    mockFetch(completion({ ...validFields, confidence: 5 }));
    expect(await extractReceipt(image)).toEqual({ ok: false, reason: 'invalid-response' });
  });

  it('falls back to the configured model id when the response omits one', async () => {
    mockFetch({ choices: [{ message: { content: JSON.stringify(validFields) } }] });
    const result = await extractReceipt(image);
    expect(result.ok && result.extraction.provenance.modelVersion).toBe('qwen2.5-vl');
  });
});
