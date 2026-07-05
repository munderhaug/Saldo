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
  'common.tableRegion': 'Tabell — kan rulles sidelengs',
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

  // ── Inngående balanse (feat-opening-balances) — mid-year migration entry ──
  'opening.title': 'Inngående balanse',
  'opening.intro':
    'Bytter du til Saldo midt i året? Fortell meg hva virksomheten eier og skylder ved byttet, så starter regnskapet riktig fra dag én.',
  'opening.ownLegend': 'Det virksomheten eier',
  'opening.oweLegend': 'Det virksomheten skylder',
  'opening.bankLabel': 'Penger på konto',
  'opening.receivableLabel': 'Kunder skylder deg',
  'opening.fixturesLabel': 'Utstyr og inventar',
  'opening.payableLabel': 'Du skylder leverandører',
  'opening.vatLabel': 'Skyldig merverdiavgift',
  'opening.amountHint': 'I kroner. La feltet stå tomt hvis det ikke gjelder deg.',
  'opening.equityNote':
    'Differansen mellom det du eier og det du skylder blir stående som egenkapitalen din — den delen av virksomheten som er din.',
  // Append-only ledger, stated calmly — same promise as the manual voucher.
  'opening.confirmNote':
    'Åpningen bokføres som ett bilag og blir stående. Blir noe feil, retter vi det med en ny føring — ingenting overskrives.',
  'opening.submit': 'Bokfør inngående balanse',
  'opening.cancel': 'Avbryt',
  'opening.errorInvalidInput':
    'Jeg fikk ikke lest et av beløpene. Skriv dem som tall, f.eks. 12 500.',
  'opening.errorEmpty': 'Fyll inn minst ett beløp, så bokfører jeg åpningen for deg.',
  'opening.errorGeneric': 'Jeg fikk ikke bokført åpningen. Prøv igjen om et øyeblikk.',

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
  'receipts.new.errorRateLimited':
    'Mange kvitteringer på kort tid — jeg trenger en liten pause. Prøv igjen om noen minutter.',
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
  'auth.login.errorRateLimited': 'For mange forsøk. Vent litt og prøv igjen.',
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
  'oppslag.rateLimited': 'Jeg håndterer mange søk akkurat nå. Vent et lite øyeblikk og prøv igjen.',
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
  'invoices.error.kind-immutable':
    'Dokumenttypen og fakturaen en kreditnota retter kan ikke endres. Last siden på nytt og prøv igjen.',
  'invoices.error.credit-note-source-not-posted':
    'Kreditnotaen mangler en utstedt faktura å reversere. Velg fakturaen den retter.',
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

  // ── Banking import (build-spec §8.7, feat-banking-import) ─────────────────────
  'bank.title': 'Bankkontoer',
  'bank.intro': 'Importer banktransaksjoner, klare for avstemming.',
  'bank.new': 'Ny bankkonto',
  'bank.empty.body':
    'Du har ingen bankkontoer enda. Legg til den første, så kan du importere transaksjoner.',
  'bank.open': 'Åpne',
  'bank.linked': 'Koblet til bank',
  'bank.listCaption': '{count} bankkontoer.',
  'bank.back': 'Tilbake til foretaket',
  'bank.col.label': 'Navn',
  'bank.col.account': 'Kontonummer',
  'bank.col.transactions': 'Transaksjoner',

  // Bank-account form (add).
  'bank.form.title': 'Ny bankkonto',
  'bank.form.intro': 'Gi kontoen et navn. Du kan importere fra fil eller koble til banken etterpå.',
  'bank.form.labelLabel': 'Navn på kontoen',
  'bank.form.labelHint': 'For eksempel «Driftskonto».',
  'bank.form.accountNumberLabel': 'Kontonummer eller IBAN',
  'bank.form.accountNumberHint': 'Valgfritt.',
  'bank.form.currencyLabel': 'Valuta',
  'bank.form.gocardlessLabel': 'GoCardless konto-ID',
  'bank.form.gocardlessHint': 'Valgfritt — for automatisk henting fra banken (PSD2).',
  'bank.form.submit': 'Lagre konto',
  'bank.form.cancel': 'Avbryt',
  'bank.form.errorInvalid': 'Sjekk feltene under.',

  // Account detail + transactions.
  'bank.detail.transactionsTitle': 'Transaksjoner',
  'bank.detail.empty': 'Ingen transaksjoner importert enda.',
  'bank.detail.listCaption': '{count} transaksjoner.',
  'bank.detail.back': 'Tilbake til bankkontoer',
  'bank.detail.col.date': 'Dato',
  'bank.detail.col.description': 'Beskrivelse',
  'bank.detail.col.counterparty': 'Motpart',
  'bank.detail.col.amount': 'Beløp',
  'bank.detail.matched': 'Avstemt',
  'bank.detail.unmatched': 'Ikke avstemt',
  'bank.detail.descriptionNone': '—',

  // Import (file + GoCardless).
  'bank.import.fileTitle': 'Importer fra fil',
  'bank.import.fileIntro': 'Last opp en camt.054-fil (XML) eller en CSV fra nettbanken.',
  'bank.import.fileLabel': 'Fil (camt.054 XML eller CSV)',
  'bank.import.fileSubmit': 'Importer fil',
  'bank.import.gocardlessTitle': 'Hent fra banken (PSD2)',
  'bank.import.gocardlessIntro': 'Hent nye transaksjoner direkte fra banken via GoCardless.',
  'bank.import.gocardlessSubmit': 'Hent transaksjoner',
  'bank.import.gocardlessNotLinked':
    'Legg til en GoCardless konto-ID på kontoen for å hente automatisk.',
  'bank.import.gocardlessUnavailable':
    'Automatisk henting er ikke satt opp på denne serveren enda.',
  'bank.import.rateLimitNote':
    'Banken tillater bare noen få hentinger per dag, så jeg henter alt på én gang.',
  'bank.import.success': 'Importerte {imported} nye transaksjoner. {skipped} fantes fra før.',
  'bank.import.errorNoFile': 'Velg en fil først.',
  'bank.import.errorFileType': 'Filen må være en camt.054 XML- eller CSV-fil.',
  'bank.import.errorTooLarge': 'Filen er for stor.',
  'bank.import.errorParse':
    'Jeg klarte ikke å lese filen. Sjekk at det er en gyldig camt.054- eller CSV-fil.',
  'bank.import.errorNoColumns': 'Fant ikke en beløpskolonne i CSV-filen.',
  'bank.import.errorRateLimited': 'Banken har nådd grensen for henting i dag. Prøv igjen senere.',
  'bank.import.errorAuth': 'Jeg fikk ikke kontakt med banken. Sjekk oppsettet.',
  'bank.import.errorGeneric': 'Noe gikk galt under importen. Prøv igjen.',

  // Reconciliation (avstemming) — match incoming payments to open invoices.
  'bank.detail.reconcile': 'Avstem betalinger',
  'recon.title': 'Avstem betalinger',
  'recon.intro':
    'Koble innkommende betalinger til åpne fakturaer. Jeg foreslår treff på KID, beløp og dato — du bekrefter.',
  'recon.back': 'Tilbake til kontoen',
  'recon.empty': 'Ingen innkommende betalinger å avstemme akkurat nå.',
  'recon.listCaption': '{count} betalinger å avstemme.',
  'recon.col.date': 'Dato',
  'recon.col.description': 'Beskrivelse',
  'recon.col.amount': 'Beløp',
  'recon.col.suggestion': 'Foreslått faktura',
  'recon.suggestionNone': 'Fant ingen åpen faktura med samme beløp.',
  'recon.match.kid-exact': 'KID stemmer',
  'recon.match.amount-date': 'Beløp og dato stemmer',
  'recon.match.amount': 'Beløpet stemmer',
  'recon.invoiceLabel': 'Faktura {number} — {customer}',
  'recon.invoiceLabelNoNumber': '{customer}',
  'recon.choose': 'Velg faktura',
  'recon.confirm': 'Bekreft betaling',
  'recon.success': 'Avstemt. Fakturaen er merket betalt.',
  'recon.error.tx-not-found': 'Fant ikke banktransaksjonen.',
  'recon.error.tx-already-matched': 'Denne betalingen er allerede avstemt.',
  'recon.error.tx-not-incoming': 'Bare innkommende betalinger kan avstemmes her.',
  'recon.error.invoice-not-open': 'Fakturaen er ikke åpen for betaling.',
  'recon.error.amount-mismatch':
    'Beløpet stemmer ikke med fakturaen. Delbetaling støttes ikke enda.',
  'recon.error.undated': 'Betalingen mangler dato, så jeg vet ikke hvilken periode den hører til.',
  'recon.error.chart-incomplete': 'Kontoplanen mangler en konto. Sjekk oppsettet.',
  'recon.error.invalid': 'Sjekk valget og prøv igjen.',
  'mva.title': 'MVA-melding',
  'mva.period': 'Årstermin {year}',
  'mva.notRegistered':
    'Virksomheten er ikke registrert i Merverdiavgiftsregisteret, så det er ingen MVA-melding å levere.',
  'mva.back': 'Tilbake til oversikten',
  'mva.settlement.pay': 'Å betale',
  'mva.settlement.refund': 'Til gode',
  'mva.settlement.zero': 'Ingenting å gjøre opp',
  'mva.valid': 'Meldingen er kontrollert lokalt og stemmer med regnskapet.',
  'mva.invalid': 'Meldingen har avvik som må rettes: {rules}.',
  'mva.empty': 'Ingen avgiftspliktige posteringer i denne perioden enda.',
  'mva.listCaption': '{count} spesifikasjonslinjer.',
  'mva.col.code': 'Kode',
  'mva.col.basis': 'Grunnlag',
  'mva.col.rate': 'Sats',
  'mva.col.vat': 'Merverdiavgift',
  'mva.submitNote':
    'Dette er et utkast bygget fra regnskapet. Innlevering til Skatteetaten via Altinn kommer senere — last ned filen eller bruk den i «Min mva» for nå.',
  'mva.downloadXml': 'Last ned XML',
  // Filing-adjacent → §5.5 sober register: plain, no flourish (wire-skatteetaten-validation).
  'mva.skatteetaten.heading': 'Kontroll hos Skatteetaten',
  'mva.skatteetaten.note':
    'Kontroller utkastet mot Skatteetatens valideringstjeneste før du leverer. Dette er en kontroll, ikke en innlevering.',
  'mva.skatteetaten.validate': 'Valider hos Skatteetaten',
  'mva.skatteetaten.approved': 'Skatteetaten fant ingen avvik i meldingen.',
  'mva.skatteetaten.deviations': 'Skatteetaten meldte avvik: {deviations}',
  'mva.skatteetaten.not-configured':
    'Valideringstjenesten er ikke koblet til i dette miljøet enda, så meldingen er bare kontrollert lokalt.',
  'mva.skatteetaten.auth-failed':
    'Valideringstjenesten godtok ikke tilgangen. Sjekk oppsettet av integrasjonen.',
  'mva.skatteetaten.rate-limited': 'Valideringstjenesten ba om en pause. Prøv igjen om litt.',
  'mva.skatteetaten.error': 'Fikk ikke kontakt med valideringstjenesten. Prøv igjen om litt.',
  'mva.skatteetaten.invalid-response':
    'Svaret fra valideringstjenesten kunne ikke tolkes. Prøv igjen om litt.',

  // ── SAF-T-eksport (feat-saft-export) — read-only finansfil bygget fra det posterte regnskapet ──
  'saft.title': 'SAF-T-eksport',
  'saft.period': 'Regnskapsår {year}',
  'saft.intro':
    'En standardisert fil med hele regnskapet for året — kontoplan, kunder og leverandører, mva-koder og alle bilag. Dette er filen en revisor eller Skatteetaten kan be om ved et bokettersyn.',
  'saft.tieOut.ok':
    'Filen er kontrollert lokalt og stemmer med regnskapet (sum debet = sum kredit).',
  'saft.tieOut.fail': 'Filen har avvik som må rettes før den brukes.',
  'saft.summary': '{accounts} kontoer og {transactions} bilag for året.',
  'saft.totalDebit': 'Sum debet',
  'saft.totalCredit': 'Sum kredit',
  'saft.empty': 'Ingen posterte bilag i denne perioden enda.',
  'saft.note':
    'Filen valideres mot den offisielle SAF-T-standarden. Last den ned og gi den videre til regnskapsfører eller revisor.',
  'saft.downloadXml': 'Last ned SAF-T (XML)',
  'saft.back': 'Tilbake til oversikten',

  // ── Hjelperen — the deterministic companion (ADR 0058). Addressed STRUCTURALLY ("hjelperen"):
  // the character's name awaits `companion-user-validation`, so naming it later is a string change
  // here — never a key change. Dropping all playfulness at the §5.5 moments happens by the
  // companion not rendering there, not by copy.
  'companion.dismiss': 'Skjul hjelperen',
  'companion.show': 'Vis hjelperen igjen',
  'companion.settingTitle': 'Hjelperen',
  'companion.settingBodyOn':
    'Hjelperen dukker opp der det er tomt og peker deg videre. Den blander seg aldri inn når penger går ut eller noe sendes til myndighetene.',
  'companion.settingBodyOff': 'Hjelperen er skjult. Hent den fram igjen når du vil.',

  // ── Innstillinger (org-payout-account) — kontonummer for innbetaling (EHF PayeeFinancialAccount) ──
  'settings.title': 'Innstillinger',
  'settings.intro': 'Kontonummeret kunder betaler til. Det tas med på fakturaen og i EHF-filen.',
  'settings.accountLabel': 'Kontonummer for innbetaling',
  'settings.accountHint':
    'Norsk kontonummer (11 siffer) eller IBAN. La feltet stå tomt for å fjerne det.',
  'settings.accountNameLabel': 'Kontohavers navn (valgfritt)',
  'settings.accountNameHint':
    'Navnet som står på kontoen, hvis det er et annet enn foretaksnavnet.',
  'settings.submitSave': 'Lagre',
  'settings.errorInvalidInput':
    'Jeg klarte ikke å lese inn det du skrev. Sjekk feltene og prøv igjen.',
  'settings.errorInvalidAccount':
    'Dette ser ikke ut som et gyldig kontonummer. Sjekk sifrene en gang til.',
  'settings.back': 'Tilbake til oversikten',

  // ── Rapporter (feat-reporting) — read-only utledning fra det posterte regnskapet ──────────────
  'reports.title': 'Rapporter',
  'reports.period': 'Regnskapsår {year}',
  'reports.back': 'Tilbake til oversikten',
  'reports.year.previous': 'Forrige år',
  'reports.year.next': 'Neste år',
  'reports.empty': 'Ingen posterte bilag i denne perioden enda.',
  'reports.col.account': 'Konto',
  'reports.col.amount': 'Beløp',
  // Hub
  'reports.hub.resultat.desc': 'Inntekter minus kostnader.',
  'reports.hub.balanse.desc': 'Eiendeler, egenkapital og gjeld.',
  'reports.hub.hovedbok.desc': 'Alle posteringer per konto.',
  'reports.hub.reskontro.desc': 'Utestående per kunde.',
  'reports.hub.likviditet.desc': 'Tilgjengelige midler.',
  // Kontoklasse-grupper (resultat/balanse)
  'reports.klasse.1': 'Eiendeler',
  'reports.klasse.2': 'Egenkapital og gjeld',
  'reports.klasse.3': 'Salgs- og driftsinntekter',
  'reports.klasse.4': 'Varekostnad',
  'reports.klasse.5': 'Lønnskostnad',
  'reports.klasse.6': 'Av- og nedskrivning',
  'reports.klasse.7': 'Annen driftskostnad',
  'reports.klasse.8': 'Finansposter',
  // Resultat
  'reports.resultat.title': 'Resultatregnskap',
  'reports.resultat.caption': 'Resultat for regnskapsåret {year}.',
  'reports.resultat.driftsinntekter': 'Sum driftsinntekter',
  'reports.resultat.driftskostnader': 'Sum driftskostnader',
  'reports.resultat.driftsresultat': 'Driftsresultat',
  'reports.resultat.finansposter': 'Netto finansposter',
  'reports.resultat.aarsresultat': 'Årsresultat',
  // Balanse
  'reports.balanse.title': 'Balanse',
  'reports.balanse.caption': 'Balanse per utgangen av {year}.',
  'reports.balanse.eiendeler': 'Eiendeler',
  'reports.balanse.egenkapitalGjeld': 'Egenkapital og gjeld',
  'reports.balanse.aarsresultat': 'Årets resultat',
  'reports.balanse.sumEiendeler': 'Sum eiendeler',
  'reports.balanse.sumEgenkapitalGjeld': 'Sum egenkapital og gjeld',
  'reports.balanse.balances': 'Balansen går opp mot regnskapet.',
  'reports.balanse.imbalance':
    'Balansen går ikke opp — differanse {amount} kr. Si ifra, så ser vi på det.',
  // Hovedbok
  'reports.hovedbok.title': 'Hovedbok',
  'reports.hovedbok.intro': 'Velg en konto for å se alle posteringer.',
  'reports.hovedbok.caption': '{count} kontoer med bevegelse i {year}.',
  'reports.hovedbok.col.name': 'Navn',
  'reports.hovedbok.col.date': 'Dato',
  'reports.hovedbok.col.voucher': 'Bilag',
  'reports.hovedbok.col.debit': 'Debet',
  'reports.hovedbok.col.credit': 'Kredit',
  'reports.hovedbok.col.balance': 'Saldo',
  'reports.hovedbok.opening': 'Inngående saldo',
  'reports.hovedbok.closing': 'Utgående saldo',
  'reports.hovedbok.entries': '{count} posteringer i {year}.',
  'reports.hovedbok.back': 'Tilbake til kontolisten',
  'reports.hovedbok.empty': 'Ingen posteringer på denne kontoen i {year}.',
  // Bilagstyper
  'reports.voucherType.sales': 'Salg',
  'reports.voucherType.purchase': 'Kjøp',
  'reports.voucherType.manual': 'Manuelt',
  'reports.voucherType.bank': 'Bank',
  'reports.voucherType.reversal': 'Motbilag',
  // Reskontro
  'reports.reskontro.title': 'Kundereskontro',
  'reports.reskontro.intro': 'Utestående per kunde, fordelt på alder.',
  'reports.reskontro.caption': '{count} kunder med utestående.',
  'reports.reskontro.col.customer': 'Kunde',
  'reports.reskontro.col.total': 'Totalt',
  'reports.reskontro.sumRow': 'Sum',
  'reports.reskontro.empty': 'Ingen utestående fakturaer.',
  'reports.reskontro.apNote': 'Leverandørreskontro kommer når leverandørfakturaer er på plass.',
  // Aldersfordeling
  'reports.aging.current': 'Ikke forfalt',
  'reports.aging.d1_30': '1–30 dager',
  'reports.aging.d31_60': '31–60 dager',
  'reports.aging.d61_90': '61–90 dager',
  'reports.aging.d90plus': 'Over 90 dager',
  // Likviditet
  'reports.likviditet.title': 'Likviditet',
  'reports.likviditet.intro': 'Hva du har tilgjengelig akkurat nå.',
  'reports.likviditet.cash': 'Kontanter og bank',
  'reports.likviditet.receivables': 'Utestående fra kunder',
  'reports.likviditet.payables': 'Skyldig til leverandører',
  'reports.likviditet.projected': 'Forventet posisjon',
  'reports.likviditet.caption': 'Likvide kontoer (konto 19xx).',
  'reports.likviditet.empty': 'Ingen likvide midler registrert enda.',

  // ── Kjøp — leverandørfakturaer (build-spec §8.5) ─────────────────────────────────────────────────
  'purchases.title': 'Kjøp og leverandørfakturaer',
  'purchases.intro': 'Leverandørfakturaer du har mottatt. Før dem inn og bokfør dem.',
  'purchases.new': 'Ny leverandørfaktura',
  'purchases.back': 'Tilbake til foretaket',
  'purchases.empty.body': 'Du har ingen leverandørfakturaer enda. Før inn den første.',
  'purchases.listCaption': '{count} leverandørfakturaer.',
  'purchases.col.supplier': 'Leverandør',
  'purchases.col.number': 'Fakturanr.',
  'purchases.col.status': 'Status',
  'purchases.col.date': 'Dato',
  'purchases.col.due': 'Forfall',
  'purchases.col.total': 'Sum',
  'purchases.status.draft': 'Utkast',
  'purchases.status.posted': 'Bokført',

  // Dokumentskjema (opprett + rediger deler disse).
  'purchases.form.newTitle': 'Ny leverandørfaktura',
  'purchases.form.editTitle': 'Rediger utkast',
  'purchases.form.intro':
    'Før inn leverandøren og linjene. Du kan lagre som utkast og bokføre når du er klar.',
  'purchases.form.supplierLegend': 'Leverandør',
  'purchases.form.supplierPicker': 'Hent fra kontakter',
  'purchases.form.supplierPickerHint':
    'Velg en leverandør for å forhåndsutfylle navn og betingelser. Valgfritt.',
  'purchases.form.supplierName': 'Leverandørnavn',
  'purchases.form.supplierOrgNr': 'Organisasjonsnummer',
  'purchases.form.invoiceNumber': 'Leverandørens fakturanummer',
  'purchases.form.kid': 'KID eller betalingsreferanse',
  'purchases.form.currency': 'Valuta',
  'purchases.form.invoiceDate': 'Fakturadato',
  'purchases.form.dueDate': 'Forfallsdato',
  'purchases.form.notes': 'Notat',
  'purchases.form.notesHint': 'Valgfri tekst på dokumentet.',
  'purchases.form.linesLegend': 'Linjer',
  'purchases.form.addLine': 'Legg til linje',
  'purchases.form.removeLine': 'Fjern linje',
  'purchases.form.line.description': 'Beskrivelse',
  'purchases.form.line.quantity': 'Antall',
  'purchases.form.line.unit': 'Enhet',
  'purchases.form.line.price': 'Pris uten mva',
  'purchases.form.line.account': 'Kostnadskonto',
  'purchases.form.line.vat': 'MVA-kode',
  'purchases.form.line.deduction': 'Fradrag for inngående mva',
  'purchases.form.deduction.full': 'Fullt fradrag',
  'purchases.form.deduction.representasjon': 'Representasjon — ikke fradrag',
  'purchases.form.deduction.restricted_vehicle': 'Personkjøretøy — ikke fradrag',
  'purchases.form.deduction.private_use': 'Privat bruk — ikke fradrag',
  'purchases.form.noneOption': 'Ingen',
  'purchases.form.chooseOption': 'Velg …',
  'purchases.form.totalsNet': 'Netto',
  'purchases.form.totalsVat': 'Merverdiavgift',
  'purchases.form.totalsGross': 'Sum å betale',
  'purchases.form.submitCreate': 'Lagre utkast',
  'purchases.form.submitSave': 'Lagre endringer',
  'purchases.form.errorInvalidInput': 'Sjekk feltene og prøv igjen.',
  // Linjevise blokkeringer (server-autoritativt; vist som en skjemafeil).
  'purchases.error.output-code-not-a-purchase':
    'Denne MVA-koden er for salg, ikke kjøp. Velg en kjøpskode.',
  'purchases.error.unknown-vat-code': 'Ukjent MVA-kode på en linje.',
  'purchases.error.not-a-draft':
    'Bare utkast kan endres. Et bokført dokument rettes med et motbilag.',
  'purchases.error.missing-invoice-date': 'Sett en fakturadato før du bokfører.',
  'purchases.error.rule-violation':
    'Føringen passerte ikke kontrollen. Sjekk linjene og prøv igjen.',
  'purchases.error.generic': 'Noe gikk galt. Prøv igjen.',

  // Detaljvisning + bokføring. Nøktern tone for den konsekvensrike handlingen (§5.5).
  'purchases.detail.draftTitle': 'Leverandørfaktura (utkast)',
  'purchases.detail.postedTitle': 'Leverandørfaktura',
  'purchases.detail.supplier': 'Leverandør',
  'purchases.detail.invoiceNumber': 'Fakturanummer',
  'purchases.detail.date': 'Fakturadato',
  'purchases.detail.due': 'Forfall',
  'purchases.detail.linesCaption': 'Linjer på fakturaen.',
  'purchases.detail.lineHeaderDescription': 'Beskrivelse',
  'purchases.detail.lineHeaderAmount': 'Netto',
  'purchases.detail.net': 'Netto',
  'purchases.detail.vat': 'Merverdiavgift',
  'purchases.detail.gross': 'Sum',
  'purchases.detail.edit': 'Rediger',
  'purchases.detail.postIntro':
    'Når du bokfører, føres fakturaen i regnskapet som leverandørgjeld.',
  'purchases.detail.post': 'Bokfør',
  'purchases.detail.posted': 'Bokført',
  'purchases.detail.postedNote':
    'Fakturaen er ført i regnskapet. Rett den med et motbilag om nødvendig.',

  // ── Privatøkonomi — uttak, utlegg, kjøregodtgjørelse og diett (build-spec §8.5) ───────────────────
  // §5.5: penger som flytter inn/ut av foretaket — nøktern, klar tone, ingen pynt.
  'owner.new.title': 'Privatuttak og utlegg',
  'owner.new.intro': 'Penger mellom deg og foretaket. Det blir bokført med en gang.',
  'owner.new.kindLegend': 'Hva gjelder det?',
  'owner.new.kind.drawing.label': 'Privatuttak',
  'owner.new.kind.drawing.desc': 'Penger du tar ut av foretaket til privat bruk.',
  'owner.new.kind.outlay.label': 'Utlegg',
  'owner.new.kind.outlay.desc': 'En utgift for foretaket som du betalte privat.',
  'owner.new.kind.mileage.label': 'Kjøregodtgjørelse',
  'owner.new.kind.mileage.desc': 'Godtgjørelse for bruk av egen bil — et fradrag, ikke lønn.',
  'owner.new.kind.diett.label': 'Diett',
  'owner.new.kind.diett.desc': 'Kostgodtgjørelse på reise — et fradrag, ikke lønn.',
  'owner.new.amountLabel': 'Beløp',
  'owner.new.amountHint': 'Beløpet i kroner. For utlegg: uten mva når foretaket er MVA-registrert.',
  'owner.new.confirmNote': 'Beløpet bokføres som en føring mot egenkapitalen din.',
  'owner.new.submit': 'Bokfør',
  'owner.new.cancel': 'Avbryt',
  'owner.new.errorInvalidInput': 'Sjekk feltene og prøv igjen.',
  'owner.new.errorGeneric': 'Noe gikk galt. Prøv igjen.',
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
  'common.tableRegion': 'Table — scrolls sideways',
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

  // ── Opening balance (feat-opening-balances) — mid-year migration entry ──
  'opening.title': 'Opening balance',
  'opening.intro':
    'Switching to Saldo mid-year? Tell me what the business owns and owes at the switch, and the books start out right from day one.',
  'opening.ownLegend': 'What the business owns',
  'opening.oweLegend': 'What the business owes',
  'opening.bankLabel': 'Money in the bank',
  'opening.receivableLabel': 'Customers owe you',
  'opening.fixturesLabel': 'Equipment and fixtures',
  'opening.payableLabel': 'You owe suppliers',
  'opening.vatLabel': 'VAT owed',
  'opening.amountHint': 'In kroner. Leave a field empty if it does not apply to you.',
  'opening.equityNote':
    'The difference between what you own and what you owe stays as your equity — the part of the business that is yours.',
  'opening.confirmNote':
    'The opening is booked as one voucher and stays put. If something is off, we correct it with a new entry — nothing is overwritten.',
  'opening.submit': 'Book the opening balance',
  'opening.cancel': 'Cancel',
  'opening.errorInvalidInput':
    "I couldn't read one of the amounts. Write them as numbers, e.g. 12 500.",
  'opening.errorEmpty': 'Fill in at least one amount and I will book the opening for you.',
  'opening.errorGeneric': "I couldn't book the opening. Try again in a moment.",

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
  'receipts.new.errorRateLimited':
    'That is a lot of receipts in a short time — I need a short break. Try again in a few minutes.',
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
  'auth.login.errorRateLimited': 'Too many attempts. Wait a moment and try again.',
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
  'oppslag.rateLimited': "I'm handling a lot of searches right now. Wait a moment and try again.",
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
  'invoices.error.kind-immutable':
    'The document type and the invoice a credit note corrects cannot be changed. Reload the page and try again.',
  'invoices.error.credit-note-source-not-posted':
    'This credit note has no issued invoice to reverse. Pick the invoice it corrects.',
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

  // ── Banking import (build-spec §8.7, feat-banking-import) ─────────────────────
  'bank.title': 'Bank accounts',
  'bank.intro': 'Import bank transactions, ready for reconciliation.',
  'bank.new': 'New bank account',
  'bank.empty.body':
    'You have no bank accounts yet. Add your first to start importing transactions.',
  'bank.open': 'Open',
  'bank.linked': 'Linked to bank',
  'bank.listCaption': '{count} bank accounts.',
  'bank.back': 'Back to the business',
  'bank.col.label': 'Name',
  'bank.col.account': 'Account number',
  'bank.col.transactions': 'Transactions',

  // Bank-account form (add).
  'bank.form.title': 'New bank account',
  'bank.form.intro':
    'Give the account a name. You can import from a file or link the bank afterwards.',
  'bank.form.labelLabel': 'Account name',
  'bank.form.labelHint': 'For example "Operating account".',
  'bank.form.accountNumberLabel': 'Account number or IBAN',
  'bank.form.accountNumberHint': 'Optional.',
  'bank.form.currencyLabel': 'Currency',
  'bank.form.gocardlessLabel': 'GoCardless account ID',
  'bank.form.gocardlessHint': 'Optional — for automatic fetching from the bank (PSD2).',
  'bank.form.submit': 'Save account',
  'bank.form.cancel': 'Cancel',
  'bank.form.errorInvalid': 'Check the fields below.',

  // Account detail + transactions.
  'bank.detail.transactionsTitle': 'Transactions',
  'bank.detail.empty': 'No transactions imported yet.',
  'bank.detail.listCaption': '{count} transactions.',
  'bank.detail.back': 'Back to bank accounts',
  'bank.detail.col.date': 'Date',
  'bank.detail.col.description': 'Description',
  'bank.detail.col.counterparty': 'Counterparty',
  'bank.detail.col.amount': 'Amount',
  'bank.detail.matched': 'Reconciled',
  'bank.detail.unmatched': 'Not reconciled',
  'bank.detail.descriptionNone': '—',

  // Import (file + GoCardless).
  'bank.import.fileTitle': 'Import from file',
  'bank.import.fileIntro': 'Upload a camt.054 file (XML) or a CSV from your bank.',
  'bank.import.fileLabel': 'File (camt.054 XML or CSV)',
  'bank.import.fileSubmit': 'Import file',
  'bank.import.gocardlessTitle': 'Fetch from the bank (PSD2)',
  'bank.import.gocardlessIntro': 'Fetch new transactions straight from the bank via GoCardless.',
  'bank.import.gocardlessSubmit': 'Fetch transactions',
  'bank.import.gocardlessNotLinked':
    'Add a GoCardless account ID to this account to fetch automatically.',
  'bank.import.gocardlessUnavailable': 'Automatic fetching is not set up on this server yet.',
  'bank.import.rateLimitNote':
    'The bank allows only a few fetches per day, so I fetch everything at once.',
  'bank.import.success': 'Imported {imported} new transactions. {skipped} were already there.',
  'bank.import.errorNoFile': 'Choose a file first.',
  'bank.import.errorFileType': 'The file must be a camt.054 XML or CSV file.',
  'bank.import.errorTooLarge': 'The file is too large.',
  'bank.import.errorParse':
    "I couldn't read the file. Check that it's a valid camt.054 or CSV file.",
  'bank.import.errorNoColumns': "I couldn't find an amount column in the CSV file.",
  'bank.import.errorRateLimited': 'The bank has hit its fetch limit for today. Try again later.',
  'bank.import.errorAuth': "I couldn't reach the bank. Check the setup.",
  'bank.import.errorGeneric': 'Something went wrong during the import. Try again.',

  // Reconciliation — match incoming payments to open invoices.
  'bank.detail.reconcile': 'Reconcile payments',
  'recon.title': 'Reconcile payments',
  'recon.intro':
    'Link incoming payments to open invoices. I suggest matches on KID, amount and date — you confirm.',
  'recon.back': 'Back to the account',
  'recon.empty': 'No incoming payments to reconcile right now.',
  'recon.listCaption': '{count} payments to reconcile.',
  'recon.col.date': 'Date',
  'recon.col.description': 'Description',
  'recon.col.amount': 'Amount',
  'recon.col.suggestion': 'Suggested invoice',
  'recon.suggestionNone': 'No open invoice with the same amount.',
  'recon.match.kid-exact': 'KID matches',
  'recon.match.amount-date': 'Amount and date match',
  'recon.match.amount': 'Amount matches',
  'recon.invoiceLabel': 'Invoice {number} — {customer}',
  'recon.invoiceLabelNoNumber': '{customer}',
  'recon.choose': 'Choose invoice',
  'recon.confirm': 'Confirm payment',
  'recon.success': 'Reconciled. The invoice is marked paid.',
  'recon.error.tx-not-found': "I couldn't find the bank transaction.",
  'recon.error.tx-already-matched': 'This payment is already reconciled.',
  'recon.error.tx-not-incoming': 'Only incoming payments can be reconciled here.',
  'recon.error.invoice-not-open': 'The invoice is not open for payment.',
  'recon.error.amount-mismatch':
    "The amount doesn't match the invoice. Partial payments aren't supported yet.",
  'recon.error.undated': "The payment has no date, so I can't tell which period it belongs to.",
  'recon.error.chart-incomplete': 'The chart of accounts is missing an account. Check the setup.',
  'recon.error.invalid': 'Check the selection and try again.',
  'mva.title': 'VAT return',
  'mva.period': 'Annual term {year}',
  'mva.notRegistered':
    'The business is not in the VAT register, so there is no VAT return to file.',
  'mva.back': 'Back to the overview',
  'mva.settlement.pay': 'To pay',
  'mva.settlement.refund': 'Refund due',
  'mva.settlement.zero': 'Nothing to settle',
  'mva.valid': 'The return was checked locally and ties out to the ledger.',
  'mva.invalid': 'The return has issues to fix: {rules}.',
  'mva.empty': 'No VAT-bearing postings in this period yet.',
  'mva.listCaption': '{count} specification lines.',
  'mva.col.code': 'Code',
  'mva.col.basis': 'Basis',
  'mva.col.rate': 'Rate',
  'mva.col.vat': 'VAT',
  'mva.submitNote':
    'This is a draft built from the ledger. Filing to the Tax Administration via Altinn comes later — download the file or use it in “Min mva” for now.',
  'mva.downloadXml': 'Download XML',
  // Filing-adjacent → §5.5 sober register: plain, no flourish (wire-skatteetaten-validation).
  'mva.skatteetaten.heading': 'Check with Skatteetaten',
  'mva.skatteetaten.note':
    'Check the draft against Skatteetaten’s validation service before you file. This is a check, not a submission.',
  'mva.skatteetaten.validate': 'Validate with Skatteetaten',
  'mva.skatteetaten.approved': 'Skatteetaten found no deviations in the return.',
  'mva.skatteetaten.deviations': 'Skatteetaten reported deviations: {deviations}',
  'mva.skatteetaten.not-configured':
    'The validation service is not connected in this environment yet, so the return has only been checked locally.',
  'mva.skatteetaten.auth-failed':
    'The validation service did not accept the credentials. Check the integration setup.',
  'mva.skatteetaten.rate-limited': 'The validation service asked for a pause. Try again shortly.',
  'mva.skatteetaten.error': 'Could not reach the validation service. Try again shortly.',
  'mva.skatteetaten.invalid-response':
    'The response from the validation service could not be read. Try again shortly.',

  // ── SAF-T export (feat-saft-export) — read-only financial file built from the posted ledger ────
  'saft.title': 'SAF-T export',
  'saft.period': 'Financial year {year}',
  'saft.intro':
    'A standardised file with the whole year of accounts — chart of accounts, customers and suppliers, VAT codes and every voucher. This is the file an auditor or the Tax Administration can ask for during an audit.',
  'saft.tieOut.ok':
    'The file is checked locally and ties out to the ledger (total debit = total credit).',
  'saft.tieOut.fail': 'The file has discrepancies that must be fixed before it is used.',
  'saft.summary': '{accounts} accounts and {transactions} vouchers for the year.',
  'saft.totalDebit': 'Total debit',
  'saft.totalCredit': 'Total credit',
  'saft.empty': 'No posted vouchers in this period yet.',
  'saft.note':
    'The file is validated against the official SAF-T standard. Download it and pass it to your accountant or auditor.',
  'saft.downloadXml': 'Download SAF-T (XML)',
  'saft.back': 'Back to overview',

  // ── The companion — deterministic guide (ADR 0058); addressed structurally, never by name ──────
  'companion.dismiss': 'Hide the helper',
  'companion.show': 'Show the helper again',
  'companion.settingTitle': 'The helper',
  'companion.settingBodyOn':
    'The helper shows up where things are empty and points you onward. It never gets involved when money leaves or something is filed with the authorities.',
  'companion.settingBodyOff': 'The helper is hidden. Bring it back whenever you like.',

  // ── Settings (org-payout-account) — invoice payout account (EHF PayeeFinancialAccount) ─────────
  'settings.title': 'Settings',
  'settings.intro':
    'The account number customers pay into. It appears on the invoice and the EHF file.',
  'settings.accountLabel': 'Payout account number',
  'settings.accountHint':
    'A Norwegian account number (11 digits) or IBAN. Leave it blank to remove it.',
  'settings.accountNameLabel': 'Account holder name (optional)',
  'settings.accountNameHint': 'The name on the account, if it differs from the business name.',
  'settings.submitSave': 'Save',
  'settings.errorInvalidInput': "I couldn't read what you entered. Check the fields and try again.",
  'settings.errorInvalidAccount':
    "That doesn't look like a valid account number. Double-check the digits.",
  'settings.back': 'Back to overview',

  // ── Reports (feat-reporting) — read-only derivation from the posted ledger ────────────────────
  'reports.title': 'Reports',
  'reports.period': 'Fiscal year {year}',
  'reports.back': 'Back to the overview',
  'reports.year.previous': 'Previous year',
  'reports.year.next': 'Next year',
  'reports.empty': 'No posted vouchers in this period yet.',
  'reports.col.account': 'Account',
  'reports.col.amount': 'Amount',
  // Hub
  'reports.hub.resultat.desc': 'Income minus costs.',
  'reports.hub.balanse.desc': 'Assets, equity and liabilities.',
  'reports.hub.hovedbok.desc': 'Every posting per account.',
  'reports.hub.reskontro.desc': 'Outstanding per customer.',
  'reports.hub.likviditet.desc': 'Available funds.',
  // Account-class groups (P&L / balance sheet)
  'reports.klasse.1': 'Assets',
  'reports.klasse.2': 'Equity and liabilities',
  'reports.klasse.3': 'Sales and operating income',
  'reports.klasse.4': 'Cost of goods',
  'reports.klasse.5': 'Payroll cost',
  'reports.klasse.6': 'Depreciation',
  'reports.klasse.7': 'Other operating cost',
  'reports.klasse.8': 'Financial items',
  // P&L
  'reports.resultat.title': 'Profit & loss',
  'reports.resultat.caption': 'Result for fiscal year {year}.',
  'reports.resultat.driftsinntekter': 'Total operating income',
  'reports.resultat.driftskostnader': 'Total operating cost',
  'reports.resultat.driftsresultat': 'Operating result',
  'reports.resultat.finansposter': 'Net financial items',
  'reports.resultat.aarsresultat': 'Result for the year',
  // Balance sheet
  'reports.balanse.title': 'Balance sheet',
  'reports.balanse.caption': 'Balance as at the end of {year}.',
  'reports.balanse.eiendeler': 'Assets',
  'reports.balanse.egenkapitalGjeld': 'Equity and liabilities',
  'reports.balanse.aarsresultat': 'Result for the year',
  'reports.balanse.sumEiendeler': 'Total assets',
  'reports.balanse.sumEgenkapitalGjeld': 'Total equity and liabilities',
  'reports.balanse.balances': 'The balance sheet ties out to the ledger.',
  'reports.balanse.imbalance':
    'The balance sheet does not tie out — difference {amount} kr. Let us know and we will look into it.',
  // General ledger
  'reports.hovedbok.title': 'General ledger',
  'reports.hovedbok.intro': 'Pick an account to see every posting.',
  'reports.hovedbok.caption': '{count} accounts with movement in {year}.',
  'reports.hovedbok.col.name': 'Name',
  'reports.hovedbok.col.date': 'Date',
  'reports.hovedbok.col.voucher': 'Voucher',
  'reports.hovedbok.col.debit': 'Debit',
  'reports.hovedbok.col.credit': 'Credit',
  'reports.hovedbok.col.balance': 'Balance',
  'reports.hovedbok.opening': 'Opening balance',
  'reports.hovedbok.closing': 'Closing balance',
  'reports.hovedbok.entries': '{count} postings in {year}.',
  'reports.hovedbok.back': 'Back to the account list',
  'reports.hovedbok.empty': 'No postings on this account in {year}.',
  // Voucher types
  'reports.voucherType.sales': 'Sale',
  'reports.voucherType.purchase': 'Purchase',
  'reports.voucherType.manual': 'Manual',
  'reports.voucherType.bank': 'Bank',
  'reports.voucherType.reversal': 'Reversal',
  // Accounts receivable ledger
  'reports.reskontro.title': 'Customer ledger',
  'reports.reskontro.intro': 'Outstanding per customer, by age.',
  'reports.reskontro.caption': '{count} customers with an outstanding balance.',
  'reports.reskontro.col.customer': 'Customer',
  'reports.reskontro.col.total': 'Total',
  'reports.reskontro.sumRow': 'Total',
  'reports.reskontro.empty': 'No outstanding invoices.',
  'reports.reskontro.apNote': 'A supplier ledger arrives once supplier invoices are in place.',
  // Aging buckets
  'reports.aging.current': 'Not due',
  'reports.aging.d1_30': '1–30 days',
  'reports.aging.d31_60': '31–60 days',
  'reports.aging.d61_90': '61–90 days',
  'reports.aging.d90plus': 'Over 90 days',
  // Liquidity
  'reports.likviditet.title': 'Liquidity',
  'reports.likviditet.intro': 'What you have available right now.',
  'reports.likviditet.cash': 'Cash and bank',
  'reports.likviditet.receivables': 'Outstanding from customers',
  'reports.likviditet.payables': 'Owed to suppliers',
  'reports.likviditet.projected': 'Projected position',
  'reports.likviditet.caption': 'Liquid accounts (account 19xx).',
  'reports.likviditet.empty': 'No liquid funds recorded yet.',

  // ── Purchases — supplier invoices (build-spec §8.5) ──────────────────────────────────────────────
  'purchases.title': 'Purchases and supplier invoices',
  'purchases.intro': 'Supplier invoices you have received. Enter them and post them.',
  'purchases.new': 'New supplier invoice',
  'purchases.back': 'Back to the company',
  'purchases.empty.body': 'You have no supplier invoices yet. Enter the first one.',
  'purchases.listCaption': '{count} supplier invoices.',
  'purchases.col.supplier': 'Supplier',
  'purchases.col.number': 'Invoice no.',
  'purchases.col.status': 'Status',
  'purchases.col.date': 'Date',
  'purchases.col.due': 'Due',
  'purchases.col.total': 'Total',
  'purchases.status.draft': 'Draft',
  'purchases.status.posted': 'Posted',

  // Document form (create + edit share these).
  'purchases.form.newTitle': 'New supplier invoice',
  'purchases.form.editTitle': 'Edit draft',
  'purchases.form.intro':
    'Enter the supplier and the lines. You can save as a draft and post when ready.',
  'purchases.form.supplierLegend': 'Supplier',
  'purchases.form.supplierPicker': 'Fetch from contacts',
  'purchases.form.supplierPickerHint': 'Pick a supplier to prefill name and terms. Optional.',
  'purchases.form.supplierName': 'Supplier name',
  'purchases.form.supplierOrgNr': 'Organisation number',
  'purchases.form.invoiceNumber': "The supplier's invoice number",
  'purchases.form.kid': 'KID or payment reference',
  'purchases.form.currency': 'Currency',
  'purchases.form.invoiceDate': 'Invoice date',
  'purchases.form.dueDate': 'Due date',
  'purchases.form.notes': 'Note',
  'purchases.form.notesHint': 'Optional text on the document.',
  'purchases.form.linesLegend': 'Lines',
  'purchases.form.addLine': 'Add line',
  'purchases.form.removeLine': 'Remove line',
  'purchases.form.line.description': 'Description',
  'purchases.form.line.quantity': 'Quantity',
  'purchases.form.line.unit': 'Unit',
  'purchases.form.line.price': 'Price excl. VAT',
  'purchases.form.line.account': 'Cost account',
  'purchases.form.line.vat': 'VAT code',
  'purchases.form.line.deduction': 'Input VAT deduction',
  'purchases.form.deduction.full': 'Full deduction',
  'purchases.form.deduction.representasjon': 'Entertainment — no deduction',
  'purchases.form.deduction.restricted_vehicle': 'Passenger vehicle — no deduction',
  'purchases.form.deduction.private_use': 'Private use — no deduction',
  'purchases.form.noneOption': 'None',
  'purchases.form.chooseOption': 'Choose …',
  'purchases.form.totalsNet': 'Net',
  'purchases.form.totalsVat': 'VAT',
  'purchases.form.totalsGross': 'Total payable',
  'purchases.form.submitCreate': 'Save draft',
  'purchases.form.submitSave': 'Save changes',
  'purchases.form.errorInvalidInput': 'Check the fields and try again.',
  'purchases.error.output-code-not-a-purchase':
    'This VAT code is for sales, not purchases. Pick a purchase code.',
  'purchases.error.unknown-vat-code': 'Unknown VAT code on a line.',
  'purchases.error.not-a-draft':
    'Only drafts can be changed. A posted document is corrected with a reversal.',
  'purchases.error.missing-invoice-date': 'Set an invoice date before posting.',
  'purchases.error.rule-violation':
    'The entry did not pass validation. Check the lines and try again.',
  'purchases.error.generic': 'Something went wrong. Try again.',

  'purchases.detail.draftTitle': 'Supplier invoice (draft)',
  'purchases.detail.postedTitle': 'Supplier invoice',
  'purchases.detail.supplier': 'Supplier',
  'purchases.detail.invoiceNumber': 'Invoice number',
  'purchases.detail.date': 'Invoice date',
  'purchases.detail.due': 'Due',
  'purchases.detail.linesCaption': 'Lines on the invoice.',
  'purchases.detail.lineHeaderDescription': 'Description',
  'purchases.detail.lineHeaderAmount': 'Net',
  'purchases.detail.net': 'Net',
  'purchases.detail.vat': 'VAT',
  'purchases.detail.gross': 'Total',
  'purchases.detail.edit': 'Edit',
  'purchases.detail.postIntro':
    'When you post, the invoice is recorded in the books as accounts payable.',
  'purchases.detail.post': 'Post',
  'purchases.detail.posted': 'Posted',
  'purchases.detail.postedNote': 'The invoice is recorded. Correct it with a reversal if needed.',

  // ── Owner economy — drawings, outlays, mileage and subsistence (build-spec §8.5) ──────────────────
  'owner.new.title': 'Drawings and outlays',
  'owner.new.intro': 'Money between you and the company. It is posted right away.',
  'owner.new.kindLegend': 'What is it?',
  'owner.new.kind.drawing.label': 'Drawing',
  'owner.new.kind.drawing.desc': 'Money you take out of the company for private use.',
  'owner.new.kind.outlay.label': 'Outlay',
  'owner.new.kind.outlay.desc': 'A company cost you paid privately.',
  'owner.new.kind.mileage.label': 'Mileage allowance',
  'owner.new.kind.mileage.desc': 'Allowance for using your own car — a deduction, not payroll.',
  'owner.new.kind.diett.label': 'Subsistence',
  'owner.new.kind.diett.desc': 'Subsistence allowance while travelling — a deduction, not payroll.',
  'owner.new.amountLabel': 'Amount',
  'owner.new.amountHint':
    'The amount in kroner. For an outlay: excl. VAT when the company is VAT-registered.',
  'owner.new.confirmNote': 'The amount is posted as an entry against your equity.',
  'owner.new.submit': 'Post',
  'owner.new.cancel': 'Cancel',
  'owner.new.errorInvalidInput': 'Check the fields and try again.',
  'owner.new.errorGeneric': 'Something went wrong. Try again.',
} satisfies Record<MessageKey, string>;
