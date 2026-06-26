import { describe, expect, it } from 'vitest';
import {
  GOCARDLESS_DEFAULT_BASE_URL,
  resolveBankingConfig,
  type BankingEnv,
} from './config.server';

const FULL: BankingEnv = {
  BANKING_EU_RESIDENT: 'true',
  BANKING_GOCARDLESS_SECRET_ID: 'secret-id',
  BANKING_GOCARDLESS_SECRET_KEY: 'secret-key',
};

describe('resolveBankingConfig — residency gate (fail-closed)', () => {
  it('returns config when EU residency asserted + both secrets set', () => {
    expect(resolveBankingConfig(FULL)).toEqual({
      secretId: 'secret-id',
      secretKey: 'secret-key',
      baseUrl: GOCARDLESS_DEFAULT_BASE_URL,
    });
  });

  it('returns null when EU residency is NOT asserted (fail-closed)', () => {
    expect(resolveBankingConfig({ ...FULL, BANKING_EU_RESIDENT: undefined })).toBeNull();
  });

  it('returns null when either secret is missing', () => {
    expect(resolveBankingConfig({ ...FULL, BANKING_GOCARDLESS_SECRET_ID: undefined })).toBeNull();
    expect(resolveBankingConfig({ ...FULL, BANKING_GOCARDLESS_SECRET_KEY: undefined })).toBeNull();
    expect(resolveBankingConfig({ ...FULL, BANKING_GOCARDLESS_SECRET_KEY: '  ' })).toBeNull();
  });

  it('returns null for a fully empty env (shipped default: client off)', () => {
    expect(resolveBankingConfig({})).toBeNull();
  });

  it('honours a base-URL override and trims a trailing slash', () => {
    const config = resolveBankingConfig({
      ...FULL,
      BANKING_GOCARDLESS_BASE_URL: 'https://eu.example.test/api/',
    });
    expect(config?.baseUrl).toBe('https://eu.example.test/api');
  });
});
