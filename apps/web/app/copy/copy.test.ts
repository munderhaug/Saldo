import { describe, expect, it } from 'vitest';
import { en, nb, t } from './index';
import type { MessageKey } from './index';

const keys = Object.keys(nb) as MessageKey[];
const placeholders = (s: string): string[] =>
  [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? '').sort();

describe('microcopy catalog (nb ⇄ en)', () => {
  it('every Norwegian string is non-empty', () => {
    for (const key of keys) expect(nb[key].trim().length).toBeGreaterThan(0);
  });

  it('en mirrors nb exactly — same keys, none empty', () => {
    // `satisfies Record<MessageKey, string>` pins the key set at compile time; this guards the
    // runtime shape and catches an empty reference string.
    expect(Object.keys(en).sort()).toEqual([...keys].sort());
    for (const key of keys) expect(en[key].trim().length).toBeGreaterThan(0);
  });

  it('placeholders match between nb and en for every key', () => {
    // A reference string must not drop or rename a `{placeholder}` — that would desync the two.
    for (const key of keys) expect(placeholders(en[key])).toEqual(placeholders(nb[key]));
  });
});

describe('t() — keyed lookup + interpolation', () => {
  it('returns the exact Norwegian string for a plain key', () => {
    expect(t('auth.login.title')).toBe('Logg inn');
    expect(t('app.tagline')).toBe(nb['app.tagline']);
  });

  it('fills {placeholders} from typed params', () => {
    expect(t('error.statusHeading', { status: 404, statusText: 'Not Found' })).toBe(
      '404 Not Found',
    );
  });

  it('rejects unknown keys and missing params at the type level', () => {
    // @ts-expect-error — an unknown key is not assignable to MessageKey.
    t('nope.not.a.key');
    // @ts-expect-error — '{status} {statusText}' requires a params object.
    t('error.statusHeading');
    // The valid call still type-checks and runs:
    expect(t('error.statusHeading', { status: 500, statusText: 'Boom' })).toBe('500 Boom');
  });
});
