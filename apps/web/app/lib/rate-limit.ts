/**
 * Tiny in-memory primitives for protecting an unauthenticated outbound proxy (no external dependency,
 * single process). These bound ONE Node instance — they are not a distributed limiter; a durable,
 * cross-instance limiter (e.g. Postgres/Redis token bucket) is the follow-up when the surface grows.
 *
 * `now` is injected (epoch ms) so the core logic is deterministically unit-testable; the I/O edge passes
 * `Date.now()`. Both structures self-prune so memory stays bounded under churn.
 */

export interface RateLimitResult {
  readonly allowed: boolean;
  /** Milliseconds until the window resets (0 when allowed). */
  readonly retryAfterMs: number;
}

export interface FixedWindowLimiter {
  /** Record an attempt for `key` at `now`; allow up to `limit` attempts per `windowMs` window. */
  check(key: string, now: number): RateLimitResult;
}

/** A fixed-window counter per key: at most `limit` calls per `windowMs`, then refused until the reset. */
export function createFixedWindowLimiter(limit: number, windowMs: number): FixedWindowLimiter {
  const windows = new Map<string, { count: number; resetAt: number }>();
  return {
    check(key, now) {
      const existing = windows.get(key);
      if (!existing || now >= existing.resetAt) {
        windows.set(key, { count: 1, resetAt: now + windowMs });
        // Opportunistic prune of expired windows so an attacker cycling keys can't grow the map forever.
        if (windows.size > 10_000) {
          for (const [k, w] of windows) if (now >= w.resetAt) windows.delete(k);
        }
        return { allowed: true, retryAfterMs: 0 };
      }
      if (existing.count < limit) {
        existing.count += 1;
        return { allowed: true, retryAfterMs: 0 };
      }
      return { allowed: false, retryAfterMs: existing.resetAt - now };
    },
  };
}

export interface TtlCache<T> {
  get(key: string, now: number): T | undefined;
  set(key: string, value: T, now: number): void;
}

/**
 * A small TTL + LRU cache. Entries expire `ttlMs` after `set`; when over `maxEntries` the
 * least-recently-used entry is evicted (Map preserves insertion order, and `get` re-inserts on hit).
 */
export function createTtlCache<T>(ttlMs: number, maxEntries: number): TtlCache<T> {
  const store = new Map<string, { value: T; expiresAt: number }>();
  return {
    get(key, now) {
      const entry = store.get(key);
      if (!entry) return undefined;
      if (now >= entry.expiresAt) {
        store.delete(key);
        return undefined;
      }
      // Refresh recency: delete + re-set moves the key to the most-recently-used position.
      store.delete(key);
      store.set(key, entry);
      return entry.value;
    },
    set(key, value, now) {
      store.delete(key);
      store.set(key, { value, expiresAt: now + ttlMs });
      if (store.size > maxEntries) {
        const oldest = store.keys().next().value;
        if (oldest !== undefined) store.delete(oldest);
      }
    },
  };
}
