import { Link } from 'react-router';
import { MoneyText } from '~/components/money';
import {
  chargesOutputVat,
  formatKr,
  honestNumberFromLedger,
  isZeroØre,
  systemClock,
  ZERO,
} from '@saldo/domain';
import type { Route } from './+types/home';
import { db } from '~/db/client';
import { requireUser, withUserOrg } from '~/auth/auth.server';
import { listOrganizationsForUser } from '~/db/organizations.server';
import { aggregateLedger } from '~/db/ledger.server';
import { asMvaStatus } from '~/lib/org-format';
import { t } from '~/copy';
import { Card, CardContent } from '~/components/ui/card';
import { Companion, CompanionGuide } from '~/components/companion';
import { companionEnabled } from '~/lib/companion-preference.server';

export function meta() {
  return [{ title: t('app.name') }];
}

/** The reveal reads an org's ledger, which holds an ENK's financial data — keep it off any shared cache. */
export function headers() {
  return { 'Cache-Control': 'private, no-store' };
}

/**
 * Home is the honest-number reveal (experience-principles §6): "what's actually yours". It reads the
 * user's primary org's posted ledger for the current year through `withUserOrg` (membership proven) +
 * RLS, then composes the totals with the source-grounded tax estimate in the PURE domain. A persisted
 * active-org context is a separate task (`feat-org-active-context`); until then the alphabetically
 * first org is the primary, with a "switch business" link when there's more than one.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const companionOn = companionEnabled(request);
  const orgs = await listOrganizationsForUser(db, user.id);
  if (orgs.length === 0) return { kind: 'onboard' as const, companionOn };

  const primary = orgs[0]!;
  const year = systemClock.now().getFullYear();
  const status = asMvaStatus(primary.mvaStatus);
  const totals = await withUserOrg(request, primary.id, (tx) => aggregateLedger(tx, year));
  const reveal = honestNumberFromLedger(totals, year, status);

  return {
    kind: 'reveal' as const,
    companionOn,
    orgId: primary.id,
    orgName: primary.name,
    otherOrgs: orgs.length - 1,
    year,
    isRegistered: chargesOutputVat(status),
    hasActivity: !isZeroØre(reveal.income),
    overcommitted: reveal.rawRemainder < ZERO,
    income: formatKr(reveal.income),
    vatHeld: formatKr(reveal.vatHeld),
    estimatedTax: formatKr(reveal.estimatedTax),
    spendable: formatKr(reveal.spendable),
  };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  if (loaderData.kind === 'onboard') {
    return (
      <main className="mx-auto grid max-w-xl gap-6 p-6 sm:p-10">
        <header className="grid gap-1">
          {/* First meeting: the companion greets, attentive — the copy beside it carries the meaning. */}
          {loaderData.companionOn && <Companion expression="attentive" size={64} />}
          <h1 className="font-serif text-3xl tracking-tight">{t('home.onboard.title')}</h1>
          <p className="text-muted-foreground">{t('home.onboard.body')}</p>
        </header>
        <Link
          to="/oppslag"
          className="bg-primary text-primary-foreground font-text inline-flex min-h-11 w-fit items-center rounded-md px-4 py-2 text-sm"
        >
          {t('home.onboard.cta')}
        </Link>
      </main>
    );
  }

  const { orgName, orgId, otherOrgs, year, isRegistered, hasActivity, overcommitted, companionOn } =
    loaderData;

  return (
    <main className="mx-auto grid max-w-xl gap-6 p-6 sm:p-10">
      <header className="flex items-center gap-4">
        {/* "You're caught up" embodied: the companion resting — the ambient all-clear (ADR 0058).
            It sits beside the heading, outside the money card: illustration never touches figures. */}
        {companionOn && hasActivity && <Companion expression="resting" size={64} />}
        <div className="grid gap-1">
          <p className="font-text text-muted-foreground text-sm">{orgName}</p>
          <h1 className="font-serif text-3xl tracking-tight">{t('home.heading')}</h1>
          <p className="text-muted-foreground">{t('home.subhead')}</p>
        </div>
      </header>

      {hasActivity ? (
        <Card>
          <CardContent className="grid gap-6 pt-6">
            <h2 className="font-text text-muted-foreground text-sm">{t('home.reveal.heading')}</h2>

            {/* The earned peak: the spendable figure in Fraunces (display), framed as permission. */}
            <div className="grid gap-1">
              <p className="font-text text-muted-foreground text-sm">
                {t('home.reveal.spendableLabel')}
              </p>
              <p className="tabular font-serif text-4xl tracking-tight sm:text-5xl">
                <MoneyText value={loaderData.spendable} />
              </p>
              <p className="text-muted-foreground text-sm">
                {t('home.reveal.spendableHelp', { year })}
              </p>
            </div>

            {/* How we got there: of what came in, what isn't yours to spend. */}
            <dl className="grid gap-2 border-t pt-4 text-sm">
              <Row label={t('home.reveal.incomeLabel', { year })} value={loaderData.income} />
              {isRegistered && <Row label={t('home.reveal.vatLabel')} value={loaderData.vatHeld} />}
              <Row label={t('home.reveal.taxLabel')} value={loaderData.estimatedTax} />
            </dl>

            <p className="text-muted-foreground text-sm">{t('home.reveal.taxNote')}</p>
            {overcommitted && (
              <p
                role="note"
                className="bg-headsup text-headsup-foreground rounded-md px-3 py-2 text-sm"
              >
                {t('home.reveal.overcommitted')}
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="grid gap-3 pt-6">
            <h2 className="font-text text-lg">{t('home.empty.title')}</h2>
            {/* The companion guides the very first posting; dismissed, the same words stand alone. */}
            {companionOn ? (
              <CompanionGuide message={t('home.empty.body')} redirectTo="/" />
            ) : (
              <p className="text-muted-foreground text-sm">{t('home.empty.body')}</p>
            )}
            <Link
              to={`/orgs/${orgId}/vouchers/new`}
              className="bg-primary text-primary-foreground font-text inline-flex min-h-11 w-fit items-center rounded-md px-4 py-2 text-sm"
            >
              {t('home.empty.cta')}
            </Link>
          </CardContent>
        </Card>
      )}

      <nav aria-label={t('home.navLabel')} className="flex flex-wrap gap-4">
        <Link
          to={`/orgs/${orgId}/vouchers/new`}
          className="text-primary font-text inline-flex min-h-11 items-center text-sm underline-offset-4 hover:underline"
        >
          {t('home.recordCta')}
        </Link>
        <Link
          to={`/orgs/${orgId}/receipts/new`}
          className="text-primary font-text inline-flex min-h-11 items-center text-sm underline-offset-4 hover:underline"
        >
          {t('home.readReceiptCta')}
        </Link>
        <Link
          to={`/orgs/${orgId}`}
          className="text-primary font-text inline-flex min-h-11 items-center text-sm underline-offset-4 hover:underline"
        >
          {t('home.viewOrg')}
        </Link>
        {otherOrgs > 0 && (
          <Link
            to="/orgs"
            className="text-primary font-text inline-flex min-h-11 items-center text-sm underline-offset-4 hover:underline"
          >
            {t('home.switchOrg')}
          </Link>
        )}
      </nav>
    </main>
  );
}

/** One line of the "what isn't yours" breakdown: an event-framed label + a right-aligned figure. */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular">
        <MoneyText value={value} />
      </dd>
    </div>
  );
}
