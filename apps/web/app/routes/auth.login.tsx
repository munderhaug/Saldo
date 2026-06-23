import { Form, redirect, useActionData, useLoaderData } from 'react-router';
import type { Route } from './+types/auth.login';
import { db } from '~/db/client';
import { devAuthEnabled, isProd, oidcConfigured } from '~/env';
import { assertSameOrigin, getOptionalUser } from '~/auth/auth.server';
import { authenticateWithPassword } from '~/auth/dev-auth.server';
import { createSession, generateSessionToken } from '~/auth/session.server';
import { buildSessionCookie } from '~/auth/cookies.server';
import { beginOidcLogin, buildOidcCookie } from '~/auth/oidc.server';
import { credentialsInput } from '~/contracts';

export async function loader({ request }: Route.LoaderArgs) {
  if (await getOptionalUser(request)) throw redirect('/');
  return { devAuthEnabled, oidcConfigured };
}

export async function action({ request }: Route.ActionArgs) {
  assertSameOrigin(request);
  const form = await request.formData();

  // Start the OIDC redirect dance (BankID/Vipps via Criipto).
  if (form.get('intent') === 'oidc') {
    if (!oidcConfigured) throw new Response('OIDC is not configured', { status: 400 });
    const { authorizationUrl, transaction } = await beginOidcLogin();
    return redirect(authorizationUrl, {
      headers: { 'Set-Cookie': buildOidcCookie(transaction, isProd) },
    });
  }

  // Dev email/password.
  if (!devAuthEnabled) throw new Response('Password login is disabled', { status: 403 });
  const parsed = credentialsInput.safeParse({
    email: form.get('email'),
    password: form.get('password'),
  });
  if (!parsed.success) return { error: 'Sjekk e-post og passord.' };

  const result = await authenticateWithPassword(db, parsed.data.email, parsed.data.password);
  if (!result) return { error: 'Feil e-post eller passord.' };

  const token = generateSessionToken();
  const session = await createSession(db, token, result.userId);
  return redirect('/', {
    headers: { 'Set-Cookie': buildSessionCookie(token, session.expiresAt, isProd) },
  });
}

export default function Login() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Logg inn</h1>

      {data.oidcConfigured && (
        <Form method="post">
          <input type="hidden" name="intent" value="oidc" />
          <button
            type="submit"
            className="border-input bg-background w-full rounded-md border px-4 py-2 text-sm font-medium"
          >
            Fortsett med BankID
          </button>
        </Form>
      )}

      {data.devAuthEnabled && (
        <Form method="post" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-sm font-medium">
              E-post
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
              className="border-input bg-background rounded-md border px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-sm font-medium">
              Passord
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="border-input bg-background rounded-md border px-3 py-2 text-sm"
            />
          </div>
          {actionData?.error && (
            <p role="alert" className="text-destructive text-sm">
              {actionData.error}
            </p>
          )}
          <button
            type="submit"
            className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium"
          >
            Logg inn
          </button>
        </Form>
      )}
    </main>
  );
}
