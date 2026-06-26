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

  // ── AI transparency (shared) — the EU AI Act Art. 50 disclosure treatment for EVERY AI surface ──
  // The machine-readable "AI-assisted" label (Art. 50(2)); rendered by the shared <AiAssisted>
  // primitive so every current and future AI surface labels its proposals identically (ADR 0036).
  'ai.assistedLabel': 'AI-assistert',

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
  'orgs.overview.registersTitle': 'Registre',
  'orgs.overview.back': 'Tilbake til foretakene',

  // ── Contacts register (customers & suppliers, §8.2) ──────────────────────────
  'contacts.title': 'Kontakter',
  'contacts.intro': 'Kundene og leverandørene dine, samlet på ett sted.',
  'contacts.new': 'Ny kontakt',
  'contacts.empty.body':
    'Du har ingen kontakter enda. Legg til den første, så fyller jeg inn fra Enhetsregisteret.',
  'contacts.open': 'Åpne',
  'contacts.listCaption': '{count} kontakter.',
  'contacts.back': 'Tilbake til foretaket',
  'contacts.col.name': 'Navn',
  'contacts.col.role': 'Rolle',
  'contacts.col.orgnr': 'Org.nr',
  'contacts.col.mva': 'Avgiftsstatus',
  'contacts.col.place': 'Sted',
  'contacts.role.customer': 'Kunde',
  'contacts.role.supplier': 'Leverandør',
  'contacts.role.both': 'Kunde og leverandør',
  'contacts.language.nb': 'Norsk',
  'contacts.language.en': 'Engelsk',

  // Contact form (create + edit share these).
  'contacts.form.newTitle': 'Ny kontakt',
  'contacts.form.editTitle': 'Rediger kontakt',
  'contacts.form.intro':
    'Har kontakten et organisasjonsnummer, henter jeg navn og adresse for deg.',
  'contacts.form.nameLabel': 'Navn',
  'contacts.form.roleLegend': 'Rolle',
  'contacts.form.roleHint': 'Velg om du selger til, kjøper av, eller begge deler.',
  'contacts.form.orgNrLabel': 'Organisasjonsnummer',
  'contacts.form.orgNrHint': 'Valgfritt. 9 siffer for et registrert foretak.',
  'contacts.form.emailLabel': 'E-post',
  'contacts.form.phoneLabel': 'Telefon',
  'contacts.form.addressLegend': 'Adresse',
  'contacts.form.addressLineLabel': 'Gateadresse',
  'contacts.form.postalCodeLabel': 'Postnummer',
  'contacts.form.cityLabel': 'Poststed',
  'contacts.form.countryCodeLabel': 'Landkode',
  'contacts.form.mvaLegend': 'Avgiftsstatus',
  'contacts.form.mvaHint':
    'Avgjør blant annet hvordan kjøp fra kontakten behandles. Velg det som stemmer.',
  'contacts.form.defaultsLegend': 'Standardverdier',
  'contacts.form.defaultsHint': 'Forhåndsutfylles på salg og kjøp senere. Alt er valgfritt.',
  'contacts.form.paymentTermsLabel': 'Betalingsfrist (dager)',
  'contacts.form.defaultAccountLabel': 'Standardkonto',
  'contacts.form.defaultVatCodeLabel': 'Standard MVA-kode',
  'contacts.form.noneOption': 'Ingen',
  'contacts.form.currencyLabel': 'Valuta',
  'contacts.form.languageLabel': 'Språk',
  'contacts.form.notesLabel': 'Notater',
  'contacts.form.submitCreate': 'Opprett kontakt',
  'contacts.form.submitSave': 'Lagre endringer',
  'contacts.form.findCta': 'Søk i Enhetsregisteret',
  'contacts.form.prefilled': 'Hentet fra Enhetsregisteret. Sjekk at det stemmer.',
  'contacts.form.errorInvalidInput': 'Sjekk feltene og prøv igjen.',
  'contacts.form.errorInvalidOrgNr':
    'Kontrollsifferet i organisasjonsnummeret stemmer ikke. Sjekk tallene en gang til?',

  // ── Products & services catalogue (§8.3) ─────────────────────────────────────
  'products.title': 'Varer og tjenester',
  'products.intro': 'Det du selger, klart til å legges på en faktura.',
  'products.new': 'Ny vare eller tjeneste',
  'products.empty.body':
    'Du har ingen varer eller tjenester enda. Legg til den første, så går faktureringen kjappere.',
  'products.listCaption': '{count} varer og tjenester.',
  'products.back': 'Tilbake til foretaket',
  'products.col.name': 'Navn',
  'products.col.kind': 'Type',
  'products.col.unit': 'Enhet',
  'products.col.price': 'Pris',
  'products.kind.goods': 'Vare',
  'products.kind.service': 'Tjeneste',

  // Product form (create + edit share these).
  'products.form.newTitle': 'Ny vare eller tjeneste',
  'products.form.editTitle': 'Rediger vare eller tjeneste',
  'products.form.intro': 'Sett en standardkonto og MVA-kode, så fylles fakturalinjen ut for deg.',
  'products.form.nameLabel': 'Navn',
  'products.form.descriptionLabel': 'Beskrivelse',
  'products.form.descriptionHint': 'Valgfritt. Teksten som havner på fakturalinjen.',
  'products.form.kindLegend': 'Type',
  'products.form.kindHint': 'Er dette en vare du leverer, eller en tjeneste du utfører?',
  'products.form.unitLabel': 'Enhet',
  'products.form.unitHint': 'For eksempel «stk», «time» eller «kg».',
  'products.form.priceLabel': 'Pris uten mva',
  'products.form.priceHint': 'Per enhet, i kroner. La stå tom for 0.',
  'products.form.priceInclVat': '{amount} kr inkl. mva',
  'products.form.defaultsLegend': 'Standardverdier',
  'products.form.defaultsHint': 'Forhåndsutfylles på fakturalinjen senere. Alt er valgfritt.',
  'products.form.defaultAccountLabel': 'Standardkonto',
  'products.form.defaultVatCodeLabel': 'Standard MVA-kode',
  'products.form.noneOption': 'Ingen',
  'products.form.submitCreate': 'Opprett',
  'products.form.submitSave': 'Lagre endringer',
  'products.form.errorInvalidInput': 'Sjekk feltene og prøv igjen.',

  // ── Sales documents — tilbud, fakturaer, kreditnotaer (build-spec §8.4) ──────────────────────────
  'invoices.title': 'Salg og fakturaer',
  'invoices.intro': 'Tilbud, fakturaer og kreditnotaer — alt salget ditt på ett sted.',
  'invoices.new': 'Ny faktura',
  'invoices.back': 'Tilbake til foretaket',
  'invoices.empty.body': 'Du har ingen salgsdokumenter enda. Lag det første.',
  'invoices.listCaption': '{count} salgsdokumenter.',
  'invoices.col.number': 'Nr.',
  'invoices.col.kind': 'Type',
  'invoices.col.customer': 'Kunde',
  'invoices.col.status': 'Status',
  'invoices.col.issued': 'Utstedt',
  'invoices.col.due': 'Forfall',
  'invoices.col.total': 'Sum',
  'invoices.kind.quote': 'Tilbud',
  'invoices.kind.invoice': 'Faktura',
  'invoices.kind.credit_note': 'Kreditnota',
  'invoices.status.draft': 'Utkast',
  'invoices.status.issued': 'Utstedt',
  'invoices.status.sent': 'Sendt',
  'invoices.status.viewed': 'Sett',
  'invoices.status.paid': 'Betalt',
  'invoices.status.overdue': 'Forfalt',

  // Dokumentskjema (opprett + rediger deler disse).
  'invoices.form.newTitle': 'Ny faktura',
  'invoices.form.editTitle': 'Rediger utkast',
  'invoices.form.intro': 'Fyll ut kunden og linjene. Du kan lagre som utkast og utstede senere.',
  'invoices.form.kindLegend': 'Type dokument',
  'invoices.form.customerLegend': 'Kunde',
  'invoices.form.customerPicker': 'Hent fra kontakter',
  'invoices.form.customerPickerHint':
    'Velg en kunde for å forhåndsutfylle navn og betingelser. Valgfritt.',
  'invoices.form.customerName': 'Kundenavn',
  'invoices.form.customerEmail': 'E-post',
  'invoices.form.customerOrgNr': 'Organisasjonsnummer',
  'invoices.form.customerAddress': 'Adresse',
  'invoices.form.currency': 'Valuta',
  'invoices.form.language': 'Språk',
  'invoices.form.issueDate': 'Fakturadato',
  'invoices.form.dueDate': 'Forfallsdato',
  'invoices.form.notes': 'Notat',
  'invoices.form.notesHint': 'Valgfri tekst på dokumentet.',
  'invoices.form.linesLegend': 'Linjer',
  'invoices.form.addLine': 'Legg til linje',
  'invoices.form.removeLine': 'Fjern linje',
  'invoices.form.line.product': 'Hent fra katalog',
  'invoices.form.line.description': 'Beskrivelse',
  'invoices.form.line.quantity': 'Antall',
  'invoices.form.line.unit': 'Enhet',
  'invoices.form.line.price': 'Pris uten mva',
  'invoices.form.line.account': 'Konto',
  'invoices.form.line.vat': 'MVA-kode',
  'invoices.form.noneOption': 'Ingen',
  'invoices.form.chooseOption': 'Velg …',
  'invoices.form.totalsNet': 'Netto',
  'invoices.form.totalsVat': 'Merverdiavgift',
  'invoices.form.totalsGross': 'Sum å betale',
  'invoices.form.submitCreate': 'Lagre utkast',
  'invoices.form.submitSave': 'Lagre endringer',
  'invoices.form.errorInvalidInput': 'Sjekk feltene og prøv igjen.',
  'invoices.form.unregisteredWarning':
    'Foretaket er ikke MVA-registrert, så du kan ikke fakturere med utgående mva. Velg en MVA-kode uten avgift.',
  // Linjevise MVA-blokkeringer (server-autoritativt; vist som en skjemafeil).
  'invoices.error.output-vat-requires-registration':
    'Du kan ikke legge utgående mva på en linje før foretaket er MVA-registrert.',
  'invoices.error.zero-rated-requires-registration':
    'Fritak for mva krever at foretaket er MVA-registrert.',
  'invoices.error.input-deduction-requires-registration':
    'Fradrag for inngående mva krever at foretaket er MVA-registrert.',
  'invoices.error.input-code-not-a-sale':
    'Denne MVA-koden er for kjøp, ikke salg. Velg en salgskode.',
  'invoices.error.reverse-charge-not-a-sale':
    'Denne MVA-koden gjelder kjøp med snudd avregning (du regner ut mva selv), ikke salg. Velg en salgskode.',
  'invoices.error.unknown-vat-code': 'Ukjent MVA-kode på en linje.',
  'invoices.error.notADraft':
    'Bare utkast kan endres. Et utstedt dokument rettes med en kreditnota.',
  'invoices.error.creditNote': 'Kunne ikke lage kreditnota for dette dokumentet.',

  // Detaljvisning + livsløpshandlinger. Nøktern tone for de konsekvensrike handlingene (§5.5).
  'invoices.detail.edit': 'Rediger',
  'invoices.detail.kid': 'KID',
  'invoices.detail.creditsInvoice': 'Kreditnota for faktura {number}',
  'invoices.detail.lineHeaderDescription': 'Beskrivelse',
  'invoices.detail.lineHeaderQuantity': 'Antall',
  'invoices.detail.lineHeaderPrice': 'Pris',
  'invoices.detail.lineHeaderVat': 'Mva',
  'invoices.detail.lineHeaderNet': 'Netto',
  'invoices.detail.issue': 'Utsted',
  'invoices.detail.issueNote':
    'Når du utsteder, får dokumentet et fakturanummer og blir stående. Trenger du å rette det, lager du en kreditnota.',
  'invoices.detail.posted': 'Bokført i regnskapet.',
  'invoices.detail.markSent': 'Marker som sendt',
  'invoices.detail.markPaid': 'Marker som betalt',
  'invoices.detail.createCreditNote': 'Lag kreditnota',
  'invoices.detail.customerHeading': 'Kunde',
  'invoices.detail.totalsHeading': 'Beløp',
  'invoices.detail.actionsLabel': 'Handlinger',
  'invoices.detail.linesCaption': 'Linjene på dokumentet.',

  // ── Invoice PDF document + delivery (feat-invoice-pdf-email) ─────────────────
  'invoices.pdf.invoiceTitle': 'Faktura',
  'invoices.pdf.creditNoteTitle': 'Kreditnota',
  'invoices.pdf.sellerHeading': 'Selger',
  'invoices.pdf.customerHeading': 'Kunde',
  'invoices.pdf.orgNr': 'Org.nr',
  'invoices.pdf.invoiceNo': 'Fakturanummer',
  'invoices.pdf.issueDate': 'Fakturadato',
  'invoices.pdf.dueDate': 'Forfallsdato',
  'invoices.pdf.kid': 'KID',
  'invoices.pdf.lineDescription': 'Beskrivelse',
  'invoices.pdf.lineQuantity': 'Antall',
  'invoices.pdf.lineUnitPrice': 'Pris',
  'invoices.pdf.lineVat': 'Mva',
  'invoices.pdf.lineNet': 'Netto',
  'invoices.pdf.vatBasisHeading': 'MVA-grunnlag',
  'invoices.pdf.vatBasisRate': 'Sats',
  'invoices.pdf.vatBasisBase': 'Grunnlag',
  'invoices.pdf.vatBasisVat': 'Merverdiavgift',
  'invoices.pdf.totalNet': 'Netto',
  'invoices.pdf.totalVat': 'Merverdiavgift',
  'invoices.pdf.totalGross': 'Å betale',
  'invoices.pdf.generatedNote': 'Dokumentet er laget i Saldo.',
  // Delivery — a §5.5 act, so the voice here is plain and sober.
  'invoices.detail.downloadPdf': 'Last ned PDF',
  'invoices.detail.downloadEhf': 'Last ned EHF (e-faktura)',
  'invoices.detail.deliveryHeading': 'Send',
  'invoices.detail.send': 'Send på e-post',
  'invoices.detail.sendBody': 'Sender fakturaen som PDF til {email} og markerer den som sendt.',
  'invoices.detail.sendNoEmail': 'Legg til en e-postadresse på kunden for å sende fakturaen.',
  'invoices.detail.sendNotConfigured':
    'E-post er ikke satt opp ennå. Du kan laste ned PDF-en og sende den selv.',
  'invoices.detail.sendOk': 'Sendt til {email}.',
  'invoices.detail.sendError':
    'Jeg fikk ikke sendt e-posten. Prøv igjen, eller last ned PDF-en og send den selv.',
  // The customer-facing email (sent to the buyer).
  'invoices.email.subjectInvoice': 'Faktura {number} fra {seller}',
  'invoices.email.subjectCreditNote': 'Kreditnota {number} fra {seller}',
  'invoices.email.body':
    'Hei!\n\nVedlagt finner du dokumentet som PDF. Ta kontakt om noe er uklart.\n\nVennlig hilsen\n{seller}',

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

  // ── AI transparency (shared, reference) ──
  'ai.assistedLabel': 'AI-assisted',

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
  'orgs.overview.registersTitle': 'Registers',
  'orgs.overview.back': 'Back to your businesses',

  // ── Contacts register (customers & suppliers, §8.2) ──────────────────────────
  'contacts.title': 'Contacts',
  'contacts.intro': 'Your customers and suppliers, all in one place.',
  'contacts.new': 'New contact',
  'contacts.empty.body':
    "You have no contacts yet. Add your first and I'll fill in from the register.",
  'contacts.open': 'Open',
  'contacts.listCaption': '{count} contacts.',
  'contacts.back': 'Back to the business',
  'contacts.col.name': 'Name',
  'contacts.col.role': 'Role',
  'contacts.col.orgnr': 'Org. no.',
  'contacts.col.mva': 'VAT status',
  'contacts.col.place': 'Place',
  'contacts.role.customer': 'Customer',
  'contacts.role.supplier': 'Supplier',
  'contacts.role.both': 'Customer and supplier',
  'contacts.language.nb': 'Norwegian',
  'contacts.language.en': 'English',

  // Contact form (create + edit share these).
  'contacts.form.newTitle': 'New contact',
  'contacts.form.editTitle': 'Edit contact',
  'contacts.form.intro':
    "If the contact has an organisation number, I'll fetch the name and address.",
  'contacts.form.nameLabel': 'Name',
  'contacts.form.roleLegend': 'Role',
  'contacts.form.roleHint': 'Choose whether you sell to, buy from, or both.',
  'contacts.form.orgNrLabel': 'Organisation number',
  'contacts.form.orgNrHint': 'Optional. 9 digits for a registered business.',
  'contacts.form.emailLabel': 'Email',
  'contacts.form.phoneLabel': 'Phone',
  'contacts.form.addressLegend': 'Address',
  'contacts.form.addressLineLabel': 'Street address',
  'contacts.form.postalCodeLabel': 'Postal code',
  'contacts.form.cityLabel': 'City',
  'contacts.form.countryCodeLabel': 'Country code',
  'contacts.form.mvaLegend': 'VAT status',
  'contacts.form.mvaHint':
    'Among other things, decides how purchases from this contact are handled.',
  'contacts.form.defaultsLegend': 'Defaults',
  'contacts.form.defaultsHint': 'Prefilled on sales and purchases later. All optional.',
  'contacts.form.paymentTermsLabel': 'Payment terms (days)',
  'contacts.form.defaultAccountLabel': 'Default account',
  'contacts.form.defaultVatCodeLabel': 'Default VAT code',
  'contacts.form.noneOption': 'None',
  'contacts.form.currencyLabel': 'Currency',
  'contacts.form.languageLabel': 'Language',
  'contacts.form.notesLabel': 'Notes',
  'contacts.form.submitCreate': 'Create contact',
  'contacts.form.submitSave': 'Save changes',
  'contacts.form.findCta': 'Search the register',
  'contacts.form.prefilled': 'Fetched from the register. Check that it looks right.',
  'contacts.form.errorInvalidInput': 'Check the fields and try again.',
  'contacts.form.errorInvalidOrgNr':
    "The check digit in the organisation number doesn't add up. Mind checking again?",

  // ── Products & services catalogue (§8.3) ─────────────────────────────────────
  'products.title': 'Products & services',
  'products.intro': 'What you sell, ready to drop onto an invoice.',
  'products.new': 'New product or service',
  'products.empty.body':
    'You have no products or services yet. Add the first one and invoicing gets quicker.',
  'products.listCaption': '{count} products and services.',
  'products.back': 'Back to the business',
  'products.col.name': 'Name',
  'products.col.kind': 'Type',
  'products.col.unit': 'Unit',
  'products.col.price': 'Price',
  'products.kind.goods': 'Goods',
  'products.kind.service': 'Service',

  // Product form (create + edit share these).
  'products.form.newTitle': 'New product or service',
  'products.form.editTitle': 'Edit product or service',
  'products.form.intro':
    'Set a default account and VAT code, and the invoice line fills itself in.',
  'products.form.nameLabel': 'Name',
  'products.form.descriptionLabel': 'Description',
  'products.form.descriptionHint': 'Optional. The text that lands on the invoice line.',
  'products.form.kindLegend': 'Type',
  'products.form.kindHint': 'Is this goods you deliver, or a service you perform?',
  'products.form.unitLabel': 'Unit',
  'products.form.unitHint': 'For example “pcs”, “hour” or “kg”.',
  'products.form.priceLabel': 'Price excl. VAT',
  'products.form.priceHint': 'Per unit, in kroner. Leave blank for 0.',
  'products.form.priceInclVat': '{amount} kr incl. VAT',
  'products.form.defaultsLegend': 'Defaults',
  'products.form.defaultsHint': 'Prefilled on the invoice line later. All optional.',
  'products.form.defaultAccountLabel': 'Default account',
  'products.form.defaultVatCodeLabel': 'Default VAT code',
  'products.form.noneOption': 'None',
  'products.form.submitCreate': 'Create',
  'products.form.submitSave': 'Save changes',
  'products.form.errorInvalidInput': 'Check the fields and try again.',

  // ── Sales documents — quotes, invoices, credit notes (build-spec §8.4) ──
  'invoices.title': 'Sales & invoices',
  'invoices.intro': 'Quotes, invoices and credit notes — all your sales in one place.',
  'invoices.new': 'New invoice',
  'invoices.back': 'Back to the business',
  'invoices.empty.body': 'You have no sales documents yet. Create the first one.',
  'invoices.listCaption': '{count} sales documents.',
  'invoices.col.number': 'No.',
  'invoices.col.kind': 'Type',
  'invoices.col.customer': 'Customer',
  'invoices.col.status': 'Status',
  'invoices.col.issued': 'Issued',
  'invoices.col.due': 'Due',
  'invoices.col.total': 'Total',
  'invoices.kind.quote': 'Quote',
  'invoices.kind.invoice': 'Invoice',
  'invoices.kind.credit_note': 'Credit note',
  'invoices.status.draft': 'Draft',
  'invoices.status.issued': 'Issued',
  'invoices.status.sent': 'Sent',
  'invoices.status.viewed': 'Viewed',
  'invoices.status.paid': 'Paid',
  'invoices.status.overdue': 'Overdue',

  // Document form (create + edit share these).
  'invoices.form.newTitle': 'New invoice',
  'invoices.form.editTitle': 'Edit draft',
  'invoices.form.intro':
    'Fill in the customer and the lines. You can save a draft and issue later.',
  'invoices.form.kindLegend': 'Document type',
  'invoices.form.customerLegend': 'Customer',
  'invoices.form.customerPicker': 'Pick from contacts',
  'invoices.form.customerPickerHint': 'Pick a customer to prefill name and terms. Optional.',
  'invoices.form.customerName': 'Customer name',
  'invoices.form.customerEmail': 'E-mail',
  'invoices.form.customerOrgNr': 'Organisation number',
  'invoices.form.customerAddress': 'Address',
  'invoices.form.currency': 'Currency',
  'invoices.form.language': 'Language',
  'invoices.form.issueDate': 'Invoice date',
  'invoices.form.dueDate': 'Due date',
  'invoices.form.notes': 'Note',
  'invoices.form.notesHint': 'Optional text on the document.',
  'invoices.form.linesLegend': 'Lines',
  'invoices.form.addLine': 'Add line',
  'invoices.form.removeLine': 'Remove line',
  'invoices.form.line.product': 'Pick from catalogue',
  'invoices.form.line.description': 'Description',
  'invoices.form.line.quantity': 'Quantity',
  'invoices.form.line.unit': 'Unit',
  'invoices.form.line.price': 'Price excl. VAT',
  'invoices.form.line.account': 'Account',
  'invoices.form.line.vat': 'VAT code',
  'invoices.form.noneOption': 'None',
  'invoices.form.chooseOption': 'Choose …',
  'invoices.form.totalsNet': 'Net',
  'invoices.form.totalsVat': 'VAT',
  'invoices.form.totalsGross': 'Total to pay',
  'invoices.form.submitCreate': 'Save draft',
  'invoices.form.submitSave': 'Save changes',
  'invoices.form.errorInvalidInput': 'Check the fields and try again.',
  'invoices.form.unregisteredWarning':
    'The business is not VAT-registered, so you cannot invoice with output VAT. Pick a VAT code without tax.',
  'invoices.error.output-vat-requires-registration':
    'You cannot put output VAT on a line until the business is VAT-registered.',
  'invoices.error.zero-rated-requires-registration':
    'Zero-rating requires the business to be VAT-registered.',
  'invoices.error.input-deduction-requires-registration':
    'Deducting input VAT requires the business to be VAT-registered.',
  'invoices.error.input-code-not-a-sale':
    'This VAT code is for purchases, not sales. Pick a sales code.',
  'invoices.error.reverse-charge-not-a-sale':
    'This VAT code is for reverse-charge purchases (you self-account the VAT), not sales. Pick a sales code.',
  'invoices.error.unknown-vat-code': 'Unknown VAT code on a line.',
  'invoices.error.notADraft':
    'Only a draft can be changed. Correct an issued document with a credit note.',
  'invoices.error.creditNote': 'Could not create a credit note for this document.',

  // Detail view + lifecycle actions. Sober voice for the consequential acts (§5.5).
  'invoices.detail.edit': 'Edit',
  'invoices.detail.kid': 'KID',
  'invoices.detail.creditsInvoice': 'Credit note for invoice {number}',
  'invoices.detail.lineHeaderDescription': 'Description',
  'invoices.detail.lineHeaderQuantity': 'Quantity',
  'invoices.detail.lineHeaderPrice': 'Price',
  'invoices.detail.lineHeaderVat': 'VAT',
  'invoices.detail.lineHeaderNet': 'Net',
  'invoices.detail.issue': 'Issue',
  'invoices.detail.issueNote':
    'When you issue, the document gets a number and stands. If you need to correct it, you create a credit note.',
  'invoices.detail.posted': 'Posted to your accounts.',
  'invoices.detail.markSent': 'Mark as sent',
  'invoices.detail.markPaid': 'Mark as paid',
  'invoices.detail.createCreditNote': 'Create credit note',
  'invoices.detail.customerHeading': 'Customer',
  'invoices.detail.totalsHeading': 'Amounts',
  'invoices.detail.actionsLabel': 'Actions',
  'invoices.detail.linesCaption': 'The lines on the document.',

  'invoices.pdf.invoiceTitle': 'Invoice',
  'invoices.pdf.creditNoteTitle': 'Credit note',
  'invoices.pdf.sellerHeading': 'Seller',
  'invoices.pdf.customerHeading': 'Customer',
  'invoices.pdf.orgNr': 'Org. no.',
  'invoices.pdf.invoiceNo': 'Invoice number',
  'invoices.pdf.issueDate': 'Invoice date',
  'invoices.pdf.dueDate': 'Due date',
  'invoices.pdf.kid': 'KID',
  'invoices.pdf.lineDescription': 'Description',
  'invoices.pdf.lineQuantity': 'Quantity',
  'invoices.pdf.lineUnitPrice': 'Price',
  'invoices.pdf.lineVat': 'VAT',
  'invoices.pdf.lineNet': 'Net',
  'invoices.pdf.vatBasisHeading': 'VAT basis',
  'invoices.pdf.vatBasisRate': 'Rate',
  'invoices.pdf.vatBasisBase': 'Basis',
  'invoices.pdf.vatBasisVat': 'VAT',
  'invoices.pdf.totalNet': 'Net',
  'invoices.pdf.totalVat': 'VAT',
  'invoices.pdf.totalGross': 'To pay',
  'invoices.pdf.generatedNote': 'This document was produced in Saldo.',
  'invoices.detail.downloadPdf': 'Download PDF',
  'invoices.detail.downloadEhf': 'Download EHF (e-invoice)',
  'invoices.detail.deliveryHeading': 'Send',
  'invoices.detail.send': 'Send by email',
  'invoices.detail.sendBody': 'Sends the invoice as a PDF to {email} and marks it as sent.',
  'invoices.detail.sendNoEmail': 'Add an email address to the customer to send the invoice.',
  'invoices.detail.sendNotConfigured':
    'Email is not set up yet. You can download the PDF and send it yourself.',
  'invoices.detail.sendOk': 'Sent to {email}.',
  'invoices.detail.sendError':
    'I could not send the email. Try again, or download the PDF and send it yourself.',
  'invoices.email.subjectInvoice': 'Invoice {number} from {seller}',
  'invoices.email.subjectCreditNote': 'Credit note {number} from {seller}',
  'invoices.email.body':
    'Hi!\n\nPlease find the document attached as a PDF. Get in touch if anything is unclear.\n\nKind regards\n{seller}',

  'error.title': 'Something went wrong',
  'error.statusHeading': '{status} {statusText}',
  'error.requestFailed': 'The request could not be completed.',
  'error.unknown': 'An unknown error occurred.',
} satisfies Record<MessageKey, string>;
