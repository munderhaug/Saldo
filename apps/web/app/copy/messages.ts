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
  // Spelled-out unit for screen readers, so "kr" isn't read as the letters "k r".
  'common.currencyLong': 'kroner',

  // ── Home — the honest-number reveal ("what's actually yours", experience-principles §6) ──────
  'home.heading': 'Du er à jour',
  'home.subhead': 'Ingenting trenger oppmerksomheten din akkurat nå.',
  // No org yet → gentle onboarding nudge.
  'home.onboard.title': 'Velkommen',
  'home.onboard.body': 'La oss sette opp foretaket ditt, så kommer vi i gang.',
  'home.onboard.cta': 'Sett opp foretaket',
  // An org exists but the ledger has no posted activity yet — calm, honest, no fake number.
  'home.empty.title': 'Klar når du er det',
  'home.empty.body':
    'Så snart du registrerer inntekt, viser jeg her hva som faktisk er ditt å bruke.',
  // The reveal itself — permission/relief framing, never a tax warning.
  'home.reveal.heading': 'Hva som faktisk er ditt',
  'home.reveal.spendableLabel': 'Ditt å bruke',
  'home.reveal.spendableHelp': 'Dette kan du trygt ta ut i {year}.',
  'home.reveal.incomeLabel': 'Tatt inn i {year}',
  'home.reveal.vatLabel': 'MVA du holder av for staten',
  'home.reveal.taxLabel': 'Skatt, satt til side',
  'home.reveal.taxNote': 'Et forsiktig anslag, ikke en regning.',
  'home.reveal.overcommitted':
    'Du har holdt av mer enn du har tatt inn så langt. Det ordner seg når mer inntekt kommer inn.',
  'home.viewOrg': 'Se foretaket',
  'home.switchOrg': 'Bytt foretak',

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

  // ── Enhetsregisteret lookup — "find your business" ───────────────────────────
  'oppslag.title': 'Finn foretaket ditt',
  'oppslag.intro':
    'Søk på navn eller organisasjonsnummer, så henter jeg resten fra Enhetsregisteret.',
  'oppslag.label': 'Navn eller organisasjonsnummer',
  'oppslag.hint': 'For eksempel «Equinor» eller 923 609 016.',
  'oppslag.submit': 'Søk',
  'oppslag.matchesCount': 'Viser {shown} av {total} treff.',
  'oppslag.noMatches': 'Jeg fant ingen foretak som matcher «{query}».',
  'oppslag.notFound': 'Jeg fant ingen enhet med organisasjonsnummer {orgnr}.',
  'oppslag.invalidOrgNr':
    'Det ser ut som et organisasjonsnummer, men kontrollsifferet stemmer ikke. Sjekk tallene en gang til?',
  'oppslag.error':
    'Jeg fikk ikke kontakt med Enhetsregisteret akkurat nå. Prøv igjen om et øyeblikk.',
  'oppslag.tooShort': 'Skriv minst to tegn for å søke på navn.',
  // Detail card — field labels
  'oppslag.field.orgnr': 'Organisasjonsnummer',
  'oppslag.field.form': 'Organisasjonsform',
  'oppslag.field.address': 'Forretningsadresse',
  'oppslag.field.industry': 'Næringskode',
  'oppslag.field.vat': 'Merverdiavgift',
  'oppslag.vat.registered': 'Registrert i Merverdiavgiftsregisteret',
  'oppslag.vat.notRegistered': 'Ikke registrert i Merverdiavgiftsregisteret',
  'oppslag.vat.unknown': 'Ukjent',
  'oppslag.useThis': 'Bruk dette foretaket',
  // Search results — table columns
  'oppslag.col.name': 'Navn',
  'oppslag.col.orgnr': 'Org.nr',
  'oppslag.col.form': 'Form',
  'oppslag.col.place': 'Sted',
  // Heads-up status flags (sober tone — these matter for onboarding)
  'oppslag.status.konkurs': 'Dette foretaket er registrert konkurs.',
  'oppslag.status.avvikling': 'Dette foretaket er under avvikling.',
  'oppslag.status.tvangsavvikling':
    'Dette foretaket er under tvangsavvikling eller tvangsoppløsning.',
  'oppslag.status.slettet': 'Dette foretaket er slettet fra registeret.',

  // ── Org onboarding — selection ───────────────────────────────────────────────
  'orgs.title': 'Foretakene dine',
  'orgs.intro': 'Velg et foretak å jobbe med, eller legg til et nytt.',
  'orgs.create': 'Legg til foretak',
  'orgs.open': 'Åpne',
  'orgs.empty.body':
    'Du har ingen foretak enda. Vi finner ditt i Enhetsregisteret og setter opp resten.',
  'orgs.empty.cta': 'Finn foretaket ditt',
  'orgs.role.owner': 'Eier',
  'orgs.role.member': 'Medlem',

  // MVA-status — shown when choosing and when displaying. Plain language, no jargon wall.
  'orgs.mva.under_threshold.label': 'Ikke MVA-registrert',
  'orgs.mva.under_threshold.desc':
    'Du har ikke passert 50 000 kr i avgiftspliktig omsetning, så du legger ikke til MVA enda.',
  'orgs.mva.unntatt.label': 'Unntatt fra MVA',
  'orgs.mva.unntatt.desc':
    'Virksomheten er utenfor merverdiavgiftsloven — for eksempel helse, undervisning eller en del kunst og kultur.',
  'orgs.mva.registered_standard.label': 'MVA-registrert',
  'orgs.mva.registered_standard.desc': 'Du legger til MVA på salg og trekker fra MVA på kjøp.',
  'orgs.mva.registered_zero_rated.label': 'MVA-registrert med nullsats',
  'orgs.mva.registered_zero_rated.desc':
    'Du er registrert, men salget er fritatt (0 %) — for eksempel eksport.',

  // ── Org onboarding — create ──────────────────────────────────────────────────
  'orgs.new.title': 'Registrer foretaket',
  'orgs.new.intro': 'Når du oppretter foretaket, setter jeg opp kontoplan og MVA-koder for deg.',
  'orgs.new.orgNrLabel': 'Organisasjonsnummer',
  'orgs.new.orgNrHint': '9 siffer. For eksempel 923 609 016.',
  'orgs.new.nameLabel': 'Navn på foretaket',
  'orgs.new.mvaLegend': 'Avgiftsstatus',
  'orgs.new.mvaHint': 'Dette avgjør hvordan salg og kjøp bokføres. Velg det som stemmer for deg.',
  'orgs.new.submit': 'Opprett foretak',
  'orgs.new.prefilled': 'Hentet fra Enhetsregisteret. Sjekk at det stemmer.',
  'orgs.new.findCta': 'Søk i Enhetsregisteret i stedet',
  'orgs.new.errorInvalidInput': 'Sjekk organisasjonsnummer og navn.',
  'orgs.new.errorInvalidOrgNr':
    'Kontrollsifferet i organisasjonsnummeret stemmer ikke. Sjekk tallene en gang til?',
  'orgs.new.errorDuplicate': 'Dette foretaket er allerede registrert hos oss.',

  // ── Org onboarding — overview ────────────────────────────────────────────────
  'orgs.overview.ready': 'Klart. {accounts} kontoer og {codes} MVA-koder er på plass.',
  'orgs.overview.orgNrLabel': 'Organisasjonsnummer',
  'orgs.overview.mvaLabel': 'Avgiftsstatus',
  'orgs.overview.vatTitle': 'MVA-koder',
  'orgs.overview.vatCaption': '{count} MVA-koder fra SAF-T-standarden.',
  'orgs.overview.col.code': 'Kode',
  'orgs.overview.col.rate': 'Sats',
  'orgs.overview.col.direction': 'Retning',
  'orgs.direction.output': 'Utgående',
  'orgs.direction.input': 'Inngående',
  'orgs.direction.none': 'Ingen',
  'orgs.overview.back': 'Tilbake til foretakene',

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
  'common.currencyLong': 'kroner',

  'home.heading': "You're caught up",
  'home.subhead': 'Nothing needs your attention right now.',
  'home.onboard.title': 'Welcome',
  'home.onboard.body': "Let's set up your business, and we'll get going.",
  'home.onboard.cta': 'Set up your business',
  'home.empty.title': 'Ready when you are',
  'home.empty.body':
    "As soon as you record income, this is where I'll show what's actually yours to spend.",
  'home.reveal.heading': "What's actually yours",
  'home.reveal.spendableLabel': 'Yours to spend',
  'home.reveal.spendableHelp': 'You can safely take this out in {year}.',
  'home.reveal.incomeLabel': 'Taken in in {year}',
  'home.reveal.vatLabel': "VAT you're holding for the state",
  'home.reveal.taxLabel': 'Tax, set aside',
  'home.reveal.taxNote': 'A careful estimate, not a bill.',
  'home.reveal.overcommitted':
    "You've set aside more than you've taken in so far. It evens out as more income comes in.",
  'home.viewOrg': 'View business',
  'home.switchOrg': 'Switch business',

  'auth.login.title': 'Log in',
  'auth.login.submit': 'Log in',
  'auth.login.bankid': 'Continue with BankID',
  'auth.login.email': 'Email',
  'auth.login.password': 'Password',
  'auth.login.errorInvalidInput': 'Check your email and password.',
  'auth.login.errorBadCredentials': 'Wrong email or password.',
  'auth.login.oidcNotConfigured': 'BankID is not configured.',
  'auth.login.passwordDisabled': 'Password login is disabled.',

  'oppslag.title': 'Find your business',
  'oppslag.intro':
    "Search by name or organisation number, and I'll fetch the rest from the register.",
  'oppslag.label': 'Name or organisation number',
  'oppslag.hint': 'For example "Equinor" or 923 609 016.',
  'oppslag.submit': 'Search',
  'oppslag.matchesCount': 'Showing {shown} of {total} matches.',
  'oppslag.noMatches': 'I found no businesses matching "{query}".',
  'oppslag.notFound': 'I found no unit with organisation number {orgnr}.',
  'oppslag.invalidOrgNr':
    "That looks like an organisation number, but the check digit doesn't add up. Mind checking the digits again?",
  'oppslag.error': "I couldn't reach the register just now. Try again in a moment.",
  'oppslag.tooShort': 'Type at least two characters to search by name.',
  'oppslag.field.orgnr': 'Organisation number',
  'oppslag.field.form': 'Legal form',
  'oppslag.field.address': 'Business address',
  'oppslag.field.industry': 'Industry code',
  'oppslag.field.vat': 'Value-added tax',
  'oppslag.vat.registered': 'Registered in the VAT Register',
  'oppslag.vat.notRegistered': 'Not registered in the VAT Register',
  'oppslag.vat.unknown': 'Unknown',
  'oppslag.useThis': 'Use this business',
  'oppslag.col.name': 'Name',
  'oppslag.col.orgnr': 'Org. no.',
  'oppslag.col.form': 'Form',
  'oppslag.col.place': 'Location',
  'oppslag.status.konkurs': 'This business is registered as bankrupt.',
  'oppslag.status.avvikling': 'This business is being wound up.',
  'oppslag.status.tvangsavvikling': 'This business is under compulsory liquidation or dissolution.',
  'oppslag.status.slettet': 'This business has been deleted from the register.',

  'orgs.title': 'Your businesses',
  'orgs.intro': 'Pick a business to work on, or add a new one.',
  'orgs.create': 'Add a business',
  'orgs.open': 'Open',
  'orgs.empty.body':
    "You don't have any businesses yet. We'll find yours in the register and set up the rest.",
  'orgs.empty.cta': 'Find your business',
  'orgs.role.owner': 'Owner',
  'orgs.role.member': 'Member',

  'orgs.mva.under_threshold.label': 'Not VAT-registered',
  'orgs.mva.under_threshold.desc':
    "You haven't passed 50,000 kr in taxable turnover, so you don't add VAT yet.",
  'orgs.mva.unntatt.label': 'Exempt from VAT',
  'orgs.mva.unntatt.desc':
    'The activity is outside the VAT Act — for example health, teaching, or some arts and culture.',
  'orgs.mva.registered_standard.label': 'VAT-registered',
  'orgs.mva.registered_standard.desc': 'You add VAT on sales and deduct VAT on purchases.',
  'orgs.mva.registered_zero_rated.label': 'VAT-registered, zero-rated',
  'orgs.mva.registered_zero_rated.desc':
    'You are registered, but your sales are zero-rated (0 %) — for example export.',

  'orgs.new.title': 'Register your business',
  'orgs.new.intro':
    "When you create the business, I'll set up its chart of accounts and VAT codes.",
  'orgs.new.orgNrLabel': 'Organisation number',
  'orgs.new.orgNrHint': '9 digits. For example 923 609 016.',
  'orgs.new.nameLabel': 'Business name',
  'orgs.new.mvaLegend': 'VAT status',
  'orgs.new.mvaHint':
    'This decides how sales and purchases are booked. Pick the one that fits you.',
  'orgs.new.submit': 'Create business',
  'orgs.new.prefilled': 'Fetched from the register. Check that it looks right.',
  'orgs.new.findCta': 'Search the register instead',
  'orgs.new.errorInvalidInput': 'Check the organisation number and name.',
  'orgs.new.errorInvalidOrgNr':
    "The check digit in the organisation number doesn't add up. Mind checking again?",
  'orgs.new.errorDuplicate': 'This business is already registered with us.',

  'orgs.overview.ready': 'Done. {accounts} accounts and {codes} VAT codes are in place.',
  'orgs.overview.orgNrLabel': 'Organisation number',
  'orgs.overview.mvaLabel': 'VAT status',
  'orgs.overview.vatTitle': 'VAT codes',
  'orgs.overview.vatCaption': '{count} VAT codes from the SAF-T standard.',
  'orgs.overview.col.code': 'Code',
  'orgs.overview.col.rate': 'Rate',
  'orgs.overview.col.direction': 'Direction',
  'orgs.direction.output': 'Output',
  'orgs.direction.input': 'Input',
  'orgs.direction.none': 'None',
  'orgs.overview.back': 'Back to your businesses',

  'error.title': 'Something went wrong',
  'error.statusHeading': '{status} {statusText}',
  'error.requestFailed': 'The request could not be completed.',
  'error.unknown': 'An unknown error occurred.',
} satisfies Record<MessageKey, string>;
