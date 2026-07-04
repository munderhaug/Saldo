/**
 * The rate-limit key for an unauthenticated caller — the ONE shared definition (login + /oppslag).
 *
 * `X-Forwarded-For` grows left-to-right: whatever the CLIENT sent arrives first, and each proxy
 * APPENDS the peer address it actually accepted the connection from. Only the right-most hop was
 * written by OUR trusted edge proxy from the real TCP peer; every entry left of it is
 * attacker-controlled. Keying on the first hop (the pre-review behavior) let a caller mint a fresh
 * bucket per request with a random header and walk straight past the limiter.
 *
 * Falls back to a single shared `global` bucket when the header is absent (direct/dev traffic), so
 * header-less callers stay under one collective cap rather than each getting their own.
 */
export function clientIpKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (!forwarded) return 'global';
  const hops = forwarded
    .split(',')
    .map((hop) => hop.trim())
    .filter((hop) => hop.length > 0);
  return hops.at(-1) ?? 'global';
}
