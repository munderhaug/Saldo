import { describe, expect, it } from 'vitest';
import { resolveEmailConfig, type EmailEnv } from './config.server';

const FULL: EmailEnv = {
  EMAIL_REGION: 'eu',
  EMAIL_SMTP_HOST: 'smtp.example.eu',
  EMAIL_SMTP_PORT: 587,
  EMAIL_SMTP_USER: 'token',
  EMAIL_SMTP_PASSWORD: 'token',
  EMAIL_FROM: 'faktura@minbedrift.no',
};

describe('resolveEmailConfig — the fail-closed EU-residency gate (ADR 0045)', () => {
  it('returns a config when the EU region is pinned and all SMTP fields are set', () => {
    expect(resolveEmailConfig(FULL)).toEqual({
      host: 'smtp.example.eu',
      port: 587,
      user: 'token',
      password: 'token',
      from: 'faktura@minbedrift.no',
    });
  });

  it('returns null when the EU region is NOT pinned, even with full credentials (residency gate)', () => {
    expect(resolveEmailConfig({ ...FULL, EMAIL_REGION: undefined })).toBeNull();
  });

  it('returns null when any SMTP field or the from-address is missing (feature off)', () => {
    expect(resolveEmailConfig({ ...FULL, EMAIL_SMTP_HOST: undefined })).toBeNull();
    expect(resolveEmailConfig({ ...FULL, EMAIL_SMTP_PORT: undefined })).toBeNull();
    expect(resolveEmailConfig({ ...FULL, EMAIL_SMTP_USER: undefined })).toBeNull();
    expect(resolveEmailConfig({ ...FULL, EMAIL_SMTP_PASSWORD: undefined })).toBeNull();
    expect(resolveEmailConfig({ ...FULL, EMAIL_FROM: undefined })).toBeNull();
  });

  it('returns null for a fully empty env (the shipped default — email surface off)', () => {
    expect(resolveEmailConfig({})).toBeNull();
  });
});
