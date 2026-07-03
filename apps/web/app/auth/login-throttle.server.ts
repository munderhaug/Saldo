import { createFixedWindowLimiter } from '~/lib/rate-limit';

/**
 * Per-instance brute-force throttle for password login (review 2026-06-28). Two fixed-window limiters:
 * one keyed per source IP, one per account (normalized email). An attempt must pass BOTH — so neither a
 * single IP spraying many accounts nor a focused attack on one account can guess passwords without
 * bound. The account key is the normalized email, so case/whitespace variants share one bucket; it is
 * applied whether or not the account exists, so the throttle itself never reveals account existence.
 *
 * These bound a SINGLE process (the `~/lib/rate-limit` primitives are in-memory); on a multi-instance
 * deploy the caps are per-pod. A durable, cross-instance limiter is the follow-up — same posture as the
 * /oppslag throttle. `Date.now()` is read at the route edge and injected here so the logic stays
 * deterministically testable. Server-only (`.server.ts`).
 */
const WINDOW_MS = 15 * 60_000; // 15 minutes
/** Login attempts allowed per source IP per window. Generous enough that normal use never trips it. */
const MAX_PER_IP = 20;
/** Login attempts allowed per account per window — the tight bound on guessing one account's password. */
const MAX_PER_ACCOUNT = 10;

const ipLimiter = createFixedWindowLimiter(MAX_PER_IP, WINDOW_MS);
const accountLimiter = createFixedWindowLimiter(MAX_PER_ACCOUNT, WINDOW_MS);

/** Caller identity for the per-IP bucket: the trusted proxy's peer (see `~/lib/client-ip.server`). */
export { clientIpKey as loginCallerKey } from '~/lib/client-ip.server';

/**
 * Whether this login attempt may proceed. Consults BOTH limiters and consumes from each (so both
 * counters advance every attempt); refuses if either is exhausted. `email` should be the normalized
 * address. Returns false when throttled.
 */
export function checkLoginRate(ip: string, email: string, now = Date.now()): boolean {
  const ipOk = ipLimiter.check(ip, now).allowed;
  const accountOk = accountLimiter.check(`acct:${email}`, now).allowed;
  return ipOk && accountOk;
}
