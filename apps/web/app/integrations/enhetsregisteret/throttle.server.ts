import { createFixedWindowLimiter, createTtlCache, type RateLimitResult } from '~/lib/rate-limit';

/**
 * Per-instance throttle + short-TTL cache for the UNAUTHENTICATED `/oppslag` → Enhetsregisteret proxy.
 * Without it the route is an open, anonymous proxy: it can be used to amplify load against brreg or to
 * enumerate the register with Saldo as the fronting IP (review 2026-06-28). The cache collapses repeated
 * identical lookups; the limiter caps distinct outbound lookups per caller. Both bound a SINGLE process
 * — a durable, cross-instance limiter is the follow-up before heavy public exposure.
 *
 * `Date.now()` is read here (the I/O edge); the primitives in `~/lib/rate-limit` take an injected clock
 * and are unit-tested. Server-only (`.server.ts`): the singletons must never ship to or run in the client.
 */

const WINDOW_MS = 60_000;
/** Distinct outbound lookups allowed per caller key per window (cache hits do NOT consume the budget). */
const MAX_LOOKUPS_PER_WINDOW = 30;
/** brreg data is slow-moving; a few minutes of caching is safe and sharply cuts outbound load. */
const CACHE_TTL_MS = 5 * 60_000;
const CACHE_MAX_ENTRIES = 500;

const limiter = createFixedWindowLimiter(MAX_LOOKUPS_PER_WINDOW, WINDOW_MS);
const cache = createTtlCache<unknown>(CACHE_TTL_MS, CACHE_MAX_ENTRIES);

/**
 * Best-effort caller identity from the trusted proxy's `X-Forwarded-For` (first hop); falls back to a
 * single shared bucket when absent, so even header-less or spoofed callers stay under one global cap.
 */
export function callerKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  return first && first.length > 0 ? first : 'global';
}

/** A previously-cached lookup payload for `query`, if still fresh. */
export function getCachedLookup<T>(query: string): T | undefined {
  return cache.get(query, Date.now()) as T | undefined;
}

/** Cache a resolved lookup payload for `query` (call only for stable, non-transient results). */
export function setCachedLookup<T>(query: string, value: T): void {
  cache.set(query, value, Date.now());
}

/** Whether this caller may make another outbound lookup right now. */
export function checkLookupRate(key: string): RateLimitResult {
  return limiter.check(key, Date.now());
}
