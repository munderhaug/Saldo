import { redirect } from 'react-router';
import type { Route } from './+types/auth.sign-out-everywhere';
import { db } from '~/db/client';
import { isProd } from '~/env';
import { assertSameOrigin, requireUser } from '~/auth/auth.server';
import { buildSessionCookie } from '~/auth/cookies.server';
import { createSession, generateSessionToken, invalidateUserSessions } from '~/auth/session.server';
import { requestLogger } from '~/observability/logger.server';

/**
 * "Sign out everywhere" — a security action (review 2026-06-28). Invalidates ALL of the user's
 * sessions (e.g. after a suspected token compromise), then re-mints a fresh session for the acting
 * browser so this device stays signed in rather than being bounced to login. POST-only with
 * assertSameOrigin (CSRF). This wires the existing invalidateUserSessions into a real call site.
 */
export async function action({ request }: Route.ActionArgs) {
  assertSameOrigin(request);
  const user = await requireUser(request);
  const { log } = requestLogger(request);

  await invalidateUserSessions(db, user.id);
  // Re-establish the current device with a brand-new token (every prior token, including this one, is
  // now dead) so the acting user isn't logged out of the device they took the action on.
  const token = generateSessionToken();
  const session = await createSession(db, token, user.id);
  log.info({ userId: user.id }, 'sign-out-everywhere');

  return redirect('/', {
    headers: { 'Set-Cookie': buildSessionCookie(token, session.expiresAt, isProd) },
  });
}

// POST-only action; a stray GET just bounces home.
export function loader() {
  throw redirect('/');
}
