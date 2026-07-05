/**
 * MVA-melding (VAT return) — the per-year preview (build-spec §8.8, feat-mva-melding). The loader
 * aggregates the posted ledger PER SAF-T VAT code (`aggregateVatByCode`) and runs the pure
 * `@saldo/domain` generator + grounded validator; the page shows the bottom line (to pay / to get back),
 * the specification lines, the local validation verdict, and a link to download the `mvaMeldingDto` XML.
 *
 * READ-ONLY over the ledger — it books nothing. Deterministic aggregation, **NOT an AI system** (EU AI
 * Act Recital 12) — no Art. 50 disclosure. Filing to the authorities is a §5.5 sober act, so this surface
 * is plain and calm; actual **submission** (Altinn 3 / ID-porten) is the separate
 * `feat-altinn-mva-submission` and is not offered here. The action is the one explicit outbound step:
 * "Valider hos Skatteetaten" sends the generated XML to the fail-closed validation client
 * (wire-skatteetaten-validation) — a read-only check, never a silent loader call, never a filing.
 * The MVA-status fork decides whether a melding exists at all. Off any shared cache (financial data).
 */
import { Form, Link } from 'react-router';
import { Money } from '~/components/money';
import { z } from 'zod';
import {
  ANNUAL_TERM,
  buildMvaMeldingXml,
  generateMvaMelding,
  validateMvaMelding,
  type MvaMeldingLine,
} from '@saldo/domain';
import type { Route } from './+types/orgs.$orgId.mva';
import { assertSameOrigin, withUserOrg } from '~/auth/auth.server';
import { aggregateVatByCode } from '~/db/mva-melding.server';
import { readOrgOverview } from '~/db/organizations.server';
import { validateMeldingWithSkatteetaten } from '~/integrations/skatteetaten/validation-client.server';
import { reportYearSchema } from '~/contracts';
import { resolveYear } from '~/lib/fiscal-year';
import { mvaSystemInfo } from '~/lib/mva-system-info.server';
import { SubmitButton } from '~/components/ui/submit-button';
import { kr } from '~/lib/money-format';
import { asMvaStatus } from '~/lib/org-format';
import { STANDARD_TAX_CODE_INDEX } from '~/db/provisioning.server';
import { t } from '~/copy';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';

export function meta() {
  return [{ title: t('mva.title') }];
}

/** Figures + org identity are financial data; keep the page off any shared cache. */
export function headers() {
  return { 'Cache-Control': 'private, no-store' };
}

export async function loader({ request, params }: Route.LoaderArgs) {
  if (!z.string().uuid().safeParse(params.orgId).success) {
    throw new Response('Not found', { status: 404 });
  }
  const year = resolveYear(request);

  const data = await withUserOrg(request, params.orgId, async (tx) => ({
    overview: await readOrgOverview(tx, params.orgId),
    aggregates: await aggregateVatByCode(tx, year),
  }));
  if (!data.overview) throw new Response('Not found', { status: 404 });

  const result = generateMvaMelding(
    data.aggregates,
    {
      orgNr: data.overview.org.orgNr as never,
      year,
      term: ANNUAL_TERM,
      mvaStatus: asMvaStatus(data.overview.org.mvaStatus),
    },
    STANDARD_TAX_CODE_INDEX,
  );

  if (!result.registered) {
    return { orgId: params.orgId, year, registered: false as const };
  }

  const validation = validateMvaMelding(result.melding, STANDARD_TAX_CODE_INDEX);
  return {
    orgId: params.orgId,
    year,
    registered: true as const,
    lines: result.melding.lines,
    fastsattOre: result.melding.fastsattØre as number,
    valid: validation.ok,
    violations: validation.violations.map((v) => v.rule),
  };
}

/**
 * Explicit "Valider hos Skatteetaten" — regenerates the melding XML (identical to the download) and
 * submits it to the validation API. Read-only and retryable; the fail-closed client maps every
 * expected failure to a typed reason, so this action never throws on integration trouble.
 */
export async function action({ request, params }: Route.ActionArgs) {
  assertSameOrigin(request);
  if (!z.string().uuid().safeParse(params.orgId).success) {
    throw new Response('Not found', { status: 404 });
  }
  const form = await request.formData();
  const parsedYear = reportYearSchema.safeParse(form.get('year'));
  if (!parsedYear.success) throw new Response('Bad request', { status: 400 });
  const year = parsedYear.data;

  const data = await withUserOrg(request, params.orgId, async (tx) => ({
    overview: await readOrgOverview(tx, params.orgId),
    aggregates: await aggregateVatByCode(tx, year),
  }));
  if (!data.overview) throw new Response('Not found', { status: 404 });

  const result = generateMvaMelding(
    data.aggregates,
    {
      orgNr: data.overview.org.orgNr as never,
      year,
      term: ANNUAL_TERM,
      mvaStatus: asMvaStatus(data.overview.org.mvaStatus),
    },
    STANDARD_TAX_CODE_INDEX,
  );
  if (!result.registered) throw new Response('Not found', { status: 404 });

  const xml = buildMvaMeldingXml(result.melding, mvaSystemInfo(params.orgId, year));
  const verdict = await validateMeldingWithSkatteetaten(xml);
  if (!verdict.ok) return { status: verdict.reason };
  return verdict.approved
    ? { status: 'approved' as const }
    : { status: 'deviations' as const, deviations: verdict.deviations };
}

/** The bottom-line label: positive fastsatt = to pay, negative = refund, zero = nothing to settle. */
function settlement(fastsattOre: number): { key: 'pay' | 'refund' | 'zero'; amountOre: number } {
  if (fastsattOre > 0) return { key: 'pay', amountOre: fastsattOre };
  if (fastsattOre < 0) return { key: 'refund', amountOre: -fastsattOre };
  return { key: 'zero', amountOre: 0 };
}

export default function MvaMeldingRoute({ loaderData, actionData }: Route.ComponentProps) {
  const { orgId, year } = loaderData;

  return (
    <main className="mx-auto grid max-w-3xl gap-6 p-6 sm:p-10">
      <header className="grid gap-1">
        <h1 className="font-serif text-3xl tracking-tight">{t('mva.title')}</h1>
        <p className="text-muted-foreground text-sm">{t('mva.period', { year })}</p>
      </header>

      {!loaderData.registered ? (
        <p className="text-muted-foreground text-sm">{t('mva.notRegistered')}</p>
      ) : (
        <MeldingView orgId={orgId} year={year} data={loaderData} verdict={actionData} />
      )}

      <p>
        <Link to={`/orgs/${orgId}`} className="text-sm underline underline-offset-4">
          {t('mva.back')}
        </Link>
      </p>
    </main>
  );
}

function MeldingView({
  orgId,
  year,
  data,
  verdict,
}: {
  orgId: string;
  year: number;
  data: {
    lines: readonly MvaMeldingLine[];
    fastsattOre: number;
    valid: boolean;
    violations: readonly string[];
  };
  verdict: Route.ComponentProps['actionData'];
}) {
  const s = settlement(data.fastsattOre);
  return (
    <>
      <section
        aria-labelledby="mva-bottomline"
        className="border-border grid gap-1 rounded-lg border p-4"
      >
        <h2 id="mva-bottomline" className="text-muted-foreground text-sm">
          {t(`mva.settlement.${s.key}`)}
        </h2>
        <p className="tabular text-2xl">
          <Money ore={s.amountOre} />
        </p>
      </section>

      <p role="status" className="text-sm">
        {data.valid ? t('mva.valid') : t('mva.invalid', { rules: data.violations.join(', ') })}
      </p>

      {data.lines.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('mva.empty')}</p>
      ) : (
        <Table>
          <TableCaption>{t('mva.listCaption', { count: data.lines.length })}</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{t('mva.col.code')}</TableHead>
              <TableHead scope="col" className="text-right">
                {t('mva.col.basis')}
              </TableHead>
              <TableHead scope="col" className="text-right">
                {t('mva.col.rate')}
              </TableHead>
              <TableHead scope="col" className="text-right">
                {t('mva.col.vat')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.lines.map((line) => (
              <TableRow key={line.mvaKode}>
                <TableCell className="align-top">{line.mvaKode}</TableCell>
                <TableCell className="tabular text-right align-top">
                  {line.grunnlagØre !== undefined ? kr(line.grunnlagØre as number) : '—'}
                </TableCell>
                <TableCell className="tabular text-right align-top">
                  {line.sats !== undefined ? `${line.sats} %` : '—'}
                </TableCell>
                <TableCell className="tabular text-right align-top">
                  {kr(line.merverdiavgiftØre as number)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <p className="text-muted-foreground text-sm">{t('mva.submitNote')}</p>
      <p>
        <a
          href={`/orgs/${orgId}/mva.xml?year=${year}`}
          className="text-sm underline underline-offset-4"
          download
        >
          {t('mva.downloadXml')}
        </a>
      </p>

      {/* Filing-adjacent → §5.5 sober: plain copy, explicit click, no flourish. */}
      <section
        aria-labelledby="mva-skatteetaten"
        className="border-border grid gap-2 rounded-lg border p-4"
      >
        <h2 id="mva-skatteetaten" className="font-text text-sm">
          {t('mva.skatteetaten.heading')}
        </h2>
        <p className="text-muted-foreground text-sm">{t('mva.skatteetaten.note')}</p>
        <Form method="post">
          <input type="hidden" name="year" value={year} />
          <SubmitButton className="border-border font-text inline-flex min-h-11 w-fit items-center rounded-md border px-4 py-2 text-sm">
            {t('mva.skatteetaten.validate')}
          </SubmitButton>
        </Form>
        <p role="status" className="text-sm">
          {verdict &&
            (verdict.status === 'deviations'
              ? t('mva.skatteetaten.deviations', { deviations: verdict.deviations })
              : t(`mva.skatteetaten.${verdict.status}`))}
        </p>
      </section>
    </>
  );
}
