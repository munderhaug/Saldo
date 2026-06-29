import { describe, it, expect } from 'vitest';
import { createFixedWindowLimiter, createTtlCache } from './rate-limit';

describe('createFixedWindowLimiter', () => {
  it('allows up to the limit, then refuses within the window', () => {
    const limiter = createFixedWindowLimiter(3, 1000);
    expect(limiter.check('a', 0).allowed).toBe(true);
    expect(limiter.check('a', 100).allowed).toBe(true);
    expect(limiter.check('a', 200).allowed).toBe(true);
    const refused = limiter.check('a', 300);
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfterMs).toBe(700); // resetAt (1000) - now (300)
  });

  it('resets once the window elapses', () => {
    const limiter = createFixedWindowLimiter(1, 1000);
    expect(limiter.check('a', 0).allowed).toBe(true);
    expect(limiter.check('a', 999).allowed).toBe(false);
    expect(limiter.check('a', 1000).allowed).toBe(true);
  });

  it('tracks each key independently', () => {
    const limiter = createFixedWindowLimiter(1, 1000);
    expect(limiter.check('a', 0).allowed).toBe(true);
    expect(limiter.check('b', 0).allowed).toBe(true);
    expect(limiter.check('a', 0).allowed).toBe(false);
  });
});

describe('createTtlCache', () => {
  it('returns a stored value within its TTL and expires it after', () => {
    const cache = createTtlCache<number>(1000, 10);
    cache.set('k', 42, 0);
    expect(cache.get('k', 500)).toBe(42);
    expect(cache.get('k', 1000)).toBeUndefined();
  });

  it('evicts the least-recently-used entry past capacity', () => {
    const cache = createTtlCache<number>(10_000, 2);
    cache.set('a', 1, 0);
    cache.set('b', 2, 0);
    cache.get('a', 1); // 'a' becomes most-recently-used, so 'b' is now the LRU
    cache.set('c', 3, 1); // over capacity → evict 'b'
    expect(cache.get('a', 1)).toBe(1);
    expect(cache.get('b', 1)).toBeUndefined();
    expect(cache.get('c', 1)).toBe(3);
  });

  it('treats a re-set key as fresh, not a duplicate', () => {
    const cache = createTtlCache<number>(1000, 10);
    cache.set('k', 1, 0);
    cache.set('k', 2, 500);
    expect(cache.get('k', 600)).toBe(2);
    expect(cache.get('k', 1499)).toBe(2); // expiry measured from the second set (500 + 1000)
    expect(cache.get('k', 1500)).toBeUndefined(); // boundary is exclusive
  });
});
