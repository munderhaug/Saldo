/**
 * MVA-melding (VAT return) — the per-year preview (build-spec §8.8, feat-mva-melding). The loader
 * aggregates the posted ledger PER SAF-T VAT code (`aggregateVatByCode`) and runs the pure
 * `@saldo/domain` generator + grounded validator; the page shows the bottom line (to pay / to get back),
 * the specification lines, the local validation verdict, and a link to download the `mvaMeldingDto` XML.
 *
 * READ-ONLY over the ledger — it books nothing. Deterministic aggregation, **NOT an AI system** (EU AI
 * Act Recital 12) — no Art. 50 disclosure. Filing to the authorities is a §5.5 sober act, so this surface
 * is plain and calm. Two explicit outbound steps, both fail-closed and never silent loader calls:
 * "Valider hos Skatteetaten" (read-only check, wire-skatteetaten-validation) and **"Send inn via
 * Altinn"** (feat-altinn-mva-submission, ADR 0063) — the filing itself, explicit-confirm only,
 * recorded to the append-only `mva_filing` table + the audit trail in one tenant transaction.
 * The MVA-status fork decides whether a melding exists at all. Off any shared cache (financial data).
 */
import { Form, Link } from 'react-router';
import { Money } from '~/components/money';
import { z } from 'zod';
import {
  ANNUAL_TERM,
  buildMvaMeldingInnsendingXml,
  buildMvaMeldingXml,
  generateMvaMelding,
  termKey,
  validateMvaMelding,
  type MvaMeldingLine,
} from '@saldo/domain';
import type { Route } from './+types/orgs.$orgId.mva';
import { assertSameOrigin, withUserOrg } from '~/auth/auth.server';
import { aggregateVatByCode } from '~/db/mva-melding.server';
import { readOrgOverview } from '~/db/organizations.server';
import { validateMeldingWithSkatteetaten } from '~/integrations/skatteetaten/validation-client.server';
import {
  completeMeldingInstance,
  openMeldingInstance,
} from '~/integrations/altinn/instance-client.server';
import { listMvaFilings, recordMvaFiling } from '~/db/mva-filing.server';
import { recordAuditEvent } from '~/db/audit.server';
import { sql } from 'drizzle-orm';
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
    filings: await listMvaFilings(tx, year),
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
    filings: data.filings.map((f) => ({ id: f.id, submittedAt: f.createdAt.slice(0, 10) })),
  };
}

/**
 * Two explicit acts, chosen by `intent`. "Valider hos Skatteetaten" (default) — regenerates the
 * melding XML (identical to the download) and submits it to the read-only validation API.
 * "Send inn via Altinn" (`intent=submit`, §5.5) — the FILING: the same regenerated XML plus the
 * `mvaMeldingInnsending` envelope drive the captured Altinn 3 instance sequence; on success the
 * filing record and its audit attribution commit in one tenant transaction. Both clients are
 * fail-closed and map every expected failure to a typed reason — this action never throws on
 * integration trouble. A locally invalid melding is never submitted.
 */
type MvaActionData =
  | {
      intent: 'validate';
      status:
        | 'approved'
        | 'not-configured'
        | 'auth-failed'
        | 'rate-limited'
        | 'error'
        | 'invalid-response';
    }
  | { intent: 'validate'; status: 'deviations'; deviations: string }
  | {
      intent: 'submit';
      status:
        | 'submitted'
        | 'already-filed'
        | 'invalid-locally'
        | 'not-configured'
        | 'auth-failed'
        | 'rejected'
        | 'error'
        | 'invalid-response';
    };

export async function action({ request, params }: Route.ActionArgs): Promise<MvaActionData> {
  assertSameOrigin(request);
  if (!z.string().uuid().safeParse(params.orgId).success) {
    throw new Response('Not found', { status: 404 });
  }
  const form = await request.formData();
  const parsedYear = reportYearSchema.safeParse(form.get('year'));
  if (!parsedYear.success) throw new Response('Bad request', { status: 400 });
  const year = parsedYear.data;
  const intent = form.get('intent') === 'submit' ? 'submit' : 'validate';

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

  if (intent === 'submit') {
    // Never file a melding the grounded local validator rejects.
    const local = validateMvaMelding(result.melding, STANDARD_TAX_CODE_INDEX);
    if (!local.ok) return { intent, status: 'invalid-locally' as const };

    const orgNr = data.overview.org.orgNr;
    const term = termKey(ANNUAL_TERM);
    // Re-filing (a korrigert melding) is legitimate but must be a DELIBERATE second act: the form
    // sends refile=true only when the screen already showed the existing filings.
    const refile = form.get('refile') === 'true';

    // Phase 1 under an org+year+term advisory lock (integration-audit 2026-07-05 #1/#2): concurrent
    // submits serialize here, a duplicate becomes `already-filed`, and the filing pointer + its
    // audit attribution COMMIT before the consequential confirm phase — a filing can never end up
    // unrecorded past the instance-creation instant.
    const lockKey = `mva-filing:${params.orgId}:${String(year)}:${term}`;
    const opened = await withUserOrg(request, params.orgId, async (tx, { user }) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
      const existing = await listMvaFilings(tx, year);
      if (existing.some((f) => f.term === term) && !refile) {
        return { kind: 'already-filed' as const };
      }
      const instance = await openMeldingInstance(orgNr);
      if (!instance.ok) return { kind: 'failed' as const, reason: instance.reason };
      const filingId = await recordMvaFiling(tx, {
        organizationId: params.orgId,
        year,
        term,
        altinnPartyId: instance.partyId,
        altinnInstanceId: instance.instanceGuid,
      });
      await recordAuditEvent(tx, {
        organizationId: params.orgId,
        actorUserId: user.id,
        action: 'mva_filing.submitted',
        entityId: filingId,
      });
      return { kind: 'opened' as const, handle: instance.handle };
    });
    if (opened.kind === 'already-filed') return { intent, status: 'already-filed' as const };
    if (opened.kind === 'failed') return { intent, status: opened.reason };

    // Phase 2 — outside the tx: the record already exists; a failure here leaves it as the honest
    // trace of the interrupted attempt (the instance keeps living at Altinn).
    const done = await completeMeldingInstance({
      handle: opened.handle,
      meldingXml: xml,
      innsendingXml: buildMvaMeldingInnsendingXml({
        orgNr,
        year,
        term: ANNUAL_TERM,
        opprettetAv: 'Saldo',
      }),
    });
    if (!done.ok) return { intent, status: done.reason };
    return { intent, status: 'submitted' as const };
  }

  const verdict = await validateMeldingWithSkatteetaten(xml);
  if (!verdict.ok) return { intent, status: verdict.reason };
  return verdict.approved
    ? { intent, status: 'approved' as const }
    : { intent, status: 'deviations' as const, deviations: verdict.deviations };
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
    filings: readonly { id: string; submittedAt: string }[];
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
            verdict.intent !== 'submit' &&
            (verdict.status === 'deviations'
              ? t('mva.skatteetaten.deviations', { deviations: verdict.deviations })
              : t(`mva.skatteetaten.${verdict.status}`))}
        </p>
      </section>

      {/* Filing IS the §5.5 act — plain copy, explicit click, the record shown without flourish. */}
      <section
        aria-labelledby="mva-altinn"
        className="border-border grid gap-2 rounded-lg border p-4"
      >
        <h2 id="mva-altinn" className="font-text text-sm">
          {t('mva.altinn.heading')}
        </h2>
        <p className="text-muted-foreground text-sm">{t('mva.altinn.note')}</p>
        {data.filings.length > 0 && (
          <ul className="grid gap-1 text-sm">
            {data.filings.map((f) => (
              <li key={f.id}>{t('mva.altinn.filed', { date: f.submittedAt })}</li>
            ))}
          </ul>
        )}
        <Form method="post">
          <input type="hidden" name="year" value={year} />
          <input type="hidden" name="intent" value="submit" />
          {/* The screen has shown the existing filings above, so this click IS the deliberate
              re-file confirm the server requires (refile=true) once a filing exists. */}
          {data.filings.length > 0 && <input type="hidden" name="refile" value="true" />}
          <SubmitButton className="border-border font-text inline-flex min-h-11 w-fit items-center rounded-md border px-4 py-2 text-sm">
            {data.filings.length > 0 ? t('mva.altinn.refileSubmit') : t('mva.altinn.submit')}
          </SubmitButton>
        </Form>
        <p role="status" className="text-sm">
          {verdict && verdict.intent === 'submit' && t(`mva.altinn.${verdict.status}`)}
        </p>
      </section>
    </>
  );
}
