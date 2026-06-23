import { hash, verify } from '@node-rs/argon2';

/**
 * Password hashing for the dev email/password provider. Production auth is BankID/Vipps via the OIDC
 * broker (no password) — this exists so the full login → org → ledger flow is testable now.
 *
 * @node-rs/argon2 defaults to **argon2id** (the PHC output is `$argon2id$…`). Parameters follow the
 * OWASP argon2id guidance (m=19 MiB, t=2, p=1); the cost is encoded in the hash, so `verify` needs no
 * options. Server-only (`.server.ts`) — never bundled to the client. (We avoid the `Algorithm` const
 * enum: it's an ambient const enum, unusable under `verbatimModuleSyntax`; the default already is id.)
 */
const OPTIONS = {
  memoryCost: 19456, // KiB (~19 MiB)
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  return verify(passwordHash, password);
}
