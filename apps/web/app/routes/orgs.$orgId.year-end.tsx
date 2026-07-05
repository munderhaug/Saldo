/**
 * Year-end close (årsavslutning, feat-year-end-close / ADR 0064 — build-spec §8.6 + §8.10). The
 * loader derives the year's figures read-only: the resultat summary, the næringsinntekt that feeds
 * the skattemelding (beregnet personinntekt basis under ADR 0029's stated assumptions), and the tax
 * set-aside estimate when the year's rates are captured. The action performs the close — a §5.5
 * consequential act (explicit confirm, sober copy): ONE `year_end` voucher empties the result side
 * into equity and the period locks, in one tenant transaction, attributed in the audit trail.
 *
 * Deterministic derivation + posting — NOT an AI system (Recital 12). Off any shared cache
 * (financial data). The checklist is guidance, not enforcement: the user stays in control.
 */
import { Form, Link } from 'react-router';
import { z } from 'zod';
import {
  buildResultat,
  estimateEnkIncomeTax,
  isClosedByYearEnd,
  systemClock,
  ZERO,
  type Øre,
} from '@saldo/domain';
import type { Route } from './+types/orgs.$orgId.year-end';
import { assertSameOrigin, withUserOrg } from '~/auth/auth.server';
import { aggregateAccountBalances } from '~/db/reporting.server';
import { readOrgOverview } from '~/db/organizations.server';
import { closeYear, isYearClosed } from '~/db/year-end.server';
import { recordAuditEvent } from '~/db/audit.server';
import { reportYearSchema } from '~/contracts';
import { resolveYear } from '~/lib/fiscal-year';
import { Money } from '~/components/money';
import { SubmitButton } from '~/components/ui/submit-button';
import { t } from '~/copy';

export function meta() {
  return [{ title: t('yearEnd.title') }];
}

/** Figures + org identity are financial data; keep the page off any shared cache. */
export function headers() {
  return { 'Cache-Control': 'private, no-store' };
}

/** The tax set-aside for the year's profit, or null when the year's rates are not captured. */
function taxEstimateOre(profit: Øre, year: number): number | null {
  if (profit <= ZERO) return 0;
  try {
    return estimateEnkIncomeTax(profit, year).total as number;
  } catch {
    return null; // fail-closed params (ADR 0029) — show "not captured" rather than a guess
  }
}

export async function loader({ request, params }: Route.LoaderArgs) {
  if (!z.string().uuid().safeParse(params.orgId).success) {
    throw new Response('Not found', { status: 404 });
  }
  const year = resolveYear(request);

  const data = await withUserOrg(request, params.orgId, async (tx) => ({
    overview: await readOrgOverview(tx, params.orgId),
    balances: await aggregateAccountBalances(tx, year, { excludeYearEnd: true }),
    closed: await isYearClosed(tx, year),
  }));
  if (!data.overview) throw new Response('Not found', { status: 404 });

  const resultat = buildResultat(data.balances);
  const profit = resultat.aarsresultatØre;
  return {
    orgId: params.orgId,
    year,
    closed: data.closed,
    yearOver: year < systemClock.now().getFullYear(),
    inntekterOre: resultat.driftsinntekterØre as number,
    kostnaderOre: resultat.driftskostnaderØre as number,
    resultatOre: profit as number,
    taxOre: taxEstimateOre(profit, year),
    // Only closable (result-side) activity offers the close — a balance-only year has nothing to
    // close and gets the honest empty message instead of a button that would refuse.
    hasActivity: data.balances.some(
      (b) => isClosedByYearEnd(b.number) && (b.debitØre as number) !== (b.creditØre as number),
    ),
  };
}

type YearEndActionData = {
  status: 'closed' | 'already-closed' | 'nothing-to-close' | 'year-not-over' | 'error';
};

/** The close — §5.5: explicit confirm; the voucher + the lock + the attribution in one tx. */
export async function action({ request, params }: Route.ActionArgs): Promise<YearEndActionData> {
  assertSameOrigin(request);
  if (!z.string().uuid().safeParse(params.orgId).success) {
    throw new Response('Not found', { status: 404 });
  }
  const form = await request.formData();
  const parsedYear = reportYearSchema.safeParse(form.get('year'));
  if (!parsedYear.success) throw new Response('Bad request', { status: 400 });
  const year = parsedYear.data;

  // A year can only be closed once it is over — the ledger keeps receiving postings until then.
  if (year >= systemClock.now().getFullYear()) return { status: 'year-not-over' };

  const result = await withUserOrg(request, params.orgId, async (tx, { user }) => {
    const closed = await closeYear(tx, params.orgId, year);
    if (closed.ok) {
      // Sporbarhet (ADR 0062): the closing voucher is attributed like every consequential post.
      await recordAuditEvent(tx, {
        organizationId: params.orgId,
        actorUserId: user.id,
        action: 'voucher.posted',
        entityId: closed.voucherId,
      });
    }
    return closed;
  });

  if (result.ok) return { status: 'closed' };
  if (result.reason === 'already-closed' || result.reason === 'nothing-to-close') {
    return { status: result.reason };
  }
  return { status: 'error' };
}

const CHECKLIST_KEYS = ['bank', 'receipts', 'mva'] as const;

export default function YearEndRoute({ loaderData, actionData }: Route.ComponentProps) {
  const { orgId, year, closed, yearOver, hasActivity } = loaderData;
  const isClosed = closed || actionData?.status === 'closed';

  return (
    <main className="mx-auto grid max-w-3xl gap-6 p-6 sm:p-10">
      <header className="grid gap-1">
        <h1 className="font-serif text-3xl tracking-tight">{t('yearEnd.title')}</h1>
        <p className="text-muted-foreground text-sm">{t('yearEnd.period', { year })}</p>
      </header>

      <p className="text-muted-foreground text-sm">{t('yearEnd.intro')}</p>

      <section
        aria-labelledby="year-end-figures"
        className="border-border grid gap-2 rounded-lg border p-4"
      >
        <h2 id="year-end-figures" className="text-muted-foreground text-sm">
          {t('yearEnd.figures.heading')}
        </h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
          <dt className="text-muted-foreground">{t('yearEnd.figures.income')}</dt>
          <dd className="tabular text-right">
            <Money ore={loaderData.inntekterOre} />
          </dd>
          <dt className="text-muted-foreground">{t('yearEnd.figures.costs')}</dt>
          <dd className="tabular text-right">
            <Money ore={loaderData.kostnaderOre} />
          </dd>
          <dt className="text-muted-foreground">{t('yearEnd.figures.result')}</dt>
          <dd className="tabular text-right">
            <Money ore={loaderData.resultatOre} />
          </dd>
          <dt className="text-muted-foreground">{t('yearEnd.figures.taxEstimate')}</dt>
          <dd className="tabular text-right">
            {loaderData.taxOre === null ? (
              t('yearEnd.figures.taxNotCaptured')
            ) : (
              <Money ore={loaderData.taxOre} />
            )}
          </dd>
        </dl>
        <p className="text-muted-foreground text-sm">{t('yearEnd.figures.note')}</p>
      </section>

      <section
        aria-labelledby="year-end-checklist"
        className="border-border grid gap-2 rounded-lg border p-4"
      >
        <h2 id="year-end-checklist" className="text-muted-foreground text-sm">
          {t('yearEnd.checklist.heading')}
        </h2>
        <ul className="grid list-disc gap-1 pl-5 text-sm">
          {CHECKLIST_KEYS.map((key) => (
            <li key={key}>{t(`yearEnd.checklist.${key}`)}</li>
          ))}
        </ul>
      </section>

      {/* The close IS the §5.5 act — plain copy, explicit click, no flourish. */}
      <section
        aria-labelledby="year-end-close"
        className="border-border grid gap-2 rounded-lg border p-4"
      >
        <h2 id="year-end-close" className="font-text text-sm">
          {t('yearEnd.close.heading')}
        </h2>
        {isClosed ? (
          <p role="status" className="text-sm">
            {t('yearEnd.close.isClosed')}
          </p>
        ) : !yearOver ? (
          <p className="text-muted-foreground text-sm">{t('yearEnd.close.yearNotOver')}</p>
        ) : !hasActivity ? (
          <p className="text-muted-foreground text-sm">{t('yearEnd.close.nothingToClose')}</p>
        ) : (
          <>
            <p className="text-muted-foreground text-sm">{t('yearEnd.close.note')}</p>
            <Form method="post">
              <input type="hidden" name="year" value={year} />
              <SubmitButton className="border-border font-text inline-flex min-h-11 w-fit items-center rounded-md border px-4 py-2 text-sm">
                {t('yearEnd.close.confirm', { year })}
              </SubmitButton>
            </Form>
            <p role="status" className="text-sm">
              {actionData &&
                actionData.status !== 'closed' &&
                t(`yearEnd.close.${actionData.status}`)}
            </p>
          </>
        )}
      </section>

      <p>
        <Link to={`/orgs/${orgId}/reports`} className="text-sm underline underline-offset-4">
          {t('yearEnd.back')}
        </Link>
      </p>
    </main>
  );
}
