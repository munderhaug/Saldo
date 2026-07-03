import { Form, Link, useSearchParams } from 'react-router';
import { isValidOrgNr, orgNr } from '@saldo/domain';
import type { Route } from './+types/oppslag';
import { nameSearchInput, type Enhet } from '~/contracts';
import { lookupByOrgNr, searchByName } from '~/integrations/enhetsregisteret/client.server';
import {
  callerKey,
  checkLookupRate,
  getCachedLookup,
  setCachedLookup,
} from '~/integrations/enhetsregisteret/throttle.server';
import { t } from '~/copy';
import { Card, CardContent, CardDescription, CardHeader } from '~/components/ui/card';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';
import { SubmitButton } from '~/components/ui/submit-button';

export function meta() {
  return [{ title: t('oppslag.title') }];
}

/**
 * Responses can carry an ENK's name/address (personal data). Forbid any shared/edge cache from
 * retaining it (GDPR residency). A proper EU-resident, rate-limited lookup cache is a separate task.
 */
export function headers() {
  return { 'Cache-Control': 'private, no-store' };
}

/**
 * One search box, two intents: a 9-digit query is treated as an org number (mod11-checked here, then
 * looked up); anything else is a free-text name search. The register is authoritative, public data —
 * no auth gate (this runs before onboarding) and no AI is involved. Because it is unauthenticated and
 * proxies to brreg, it is guarded by a short-TTL cache + a per-caller outbound rate limit so it can't
 * be abused as an open amplification/enumeration proxy (review 2026-06-28).
 */
export async function loader({ request }: Route.LoaderArgs) {
  const q = (new URL(request.url).searchParams.get('q') ?? '').trim();
  if (!q) return { state: 'idle' as const };

  // A fresh cached result is served without touching the register or spending the rate budget.
  const cached = getCachedLookup<OppslagResult>(q);
  if (cached) return cached;

  if (!checkLookupRate(callerKey(request)).allowed) return { state: 'rate-limited' as const };

  const result = await resolveLookup(q);
  // Cache stable outcomes only — never cache a transient upstream failure.
  if (result.state !== 'error') setCachedLookup(q, result);
  return result;
}

type OppslagResult = Awaited<ReturnType<typeof resolveLookup>>;

/** Resolve a query against the register: a 9-digit input is an org-number lookup, else a name search. */
async function resolveLookup(q: string) {
  const digits = q.replace(/\s/g, '');
  if (/^\d{9}$/.test(digits)) {
    if (!isValidOrgNr(digits)) return { state: 'invalid-orgnr' as const };
    const res = await lookupByOrgNr(orgNr(digits));
    if (res.ok) return { state: 'org' as const, enhet: res.enhet };
    if (res.reason === 'not-found')
      return { state: 'not-found' as const, orgnr: formatOrgNr(digits) };
    // An upstream brreg 429 surfaces the same calm "busy" message as our own outbound throttle.
    if (res.reason === 'rate-limited') return { state: 'rate-limited' as const };
    return { state: 'error' as const };
  }

  const parsed = nameSearchInput.safeParse(q);
  if (!parsed.success) return { state: 'too-short' as const };
  const res = await searchByName(parsed.data);
  if (!res.ok && res.reason === 'rate-limited') return { state: 'rate-limited' as const };
  if (!res.ok) return { state: 'error' as const };
  if (res.matches.length === 0) return { state: 'no-matches' as const, query: q };
  return {
    state: 'matches' as const,
    matches: res.matches,
    total: res.total,
    shown: res.matches.length,
    query: q,
  };
}

export default function Oppslag({ loaderData }: Route.ComponentProps) {
  const [searchParams] = useSearchParams();
  return (
    <main className="mx-auto grid max-w-2xl gap-6 p-6 sm:p-10">
      <header className="grid gap-1">
        <h1 className="font-serif text-3xl tracking-tight">{t('oppslag.title')}</h1>
        <p className="text-muted-foreground">{t('oppslag.intro')}</p>
      </header>

      <Form method="get" role="search" className="grid gap-2">
        <label htmlFor="q" className="font-text text-sm">
          {t('oppslag.label')}
        </label>
        <div className="flex gap-2">
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={searchParams.get('q') ?? ''}
            autoComplete="off"
            aria-describedby="q-hint"
            className="border-input bg-background flex-1 rounded-md border px-3 py-2 text-sm"
          />
          <SubmitButton
            className="bg-primary text-primary-foreground font-text rounded-md px-4 py-2 text-sm"
          >
            {t('oppslag.submit')}
          </SubmitButton>
        </div>
        <p id="q-hint" className="text-muted-foreground text-sm">
          {t('oppslag.hint')}
        </p>
      </Form>

      {/* Persistent polite live region so status text is announced on client-side nav, not only full loads. */}
      <div aria-live="polite" aria-atomic="true">
        <StatusNotice data={loaderData} />
      </div>
      <Results data={loaderData} />
    </main>
  );
}

/** Short textual feedback for the non-content states; lives inside the page's polite live region. */
function StatusNotice({ data }: { data: Route.ComponentProps['loaderData'] }) {
  switch (data.state) {
    case 'too-short':
      return <Notice tone="muted">{t('oppslag.tooShort')}</Notice>;
    case 'invalid-orgnr':
      return <Notice tone="muted">{t('oppslag.invalidOrgNr')}</Notice>;
    case 'not-found':
      return <Notice tone="muted">{t('oppslag.notFound', { orgnr: data.orgnr })}</Notice>;
    case 'no-matches':
      return <Notice tone="muted">{t('oppslag.noMatches', { query: data.query })}</Notice>;
    case 'error':
      return <Notice tone="headsup">{t('oppslag.error')}</Notice>;
    case 'rate-limited':
      return <Notice tone="headsup">{t('oppslag.rateLimited')}</Notice>;
    default:
      return null;
  }
}

/** The substantive result: a matches table, or one unit's detail card. */
function Results({ data }: { data: Route.ComponentProps['loaderData'] }) {
  if (data.state === 'matches')
    return <Matches matches={data.matches} total={data.total} shown={data.shown} />;
  if (data.state === 'org') return <OrgDetail enhet={data.enhet} />;
  return null;
}

/** A calm line of feedback. `headsup` adds an amber accent (the word still carries the meaning). */
function Notice({ tone, children }: { tone: 'muted' | 'headsup'; children: React.ReactNode }) {
  const className =
    tone === 'headsup' ? 'border-headsup border-l-4 pl-3 text-sm' : 'text-muted-foreground text-sm';
  return <p className={className}>{children}</p>;
}

function Matches({ matches, total, shown }: { matches: Enhet[]; total: number; shown: number }) {
  return (
    <Table>
      <TableCaption>{t('oppslag.matchesCount', { shown, total })}</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">{t('oppslag.col.name')}</TableHead>
          <TableHead scope="col">{t('oppslag.col.orgnr')}</TableHead>
          <TableHead scope="col">{t('oppslag.col.form')}</TableHead>
          <TableHead scope="col">{t('oppslag.col.place')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {matches.map((m) => (
          <TableRow key={m.organisasjonsnummer}>
            <TableCell>
              <Link to={`?q=${m.organisasjonsnummer}`} className="underline underline-offset-4">
                {m.navn}
              </Link>
            </TableCell>
            <TableCell className="tabular">{formatOrgNr(m.organisasjonsnummer)}</TableCell>
            <TableCell>{m.organisasjonsform.beskrivelse}</TableCell>
            <TableCell>{placeOf(m) ?? '—'}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function OrgDetail({ enhet }: { enhet: Enhet }) {
  const address = formatAddress(enhet.forretningsadresse ?? enhet.postadresse);
  const industry = enhet.naeringskode1
    ? `${enhet.naeringskode1.kode} ${enhet.naeringskode1.beskrivelse}`
    : null;
  return (
    <Card>
      <CardHeader>
        <h2 className="font-text text-2xl tracking-tight">{enhet.navn}</h2>
        <CardDescription>{enhet.organisasjonsform.beskrivelse}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <StatusFlags enhet={enhet} />
        <dl className="grid gap-3">
          <Field label={t('oppslag.field.orgnr')}>
            <span className="tabular">{formatOrgNr(enhet.organisasjonsnummer)}</span>
          </Field>
          <Field label={t('oppslag.field.form')}>{enhet.organisasjonsform.beskrivelse}</Field>
          {address && <Field label={t('oppslag.field.address')}>{address}</Field>}
          {industry && <Field label={t('oppslag.field.industry')}>{industry}</Field>}
          <Field label={t('oppslag.field.vat')}>{vatStatusLabel(enhet)}</Field>
        </dl>
        <Link
          to={`/orgs/new?orgnr=${enhet.organisasjonsnummer}`}
          className="bg-primary text-primary-foreground font-text inline-flex min-h-11 w-fit items-center rounded-md px-4 py-2 text-sm"
        >
          {t('oppslag.useThis')}
        </Link>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-3 sm:gap-4">
      <dt className="font-text text-muted-foreground text-sm">{label}</dt>
      <dd className="text-sm sm:col-span-2">{children}</dd>
    </div>
  );
}

/** Surfaces register flags that matter before onboarding (bankrupt / winding up / deleted). */
function StatusFlags({ enhet }: { enhet: Enhet }) {
  const flags: string[] = [];
  if (enhet.slettedato) flags.push(t('oppslag.status.slettet'));
  if (enhet.konkurs) flags.push(t('oppslag.status.konkurs'));
  if (enhet.underTvangsavviklingEllerTvangsopplosning)
    flags.push(t('oppslag.status.tvangsavvikling'));
  else if (enhet.underAvvikling) flags.push(t('oppslag.status.avvikling'));
  if (flags.length === 0) return null;
  return (
    <div className="grid gap-2">
      {flags.map((flag) => (
        <p key={flag} role="status" className="border-headsup border-l-4 pl-3 text-sm">
          {flag}
        </p>
      ))}
    </div>
  );
}

function vatStatusLabel(enhet: Enhet): string {
  if (enhet.registrertIMvaregisteret === true) return t('oppslag.vat.registered');
  if (enhet.registrertIMvaregisteret === false) return t('oppslag.vat.notRegistered');
  return t('oppslag.vat.unknown');
}

/** "923609016" → "923 609 016" (presentation only; the value stays 9 digits). */
function formatOrgNr(value: string): string {
  return value.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3');
}

function placeOf(enhet: Enhet): string | null {
  return enhet.forretningsadresse?.poststed ?? enhet.postadresse?.poststed ?? null;
}

function formatAddress(address: Enhet['forretningsadresse']): string | null {
  if (!address) return null;
  const lines = address.adresse?.filter(Boolean) ?? [];
  const city = [address.postnummer, address.poststed].filter(Boolean).join(' ');
  const parts = [...lines, city].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
}
