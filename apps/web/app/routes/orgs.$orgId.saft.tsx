/**
 * SAF-T Financial export — the per-year overview (build-spec §8 / Phase 8, feat-saft-export). The
 * loader reads the posted ledger (`readSaftFinancial`) and runs the pure `@saldo/domain` generator; the
 * page shows what the file contains (account + voucher counts), the local tie-out verdict, the balanced
 * totals, and a link to download the XSD-valid SAF-T XML.
 *
 * READ-ONLY over the ledger — it books nothing. Deterministic, **NOT an AI system** (EU AI Act Recital
 * 12) — no Art. 50 disclosure. Producing a compliance file is a sober act (§5.5), so the surface is
 * plain and calm. Off any shared cache (financial + personal data, EU-resident).
 */
import { Link } from 'react-router';
import { z } from 'zod';
import { formatKr, generateSaftFinancial, saftBalances, øre } from '@saldo/domain';
import type { Route } from './+types/orgs.$orgId.saft';
import { withUserOrg } from '~/auth/auth.server';
import { readOrgOverview } from '~/db/organizations.server';
import { readSaftFinancial } from '~/db/saft.server';
import { STANDARD_ACCOUNT_INDEX, STANDARD_TAX_CODE_INDEX } from '~/db/provisioning.server';
import { t } from '~/copy';

export function meta() {
  return [{ title: t('saft.title') }];
}

/** Figures + org identity are financial data; keep the page off any shared cache. */
export function headers() {
  return { 'Cache-Control': 'private, no-store' };
}

/** Resolve the fiscal year from `?year=` (4-digit), defaulting to the current year. */
function resolveYear(request: Request): number {
  const raw = new URL(request.url).searchParams.get('year');
  const parsed = z.coerce.number().int().min(2000).max(2100).safeParse(raw);
  return parsed.success ? parsed.data : new Date().getFullYear();
}

export async function loader({ request, params }: Route.LoaderArgs) {
  if (!z.string().uuid().safeParse(params.orgId).success) {
    throw new Response('Not found', { status: 404 });
  }
  const year = resolveYear(request);

  const data = await withUserOrg(request, params.orgId, async (tx) => ({
    overview: await readOrgOverview(tx, params.orgId),
    input: await readSaftFinancial(tx, year),
  }));
  if (!data.overview) throw new Response('Not found', { status: 404 });

  const model = generateSaftFinancial(
    data.input,
    { orgNr: data.overview.org.orgNr as never, name: data.overview.org.name, year },
    STANDARD_ACCOUNT_INDEX,
    STANDARD_TAX_CODE_INDEX,
  );

  return {
    orgId: params.orgId,
    year,
    accountCount: model.accounts.length,
    transactionCount: model.numberOfEntries,
    totalDebitOre: model.totalDebitØre as number,
    totalCreditOre: model.totalCreditØre as number,
    tieOut: saftBalances(model),
  };
}

const kr = (ore: number): string => formatKr(øre(ore));

export default function SaftExportRoute({ loaderData }: Route.ComponentProps) {
  const { orgId, year, accountCount, transactionCount, totalDebitOre, totalCreditOre, tieOut } =
    loaderData;
  const empty = transactionCount === 0;

  return (
    <main className="mx-auto grid max-w-3xl gap-6 p-6 sm:p-10">
      <header className="grid gap-1">
        <h1 className="font-serif text-3xl tracking-tight">{t('saft.title')}</h1>
        <p className="text-muted-foreground text-sm">{t('saft.period', { year })}</p>
      </header>

      <p className="text-muted-foreground text-sm">{t('saft.intro')}</p>

      {empty ? (
        <p className="text-muted-foreground text-sm">{t('saft.empty')}</p>
      ) : (
        <>
          <section
            aria-labelledby="saft-summary"
            className="border-border grid gap-2 rounded-lg border p-4"
          >
            <h2 id="saft-summary" className="text-muted-foreground text-sm">
              {t('saft.summary', { accounts: accountCount, transactions: transactionCount })}
            </h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
              <dt className="text-muted-foreground">{t('saft.totalDebit')}</dt>
              <dd className="tabular text-right">
                {kr(totalDebitOre)} {t('common.currency')}
              </dd>
              <dt className="text-muted-foreground">{t('saft.totalCredit')}</dt>
              <dd className="tabular text-right">
                {kr(totalCreditOre)} {t('common.currency')}
              </dd>
            </dl>
          </section>

          <p role="status" className="text-sm">
            {tieOut ? t('saft.tieOut.ok') : t('saft.tieOut.fail')}
          </p>

          <p className="text-muted-foreground text-sm">{t('saft.note')}</p>
          <p>
            <a
              href={`/orgs/${orgId}/saft.xml?year=${year}`}
              className="text-sm underline underline-offset-4"
              download
            >
              {t('saft.downloadXml')}
            </a>
          </p>
        </>
      )}

      <p>
        <Link to={`/orgs/${orgId}`} className="text-sm underline underline-offset-4">
          {t('saft.back')}
        </Link>
      </p>
    </main>
  );
}
