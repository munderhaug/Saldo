import { Form, redirect, useActionData, useLoaderData } from 'react-router';
import type { Route } from './+types/auth.login';
import { db } from '~/db/client';
import { devAuthEnabled, isProd, oidcConfigured } from '~/env';
import { assertSameOrigin, getOptionalUser } from '~/auth/auth.server';
import { authenticateWithPassword } from '~/auth/dev-auth.server';
import { createUserWithPassword, findUserByEmail } from '~/auth/users.server';
import { checkLoginRate, loginCallerKey } from '~/auth/login-throttle.server';
import { createSession, generateSessionToken } from '~/auth/session.server';
import { buildSessionCookie } from '~/auth/cookies.server';
import { beginOidcLogin, buildOidcCookie } from '~/auth/oidc.server';
import { requestLogger } from '~/observability/logger.server';
import { credentialsInput } from '~/contracts';
import { t } from '~/copy';
import { SubmitButton } from '~/components/ui/submit-button';

export function meta() {
  return [{ title: t('auth.login.title') }];
}

export async function loader({ request }: Route.LoaderArgs) {
  if (await getOptionalUser(request)) throw redirect('/');
  return { devAuthEnabled, oidcConfigured };
}

export async function action({ request }: Route.ActionArgs) {
  assertSameOrigin(request);
  const { log } = requestLogger(request);
  const form = await request.formData();

  // Start the OIDC redirect dance (BankID/Vipps via Criipto).
  if (form.get('intent') === 'oidc') {
    if (!oidcConfigured) throw new Response(t('auth.login.oidcNotConfigured'), { status: 400 });
    const { authorizationUrl, transaction } = await beginOidcLogin();
    log.info({ provider: 'oidc' }, 'login started');
    return redirect(authorizationUrl, {
      headers: { 'Set-Cookie': buildOidcCookie(transaction, isProd) },
    });
  }

  // Dev email/password. (Never log the email or password — only the outcome.)
  if (!devAuthEnabled) throw new Response(t('auth.login.passwordDisabled'), { status: 403 });
  const parsed = credentialsInput.safeParse({
    email: form.get('email'),
    password: form.get('password'),
  });
  if (!parsed.success) {
    log.warn({ provider: 'password', outcome: 'invalid_input' }, 'login failed');
    return { error: t('auth.login.errorInvalidInput') };
  }

  // First-run account creation for the dev provider (same ADR 0055 gate as password login — never in
  // production). Registration necessarily reveals whether an email is taken; that is inherent to any
  // sign-up and acceptable on this dev-only surface. Same throttle as login, keyed identically.
  if (form.get('intent') === 'register') {
    if (!checkLoginRate(loginCallerKey(request), parsed.data.email)) {
      log.warn({ provider: 'password', outcome: 'rate_limited' }, 'registration throttled');
      return { error: t('auth.login.errorRateLimited') };
    }
    if (await findUserByEmail(db, parsed.data.email)) {
      log.warn({ provider: 'password', outcome: 'email_taken' }, 'registration failed');
      return { error: t('auth.login.errorEmailTaken') };
    }
    let user;
    try {
      user = await createUserWithPassword(db, parsed.data.email, parsed.data.password);
    } catch {
      // Lost a race with a concurrent registration on the email unique constraint — same outcome.
      log.warn({ provider: 'password', outcome: 'email_taken' }, 'registration failed');
      return { error: t('auth.login.errorEmailTaken') };
    }
    const token = generateSessionToken();
    const session = await createSession(db, token, user.id);
    log.info({ provider: 'password', userId: user.id }, 'registration succeeded');
    return redirect('/', {
      headers: { 'Set-Cookie': buildSessionCookie(token, session.expiresAt, isProd) },
    });
  }

  // Brute-force throttle: per source IP AND per account (normalized email). Applied before the
  // password check and keyed identically whether or not the account exists, so it caps guessing
  // without leaking account existence.
  if (!checkLoginRate(loginCallerKey(request), parsed.data.email)) {
    log.warn({ provider: 'password', outcome: 'rate_limited' }, 'login throttled');
    return { error: t('auth.login.errorRateLimited') };
  }

  const result = await authenticateWithPassword(db, parsed.data.email, parsed.data.password);
  if (!result) {
    log.warn({ provider: 'password', outcome: 'invalid_credentials' }, 'login failed');
    return { error: t('auth.login.errorBadCredentials') };
  }

  const token = generateSessionToken();
  const session = await createSession(db, token, result.userId);
  log.info({ provider: 'password', userId: result.userId }, 'login succeeded');
  return redirect('/', {
    headers: { 'Set-Cookie': buildSessionCookie(token, session.expiresAt, isProd) },
  });
}

export default function Login() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className="font-serif text-2xl tracking-tight">{t('auth.login.title')}</h1>

      {data.oidcConfigured && (
        <Form method="post">
          <input type="hidden" name="intent" value="oidc" />
          <SubmitButton className="border-input bg-background font-text w-full rounded-md border px-4 py-2 text-sm">
            {t('auth.login.bankid')}
          </SubmitButton>
        </Form>
      )}

      {data.devAuthEnabled && (
        <Form method="post" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="font-text text-sm">
              {t('auth.login.email')}
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
            <label htmlFor="password" className="font-text text-sm">
              {t('auth.login.password')}
            </label>
            {/* One field serves both login (primary; Enter submits it) and «Opprett konto», so
                current-password is a deliberate trade-off: a register click won't get a generated
                password from the manager. Accepted on this dev-only surface (ADR 0064). */}
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
          <SubmitButton className="bg-primary text-primary-foreground font-text rounded-md px-4 py-2 text-sm">
            {t('auth.login.submit')}
          </SubmitButton>
          {/* First-run path: the same fields register a new account (dev provider only, ADR 0055). */}
          <p id="register-hint" className="text-muted-foreground text-sm">
            {t('auth.login.registerHint')}
          </p>
          <SubmitButton
            name="intent"
            value="register"
            aria-describedby="register-hint"
            className="border-input bg-background font-text rounded-md border px-4 py-2 text-sm"
          >
            {t('auth.login.register')}
          </SubmitButton>
        </Form>
      )}
    </main>
  );
}
