import * as client from 'openid-client';
import { env } from '../env.js';

/**
 * OIDC provider (ADR 0020) using openid-client v6 — Authorization Code + PKCE (S256) + state + nonce.
 * This is the production login path (BankID/Vipps via the Criipto broker). It is wired and type-checked
 * but NOT live-verified here: it needs egress + a real Criipto tenant (deferred per STATUS). Everything
 * is guarded by `oidcConfigured`; the dev password provider covers the testable flow today.
 */
const SCOPE = 'openid email';
const OIDC_COOKIE = 'saldo_oidc';
const TX_TTL_SECONDS = 600; // the redirect round-trip is short-lived

let configPromise: Promise<client.Configuration> | null = null;
function getConfig(): Promise<client.Configuration> {
  const { OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET } = env;
  if (!OIDC_ISSUER || !OIDC_CLIENT_ID || !OIDC_CLIENT_SECRET) {
    throw new Error('OIDC is not configured (OIDC_ISSUER/CLIENT_ID/CLIENT_SECRET).');
  }
  configPromise ??= client.discovery(new URL(OIDC_ISSUER), OIDC_CLIENT_ID, OIDC_CLIENT_SECRET);
  return configPromise;
}

function redirectUri(): string {
  return new URL('/auth/callback', env.APP_URL).href;
}

/** The per-login secrets that must survive the redirect to the IdP and back (held in an HttpOnly cookie). */
export interface OidcTransaction {
  readonly state: string;
  readonly nonce: string;
  readonly codeVerifier: string;
}

/** Build the IdP authorization URL and the transaction to stash until the callback. */
export async function beginOidcLogin(): Promise<{
  authorizationUrl: string;
  transaction: OidcTransaction;
}> {
  const config = await getConfig();
  const codeVerifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
  const state = client.randomState();
  const nonce = client.randomNonce();
  const url = client.buildAuthorizationUrl(config, {
    redirect_uri: redirectUri(),
    scope: SCOPE,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
    nonce,
  });
  return { authorizationUrl: url.href, transaction: { state, nonce, codeVerifier } };
}

/** Exchange the code at the callback, validating iss/state/nonce/PKCE; return the verified identity. */
export async function completeOidcLogin(
  currentUrl: URL,
  tx: OidcTransaction,
): Promise<{ email: string; issuer: string; subject: string }> {
  const config = await getConfig();
  const tokens = await client.authorizationCodeGrant(config, currentUrl, {
    pkceCodeVerifier: tx.codeVerifier,
    expectedState: tx.state,
    expectedNonce: tx.nonce,
  });
  const claims = tokens.claims();
  const email = typeof claims?.email === 'string' ? claims.email.toLowerCase() : undefined;
  if (!claims || !email) throw new Error('OIDC: the ID token has no usable email claim');
  // The account is keyed on the IdP's immutable `(iss, sub)` pair (ADR 0020, RFC 9700), NOT on email —
  // email is a re-assignable, broker-fronted attribute, so keying on it is the classic "login with
  // unverified/aliased email" account-takeover. `iss`/`sub` are validated by openid-client during the
  // grant above and are guaranteed present on a verified ID token. We still require `email_verified`
  // (an OIDC-core boolean; strict `true`) before storing the address so a *displayed* email is trusted.
  if (claims.email_verified !== true) {
    throw new Error('OIDC: the ID token email is not verified (email_verified must be true)');
  }
  return { email, issuer: claims.iss, subject: claims.sub };
}

// ── Transaction cookie: state/nonce/verifier across the redirect (HttpOnly, short-lived) ──
function attrs(secure: boolean): string[] {
  return ['HttpOnly', 'SameSite=Lax', 'Path=/', ...(secure ? ['Secure'] : [])];
}
export function buildOidcCookie(tx: OidcTransaction, secure: boolean): string {
  const value = Buffer.from(JSON.stringify(tx)).toString('base64url');
  return [`${OIDC_COOKIE}=${value}`, ...attrs(secure), `Max-Age=${TX_TTL_SECONDS}`].join('; ');
}
export function clearOidcCookie(secure: boolean): string {
  return [`${OIDC_COOKIE}=`, ...attrs(secure), 'Max-Age=0'].join('; ');
}
export function readOidcTransaction(request: Request): OidcTransaction | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1 || part.slice(0, eq).trim() !== OIDC_COOKIE) continue;
    try {
      const tx: unknown = JSON.parse(
        Buffer.from(part.slice(eq + 1).trim(), 'base64url').toString(),
      );
      if (
        tx &&
        typeof tx === 'object' &&
        typeof (tx as OidcTransaction).state === 'string' &&
        typeof (tx as OidcTransaction).nonce === 'string' &&
        typeof (tx as OidcTransaction).codeVerifier === 'string'
      ) {
        return tx as OidcTransaction;
      }
    } catch {
      return null;
    }
    return null;
  }
  return null;
}
