/**
 * POST /companion — persist the companion on/off preference (ADR 0058: dismissible, and once
 * dismissed it stays away until the user brings it back). The dismiss control is a plain `<form>`
 * (CompanionGuide) and the settings page posts the same shape, so the preference works without JS.
 * No auth: the cookie is a presentation preference carrying no personal or financial data, and the
 * same-origin guard keeps a cross-site page from toggling it.
 */
import { redirect } from 'react-router';
import type { Route } from './+types/companion';
import { assertSameOrigin } from '~/auth/auth.server';
import { buildCompanionCookie } from '~/lib/companion-preference.server';
import { isProd } from '~/env';

/** Same-app path or bust: a posted redirect target must never leave Saldo (no `//host` tricks). */
function safeRedirect(target: FormDataEntryValue | null): string {
  return typeof target === 'string' && target.startsWith('/') && !target.startsWith('//')
    ? target
    : '/';
}

export async function action({ request }: Route.ActionArgs) {
  assertSameOrigin(request);
  const form = await request.formData();
  const enabled = form.get('companion') !== 'off';
  return redirect(safeRedirect(form.get('redirectTo')), {
    headers: { 'Set-Cookie': buildCompanionCookie(enabled, isProd) },
  });
}

// Preference is POST-only; a stray GET just goes home.
export function loader() {
  throw redirect('/');
}
