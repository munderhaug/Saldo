import { describe, expect, it } from 'vitest';
import { resolveLlmConfig } from './config.server';

/**
 * The LLM residency/SSRF gate (review 2026-06-28, H6). `resolveLlmConfig` is pure over an injected env,
 * so these table-tests cover every host class plus adversarial near-misses with no process.env mutation.
 * The security property under test: receipt-image PII reaches an endpoint ONLY when the host is the
 * operator's own infra (on-prem) OR the operator explicitly attests EU residency — and anything we
 * cannot cleanly classify fails closed (returns null), even with the attestation set.
 */
const base = { LLM_API_KEY: 'k', LLM_MODEL: 'm' };
const url = (host: string) => `http://${host}/v1`;

describe('resolveLlmConfig — residency/SSRF gate', () => {
  it('is null when LLM_BASE_URL is unset or blank', () => {
    expect(resolveLlmConfig({})).toBeNull();
    expect(resolveLlmConfig({ LLM_BASE_URL: '   ' })).toBeNull();
  });

  it('is null for a malformed URL (fail closed)', () => {
    expect(resolveLlmConfig({ LLM_BASE_URL: 'not a url' })).toBeNull();
    expect(resolveLlmConfig({ LLM_BASE_URL: 'http://' })).toBeNull();
  });

  // ── On-prem hosts: allowed with NO EU-residency attestation ──
  const onPrem = [
    'localhost',
    'ollama.localhost',
    'llm.internal',
    'box.local',
    '127.0.0.1',
    '127.5.6.7', // all of 127/8 is loopback
    '10.0.0.1',
    '192.168.1.10',
    '172.16.0.1',
    '172.31.255.254',
    '169.254.169.254', // link-local incl. cloud metadata
    '0.0.0.0',
    '[::1]',
    '[::ffff:127.0.0.1]', // IPv4-mapped IPv6 loopback
    '[::ffff:10.0.0.1]',
    '[fc00::1]', // unique-local
    '[fd12:3456::1]',
    '[fe80::1]', // link-local
  ];
  it.each(onPrem)('treats %s as on-prem (no EU attestation needed)', (host) => {
    const cfg = resolveLlmConfig({ ...base, LLM_BASE_URL: url(host) });
    expect(cfg).not.toBeNull();
    expect(cfg?.baseUrl).toBe(url(host));
  });

  // ── Off-box public hosts: blocked unless EU residency is attested ──
  const offBox = [
    'api.openai.com',
    'llm.eu.example.com',
    '8.8.8.8',
    '1.1.1.1',
    '[2606:4700::1111]',
  ];
  it.each(offBox)('blocks off-box %s without LLM_EU_RESIDENT, allows it with', (host) => {
    expect(resolveLlmConfig({ ...base, LLM_BASE_URL: url(host) })).toBeNull();
    expect(
      resolveLlmConfig({ ...base, LLM_BASE_URL: url(host), LLM_EU_RESIDENT: 'true' }),
    ).not.toBeNull();
  });

  // RFC1918 boundary: 172.16–172.31 is private; 172.15 / 172.32 are public (off-box).
  it('classifies the 172.16/12 boundary correctly', () => {
    expect(resolveLlmConfig({ ...base, LLM_BASE_URL: url('172.16.0.1') })).not.toBeNull();
    expect(resolveLlmConfig({ ...base, LLM_BASE_URL: url('172.31.0.1') })).not.toBeNull();
    expect(resolveLlmConfig({ ...base, LLM_BASE_URL: url('172.15.0.1') })).toBeNull(); // public
    expect(resolveLlmConfig({ ...base, LLM_BASE_URL: url('172.32.0.1') })).toBeNull(); // public
  });

  // ── Encoded/obfuscated IPv4: the WHATWG URL parser canonicalizes these to their true address
  //    (2130706433 / 0x7f.0.0.1 / 0177.0.0.1 / 127.1 all → 127.0.0.1), so they resolve to loopback
  //    and are correctly on-prem (no third party reached). The OLD string classifier mis-flagged
  //    them as off-box; this proves the regression is closed. ──
  const encodedLoopback = ['2130706433', '0x7f.0.0.1', '0177.0.0.1', '127.1', '127.0.0x1'];
  it.each(encodedLoopback)(
    'classifies encoded loopback %s as on-prem (URL-canonicalized)',
    (host) => {
      expect(resolveLlmConfig({ ...base, LLM_BASE_URL: url(host) })).not.toBeNull();
    },
  );

  // ── Suffix/substring spoofs that merely CONTAIN a private token: never on-prem ──
  const spoofs = [
    'notlocalhost.evil.com',
    'localhost.evil.com',
    'foo.internal.evil.com',
    'x.local.evil.com',
  ];
  it.each(spoofs)('does not treat the spoof %s as on-prem', (host) => {
    // Off-box (a real DNS name): blocked without the attestation.
    expect(resolveLlmConfig({ ...base, LLM_BASE_URL: url(host) })).toBeNull();
  });

  // A DNS name that merely LOOKS like a private IP (digit-leading, not a canonical IP) is a third
  // party — the URL parser keeps it verbatim. Fail closed even WITH the attestation set.
  it('digit-leading spoofs (e.g. 127.0.0.1.evil.com) fail closed even with EU attested', () => {
    const host = '127.0.0.1.evil.com';
    expect(resolveLlmConfig({ ...base, LLM_BASE_URL: url(host) })).toBeNull();
    expect(
      resolveLlmConfig({ ...base, LLM_BASE_URL: url(host), LLM_EU_RESIDENT: 'true' }),
    ).toBeNull();
  });

  it('trims the trailing slash and applies key/model defaults', () => {
    const cfg = resolveLlmConfig({ LLM_BASE_URL: 'http://localhost:11434/v1/' });
    expect(cfg).toEqual({
      baseUrl: 'http://localhost:11434/v1',
      apiKey: 'ollama',
      model: 'qwen2.5-vl',
    });
  });

  it('only a strict "true" attestation opens an off-box host', () => {
    for (const v of ['1', 'yes', 'TRUE', 'false', '']) {
      expect(
        resolveLlmConfig({ ...base, LLM_BASE_URL: url('api.openai.com'), LLM_EU_RESIDENT: v }),
      ).toBeNull();
    }
    // The resolver trims, so a padded "  true  " still attests.
    expect(
      resolveLlmConfig({
        ...base,
        LLM_BASE_URL: url('api.openai.com'),
        LLM_EU_RESIDENT: '  true  ',
      }),
    ).not.toBeNull();
  });
});
