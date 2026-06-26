import { describe, expect, it } from 'vitest';
import { resolveSkatteetatenConfig } from './config.server';

describe('resolveSkatteetatenConfig — fail-closed residency gate', () => {
  const full = {
    SKATT_EU_RESIDENT: 'true' as const,
    SKATT_VALIDATION_TOKEN: 'tok',
    SKATT_VALIDATION_BASE_URL: 'https://validation.skatteetaten.no/',
  };

  it('resolves a config when residency is asserted and token + base URL are set', () => {
    expect(resolveSkatteetatenConfig(full)).toEqual({
      token: 'tok',
      baseUrl: 'https://validation.skatteetaten.no', // trailing slash trimmed
    });
  });

  it('is null without the EU-residency assertion (fail-closed)', () => {
    expect(resolveSkatteetatenConfig({ ...full, SKATT_EU_RESIDENT: undefined })).toBeNull();
  });

  it('is null when the token or base URL is missing', () => {
    expect(resolveSkatteetatenConfig({ ...full, SKATT_VALIDATION_TOKEN: undefined })).toBeNull();
    expect(resolveSkatteetatenConfig({ ...full, SKATT_VALIDATION_BASE_URL: undefined })).toBeNull();
  });
});
