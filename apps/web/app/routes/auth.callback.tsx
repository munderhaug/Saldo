import { redirect } from 'react-router';
import type { Route } from './+types/auth.callback';
import { db } from '~/db/client';
import { isProd } from '~/env';
import { clearOidcCookie, completeOidcLogin, readOidcTransaction } from '~/auth/oidc.server';
import { buildSessionCookie } from '~/auth/cookies.server';
import { createSession, generateSessionToken } from '~/auth/session.server';
import { createOidcUser, findUserByEmail } from '~/auth/users.server';

/**
 * OIDC redirect target. Reads the transaction stashed by /auth/login, exchanges the code (validating
 * iss/state/nonce/PKCE), then finds-or-creates the user by verified email and opens a session.
 * Not live-verified here (needs Criipto + egress); structurally complete.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const transaction = readOidcTransaction(request);
  if (!transaction) throw redirect('/auth/login');

  const { email } = await completeOidcLogin(new URL(request.url), transaction);
  const user = (await findUserByEmail(db, email)) ?? (await createOidcUser(db, email));

  const token = generateSessionToken();
  const session = await createSession(db, token, user.id);
  const headers = new Headers();
  headers.append('Set-Cookie', buildSessionCookie(token, session.expiresAt, isProd));
  headers.append('Set-Cookie', clearOidcCookie(isProd));
  return redirect('/', { headers });
}
