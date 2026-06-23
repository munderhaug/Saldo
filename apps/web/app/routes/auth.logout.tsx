import { redirect } from 'react-router';
import type { Route } from './+types/auth.logout';
import { db } from '~/db/client';
import { isProd } from '~/env';
import { assertSameOrigin } from '~/auth/auth.server';
import { clearSessionCookie, readSessionToken } from '~/auth/cookies.server';
import { invalidateSession } from '~/auth/session.server';

export async function action({ request }: Route.ActionArgs) {
  assertSameOrigin(request);
  const token = readSessionToken(request);
  if (token) await invalidateSession(db, token);
  return redirect('/auth/login', { headers: { 'Set-Cookie': clearSessionCookie(isProd) } });
}

// Logout is a POST-only action; a stray GET just bounces to the login page.
export function loader() {
  throw redirect('/auth/login');
}
