/**
 * Microcopy catalog — the single source of truth for user-facing strings (ADR 0024).
 *
 * `nb` (Bokmål) is the SHIPPED copy, written as original work: Saldo speaks Norwegian first
 * (docs/experience-principles.md §8, .claude/rules/experience-voice.md). `en` is a REFERENCE only —
 * never selected at runtime — kept so each key's intent stays legible to English-reasoning
 * maintainers. `en` is pinned to `nb`'s exact key set by `satisfies` (a missing/extra key is a
 * compile error) and to its `{placeholder}` set by a parity test (./copy.test.ts). There is no
 * runtime locale switch: Saldo is single-locale by design (ADR 0024).
 *
 * Keys are dotted and grouped by surface. Placeholders are `{name}` and are filled by `t()`
 * (./index). Money/number formatting stays in @saldo/domain (`formatKr`) — never here; a figure is
 * formatted there and passed in, so this catalog holds only words.
 */
export const nb = {
  // ── Brand ──────────────────────────────────────────────────────────────────
  'app.name': 'Saldo',
  'app.tagline': 'Regnskap og fakturering for små norske enkeltpersonforetak.',

  // Currency unit shown after a `formatKr()` figure (the figure itself comes from @saldo/domain).
  'common.currency': 'kr',

  // ── Home (the domain-core demo surface) ──────────────────────────────────────
  'home.demo.title': 'Domenekjernen kjører',
  // descPre + <code>@saldo/domain</code> + descPost form one sentence around an inline code token.
  'home.demo.descPre': 'Den rene',
  'home.demo.descPost':
    '-kjernen beregner 25 % MVA på 100,00 kr — identisk i nettleseren og på serveren.',
  'home.demo.caption': 'Beløp i kroner, øre-presist (tabulære tall).',
  'home.demo.colItem': 'Post',
  'home.demo.colAmount': 'Beløp',
  'home.demo.netto': 'Netto',
  'home.demo.vat': 'MVA (25 %)',
  'home.demo.brutto': 'Brutto',
  // nextPre + <code>docs/…</code> + nextPost, same inline-code pattern.
  'home.next.pre': 'Neste steg: Fase 0 (se',
  'home.next.post': '§16).',

  // ── Auth — log in ────────────────────────────────────────────────────────────
  'auth.login.title': 'Logg inn',
  'auth.login.submit': 'Logg inn',
  'auth.login.bankid': 'Fortsett med BankID',
  'auth.login.email': 'E-post',
  'auth.login.password': 'Passord',
  'auth.login.errorInvalidInput': 'Sjekk e-post og passord.',
  'auth.login.errorBadCredentials': 'Feil e-post eller passord.',
  'auth.login.oidcNotConfigured': 'BankID er ikke konfigurert.',
  'auth.login.passwordDisabled': 'Passordpålogging er slått av.',

  // ── Errors (root error boundary) ─────────────────────────────────────────────
  'error.title': 'Noe gikk galt',
  'error.statusHeading': '{status} {statusText}',
  'error.requestFailed': 'Forespørselen kunne ikke fullføres.',
  'error.unknown': 'En ukjent feil oppstod.',
} as const;

export type Messages = typeof nb;
export type MessageKey = keyof Messages;

/**
 * English REFERENCE copy — not shipped, not runtime-selectable (ADR 0024). `satisfies` pins it to
 * `nb`'s exact key set; the parity test pins the `{placeholder}` set. Keep it a faithful gloss of
 * intent, not a literal back-translation of the Norwegian.
 */
export const en = {
  'app.name': 'Saldo',
  'app.tagline': 'Accounting and invoicing for small Norwegian sole proprietorships.',

  'common.currency': 'kr',

  'home.demo.title': 'The domain core is running',
  'home.demo.descPre': 'The pure',
  'home.demo.descPost':
    ' core computes 25 % VAT on 100.00 kr — identically in the browser and on the server.',
  'home.demo.caption': 'Amounts in kroner, øre-precise (tabular figures).',
  'home.demo.colItem': 'Item',
  'home.demo.colAmount': 'Amount',
  'home.demo.netto': 'Net',
  'home.demo.vat': 'VAT (25 %)',
  'home.demo.brutto': 'Gross',
  'home.next.pre': 'Next: Phase 0 (see',
  'home.next.post': '§16).',

  'auth.login.title': 'Log in',
  'auth.login.submit': 'Log in',
  'auth.login.bankid': 'Continue with BankID',
  'auth.login.email': 'Email',
  'auth.login.password': 'Password',
  'auth.login.errorInvalidInput': 'Check your email and password.',
  'auth.login.errorBadCredentials': 'Wrong email or password.',
  'auth.login.oidcNotConfigured': 'BankID is not configured.',
  'auth.login.passwordDisabled': 'Password login is disabled.',

  'error.title': 'Something went wrong',
  'error.statusHeading': '{status} {statusText}',
  'error.requestFailed': 'The request could not be completed.',
  'error.unknown': 'An unknown error occurred.',
} satisfies Record<MessageKey, string>;
