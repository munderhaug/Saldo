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
  // Reach the first posting surface from home — from the reveal and from the calm empty state.
  'home.recordCta': 'Registrer inntekt eller utgift',
  'home.readReceiptCta': 'Les av en kvittering',
  'home.empty.cta': 'Registrer din første inntekt',
  'home.navLabel': 'Snarveier',

  // ── Manual voucher entry — record income/expense (the first posting surface) ──────────────────
  // A §5.5 money-touching act: plain, sober copy throughout — no jokes, no flourish.
  'vouchers.new.title': 'Registrer en føring',
  'vouchers.new.intro': 'Før opp en inntekt eller en utgift. Den blir bokført med en gang.',
  'vouchers.new.kindLegend': 'Hva gjelder det?',
  'vouchers.new.kind.income.label': 'Inntekt',
  'vouchers.new.kind.income.desc': 'Penger du har tatt inn — et salg eller et oppdrag.',
  'vouchers.new.kind.expense.label': 'Utgift',
  'vouchers.new.kind.expense.desc': 'Penger du har brukt — et kjøp eller en kostnad.',
  'vouchers.new.amountLabel': 'Beløp',
  'vouchers.new.amountHintRegistered': 'I kroner, uten merverdiavgift. Jeg legger til MVA for deg.',
  'vouchers.new.amountHintPlain': 'I kroner.',
  // Append-only ledger, stated calmly: a posting is corrected with a ny føring, never edited away.
  'vouchers.new.confirmNote':
    'Når du bokfører, blir føringen stående. Trenger du å rette den, gjør du det med en ny føring.',
  'vouchers.new.submit': 'Bokfør',
  'vouchers.new.cancel': 'Avbryt',
  'vouchers.new.errorInvalidInput': 'Sjekk beløpet og hva føringen gjelder.',
  'vouchers.new.errorVatNotRegistered':
    'Denne MVA-behandlingen krever at foretaket er registrert i Merverdiavgiftsregisteret.',
  'vouchers.new.errorGeneric': 'Jeg fikk ikke bokført føringen. Prøv igjen om et øyeblikk.',

  // ── Receipt extraction — AI proposes a voucher from an image (first AI surface, ADR 0035) ──────
  'receipts.new.title': 'Les av en kvittering',
  'receipts.new.intro': 'Last opp et bilde, så foreslår jeg en føring du kan se over.',
  'receipts.new.uploadLabel': 'Bilde av kvitteringen',
  'receipts.new.uploadHint': 'JPG eller PNG, maks 10 MB.',
  'receipts.new.submit': 'Les av kvitteringen',
  // The AI surface is off (no backend configured) — point calmly to the manual path.
  'receipts.new.unavailable':
    'Avlesning av kvitteringer er ikke slått på her ennå. Du kan føre den opp manuelt i stedet.',
  'receipts.new.unavailableCta': 'Før opp manuelt',
  // ── Review the proposal (Art. 50(1): disclose AI at the first interaction) ──
  'receipts.new.reviewHeading': 'Forslag fra kvitteringen',
  'receipts.new.aiAssisted': 'AI-assistert',
  // The first-interaction disclosure — plain, the user stays in charge (experience-voice §5.5).
  'receipts.new.aiDisclosure':
    'Dette forslaget er laget av AI ut fra bildet. Se det over — du bestemmer hva som blir bokført.',
  'receipts.new.aiProvenance': 'Foreslått av {model}. Anslått sikkerhet {confidence}.',
  'receipts.new.fieldSupplier': 'Leverandør',
  'receipts.new.fieldDate': 'Dato',
  'receipts.new.fieldNet': 'Beløp uten mva',
  'receipts.new.fieldVat': 'Mva på kvitteringen',
  'receipts.new.supplierUnknown': 'Fant ikke navnet',
  'receipts.new.dateUnknown': 'Fant ikke datoen',
  // Calm heads-up when the document VAT isn't a plain 25 % — the system owns the doubt, not the user.
  'receipts.new.vatHeadsUp': 'Mva-en ser ikke ut som vanlige 25 %. Sjekk beløpet før du bokfører.',
  'receipts.new.confirmIntro': 'Stemmer ikke typen eller beløpet? Endre det før du bokfører.',
  'receipts.new.confirmSubmit': 'Bekreft og bokfør',
  'receipts.new.startOver': 'Prøv et annet bilde',
  // ── Errors — the system owns the fault, every time ──
  'receipts.new.errorNoImage': 'Last opp et bilde av kvitteringen (JPG eller PNG).',
  'receipts.new.errorImageType': 'Det ser ikke ut som et bilde. Last opp en JPG eller PNG.',
  'receipts.new.errorImageTooLarge': 'Bildet er for stort. Maks 10 MB.',
  'receipts.new.errorRead':
    'Jeg klarte ikke å lese kvitteringen. Prøv et tydeligere bilde, eller før den opp manuelt.',
  'receipts.new.errorCurrency':
    'Kvitteringen er ikke i kroner. Den kan jeg ikke føre automatisk ennå — før den opp manuelt.',
  'receipts.new.errorAmount':
    'Jeg fant ikke et tydelig beløp på kvitteringen. Før den opp manuelt, så er du trygg.',

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
  'home.recordCta': 'Record income or an expense',
  'home.readReceiptCta': 'Read a receipt',
  'home.empty.cta': 'Record your first income',
  'home.navLabel': 'Shortcuts',

  'vouchers.new.title': 'Record an entry',
  'vouchers.new.intro': "Record income or an expense. It's booked right away.",
  'vouchers.new.kindLegend': 'What is it?',
  'vouchers.new.kind.income.label': 'Income',
  'vouchers.new.kind.income.desc': "Money you've taken in — a sale or a job.",
  'vouchers.new.kind.expense.label': 'Expense',
  'vouchers.new.kind.expense.desc': "Money you've spent — a purchase or a cost.",
  'vouchers.new.amountLabel': 'Amount',
  'vouchers.new.amountHintRegistered': "In kroner, excluding VAT. I'll add VAT for you.",
  'vouchers.new.amountHintPlain': 'In kroner.',
  'vouchers.new.confirmNote':
    'Once you book it, the entry stands. If you need to correct it, you do so with a new entry.',
  'vouchers.new.submit': 'Book it',
  'vouchers.new.cancel': 'Cancel',
  'vouchers.new.errorInvalidInput': 'Check the amount and what the entry is for.',
  'vouchers.new.errorVatNotRegistered':
    'This VAT treatment requires the business to be in the VAT Register.',
  'vouchers.new.errorGeneric': "I couldn't book the entry. Try again in a moment.",

  // ── Receipt extraction (reference) ──
  'receipts.new.title': 'Read a receipt',
  'receipts.new.intro': "Upload a photo and I'll suggest an entry for you to review.",
  'receipts.new.uploadLabel': 'Photo of the receipt',
  'receipts.new.uploadHint': 'JPG or PNG, max 10 MB.',
  'receipts.new.submit': 'Read the receipt',
  'receipts.new.unavailable':
    "Reading receipts isn't switched on here yet. You can record it manually instead.",
  'receipts.new.unavailableCta': 'Record manually',
  'receipts.new.reviewHeading': 'Suggestion from the receipt',
  'receipts.new.aiAssisted': 'AI-assisted',
  'receipts.new.aiDisclosure':
    'This suggestion was made by AI from the image. Review it — you decide what gets booked.',
  'receipts.new.aiProvenance': 'Suggested by {model}. Estimated confidence {confidence}.',
  'receipts.new.fieldSupplier': 'Supplier',
  'receipts.new.fieldDate': 'Date',
  'receipts.new.fieldNet': 'Amount excl. VAT',
  'receipts.new.fieldVat': 'VAT on the receipt',
  'receipts.new.supplierUnknown': "Couldn't read the name",
  'receipts.new.dateUnknown': "Couldn't read the date",
  'receipts.new.vatHeadsUp':
    "The VAT doesn't look like a plain 25 %. Check the amount before you book it.",
  'receipts.new.confirmIntro': 'Type or amount not right? Change it before you book it.',
  'receipts.new.confirmSubmit': 'Confirm and book',
  'receipts.new.startOver': 'Try another photo',
  'receipts.new.errorNoImage': 'Upload a photo of the receipt (JPG or PNG).',
  'receipts.new.errorImageType': "That doesn't look like an image. Upload a JPG or PNG.",
  'receipts.new.errorImageTooLarge': 'The image is too large. Max 10 MB.',
  'receipts.new.errorRead':
    "I couldn't read the receipt. Try a clearer photo, or record it manually.",
  'receipts.new.errorCurrency':
    "The receipt isn't in kroner. I can't book that automatically yet — record it manually.",
  'receipts.new.errorAmount':
    "I couldn't find a clear amount on the receipt. Record it manually to be safe.",

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
