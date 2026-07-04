/**
 * Receipt extraction — the first AI-system surface (feat-receipt-extraction, ADR 0035). A user uploads
 * a receipt/invoice image; a vision-LLM proposes a structured extraction that flows:
 *
 *   image → extractReceipt (OpenAI-compatible, ADR 0009) → Zod at the boundary (~/contracts)
 *         → mapExtractionToProposal (@saldo/domain) → a proposed voucher the human REVIEWS, edits,
 *         and explicitly confirms → recordManualVoucher (the EXISTING posting path, ADR 0034).
 *
 * AI proposes, the rules engine validates, a human confirms (ADR 0002) — the model never writes the
 * ledger. The proposal is disclosed as **AI-assisted at the first interaction** (EU AI Act Art. 50(1));
 * its provenance is carried in the contract (Art. 50(2)). The image is personal data
 * (`data-handling.md`): processed transiently in this action, never persisted, never logged.
 *
 * Two POST intents on one route: `extract` (image → reviewable proposal) and `confirm` (the human's
 * confirmed kind+amount → posted voucher). The confirm step reuses `manualVoucherInput` so the AI path
 * posts through exactly the same server-authoritative truth as the manual surface.
 */
import { useRef } from 'react';
import { TextField } from '~/components/form-field';
import { Form, Link, redirect, useSubmit } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import {
  formatIsoDate,
  chargesOutputVat,
  formatKr,
  mapExtractionToProposal,
  parseKroner,
  systemClock,
  type ProposedKind,
} from '@saldo/domain';
import type { Route } from './+types/orgs.$orgId.receipts.new';
import { assertSameOrigin, requireOrgAccess, withUserOrg } from '~/auth/auth.server';
import { createFixedWindowLimiter } from '~/lib/rate-limit';
import { extractReceipt } from '~/integrations/llm/client.server';
import { llmConfig } from '~/integrations/llm/config.server';
import { AiAssisted } from '~/components/ui/ai-assisted';
import { recordManualVoucher } from '~/db/posting.server';
import { aiProvenanceLogFields, recordAiProvenance } from '~/db/ai-provenance.server';
import { organization } from '~/db/schema';
import { requestLogger } from '~/observability/logger.server';
import { asMvaStatus } from '~/lib/org-format';
import {
  manualVoucherInput,
  receiptConfirmInput,
  VOUCHER_KINDS,
  type ManualVoucherInput,
} from '~/contracts';
import { t } from '~/copy';
import { SubmitButton } from '~/components/ui/submit-button';

export function meta() {
  return [{ title: t('receipts.new.title') }];
}

/** Receipt extraction touches personal/financial data; keep the page off any shared cache. */
export function headers() {
  return { 'Cache-Control': 'private, no-store' };
}

const orgIdSchema = z.string().uuid();
/** Receipts are small; cap the upload so a stray large file can't exhaust memory. */
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
/** Per-user cap on vision-LLM extractions: generous for a human filing receipts, a wall for a loop
 * burning the model budget. Single-process (like the login throttle); counted per attempt. */
const extractLimiter = createFixedWindowLimiter(10, 10 * 60_000);

interface ReviewProposal {
  readonly kind: ProposedKind;
  /** Pre-filled amount, formatted so `parseKroner` round-trips it at confirm. */
  readonly amount: string;
  readonly netFormatted: string;
  readonly vatFormatted: string;
  readonly supplier: string | null;
  readonly documentDate: string | null;
  readonly vatLooksStandard: boolean;
  readonly model: string;
  /** The pinned served model tag — carried to the durable provenance record (Art. 50(2), ADR 0037). */
  readonly modelVersion: string;
  readonly confidence: number;
}

type ActionData =
  | { readonly ok: false; readonly error: string; readonly review?: ReviewProposal }
  | { readonly ok: true; readonly review: ReviewProposal };

export async function loader({ request, params }: Route.LoaderArgs) {
  if (!orgIdSchema.safeParse(params.orgId).success) {
    throw new Response('Not found', { status: 404 });
  }
  const org = await withUserOrg(request, params.orgId, async (tx) => {
    const [row] = await tx
      .select({ name: organization.name, mvaStatus: organization.mvaStatus })
      .from(organization)
      .where(eq(organization.id, params.orgId))
      .limit(1);
    return row ?? null;
  });
  if (!org) throw new Response('Not found', { status: 404 });
  return {
    orgId: params.orgId,
    orgName: org.name,
    isRegistered: chargesOutputVat(asMvaStatus(org.mvaStatus)),
    // Whether the AI backend is configured here — gates the upload UI vs the calm "not switched on" path.
    available: llmConfig() !== null,
  };
}

export async function action({
  request,
  params,
}: Route.ActionArgs): Promise<ActionData | Response> {
  assertSameOrigin(request);
  if (!orgIdSchema.safeParse(params.orgId).success) {
    throw new Response('Not found', { status: 404 });
  }
  const form = await request.formData();
  const intent = form.get('intent');
  const str = (key: string): string => {
    const value = form.get(key);
    return typeof value === 'string' ? value.slice(0, 500) : '';
  };
  /** Rebuild the review card from the fields carried through the round-trip, so a FAILED confirm
   * re-renders the proposal (with the error) instead of dumping the user back at the upload step
   * with everything lost (review 2026-07-03 §13). Display-only strings — never posted. */
  const carriedReview = (): ReviewProposal | undefined => {
    if (str('model') === '' || str('amount') === '') return undefined;
    return {
      kind: (str('kind') === 'sale' ? 'sale' : 'expense') as ProposedKind,
      amount: str('amount'),
      netFormatted: str('netFormatted'),
      vatFormatted: str('vatFormatted'),
      supplier: str('supplier') === '' ? null : str('supplier'),
      documentDate: str('documentDate') === '' ? null : str('documentDate'),
      vatLooksStandard: str('vatLooksStandard') === 'true',
      model: str('model'),
      modelVersion: str('modelVersion'),
      confidence: Number.isFinite(Number(str('confidence'))) ? Number(str('confidence')) : 0,
    };
  };

  if (intent === 'confirm') {
    // This confirm path is AI-only, so the provenance carried through the review round-trip is REQUIRED
    // (re-validated, never trusted raw) — every confirmed AI post gets its durable Art. 50(2) record.
    const parsed = receiptConfirmInput.safeParse({
      kind: form.get('kind'),
      amount: form.get('amount'),
      aiAssisted: form.get('aiAssisted'),
      model: form.get('model'),
      modelVersion: form.get('modelVersion'),
      confidence: form.get('confidence'),
    });
    if (!parsed.success) {
      const review = carriedReview();
      return {
        ok: false,
        error: t('vouchers.new.errorInvalidInput'),
        ...(review ? { review } : {}),
      };
    }
    const net = parseKroner(parsed.data.amount)!; // passed the boundary's parseKroner refine
    const year = systemClock.now().getFullYear();
    // Post AND record provenance in ONE tenant transaction: the voucher and its provenance commit
    // atomically (AI never writes the ledger — the provenance sits ALONGSIDE the human-confirmed post,
    // ADR 0002/0037).
    const result = await withUserOrg(request, params.orgId, async (tx) => {
      const posted = await recordManualVoucher(tx, {
        organizationId: params.orgId,
        kind: parsed.data.kind,
        net,
        year,
      });
      if (!posted.ok) return posted;
      await recordAiProvenance(tx, {
        organizationId: params.orgId,
        voucherId: posted.voucherId,
        model: parsed.data.model,
        modelVersion: parsed.data.modelVersion,
        confidence: parsed.data.confidence,
      });
      return posted;
    });
    if (!result.ok) {
      return {
        ok: false,
        error:
          result.reason === 'vat-not-registered'
            ? t('vouchers.new.errorVatNotRegistered')
            : t('vouchers.new.errorGeneric'),
        ...(carriedReview() ? { review: carriedReview()! } : {}),
      };
    }
    // Structured provenance log (Art. 50(2) observability) — model/version/confidence + linkage ONLY,
    // never personal data (`aiProvenanceLogFields` is the single, tested definition of the log shape).
    requestLogger(request).log.info(
      aiProvenanceLogFields({
        organizationId: params.orgId,
        voucherId: result.voucherId,
        model: parsed.data.model,
        modelVersion: parsed.data.modelVersion,
        confidence: parsed.data.confidence,
      }),
      'AI-assisted voucher posted',
    );
    return redirect('/');
  }

  // Default intent: extract. AUTH FIRST — the vision-LLM call is the expensive resource, so prove the
  // caller is a logged-in member of this org (401→login / 403) before touching the upload, and bound
  // them per user (the confirm branch gets the same guarantee inside `withUserOrg`).
  const { user } = await requireOrgAccess(request, params.orgId);
  if (!extractLimiter.check(user.id, Date.now()).allowed) {
    return { ok: false, error: t('receipts.new.errorRateLimited') };
  }

  // Validate the upload, run the vision-LLM, map to a proposal.
  const file = form.get('receipt');
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: t('receipts.new.errorNoImage') };
  }
  if (!file.type.startsWith('image/')) {
    return { ok: false, error: t('receipts.new.errorImageType') };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, error: t('receipts.new.errorImageTooLarge') };
  }

  const extracted = await extractReceipt({
    bytes: new Uint8Array(await file.arrayBuffer()),
    mediaType: file.type,
  });
  if (!extracted.ok) {
    return {
      ok: false,
      error:
        extracted.reason === 'not-configured'
          ? t('receipts.new.unavailable')
          : t('receipts.new.errorRead'),
    };
  }

  const { extraction } = extracted;
  const mapped = mapExtractionToProposal({
    direction: extraction.direction,
    net: extraction.net,
    vat: extraction.vat,
    currency: extraction.currency,
  });
  if (!mapped.ok) {
    return {
      ok: false,
      error:
        mapped.reason === 'unsupported-currency'
          ? t('receipts.new.errorCurrency')
          : t('receipts.new.errorAmount'),
    };
  }

  const { proposal } = mapped;
  return {
    ok: true,
    review: {
      kind: proposal.kind,
      amount: formatKr(proposal.net),
      netFormatted: formatKr(proposal.net),
      vatFormatted: formatKr(extraction.vat),
      supplier: extraction.supplier,
      documentDate: extraction.documentDate,
      vatLooksStandard: proposal.vatLooksStandard,
      model: extraction.provenance.model,
      modelVersion: extraction.provenance.modelVersion,
      confidence: extraction.provenance.confidence,
    },
  };
}

export default function NewReceipt({ loaderData, actionData }: Route.ComponentProps) {
  const { orgId, orgName, isRegistered, available } = loaderData;
  const review = actionData
    ? actionData.ok
      ? actionData.review
      : (actionData.review ?? null)
    : null;
  const error = actionData && !actionData.ok ? actionData.error : null;

  return (
    <main className="mx-auto grid max-w-xl gap-6 p-6 sm:p-10">
      <header className="grid gap-1">
        <p className="font-text text-muted-foreground text-sm">{orgName}</p>
        <h1 className="font-text text-2xl tracking-tight">{t('receipts.new.title')}</h1>
        <p className="text-muted-foreground">{t('receipts.new.intro')}</p>
      </header>

      {!available ? (
        <div className="grid gap-3">
          <p className="text-muted-foreground text-sm">{t('receipts.new.unavailable')}</p>
          <Link
            to={`/orgs/${orgId}/vouchers/new`}
            className="bg-primary text-primary-foreground font-text inline-flex min-h-11 w-fit items-center rounded-md px-4 py-2 text-sm"
          >
            {t('receipts.new.unavailableCta')}
          </Link>
        </div>
      ) : review ? (
        <ReviewStep orgId={orgId} review={review} isRegistered={isRegistered} error={error} />
      ) : (
        <UploadStep orgId={orgId} error={error} />
      )}
    </main>
  );
}

function UploadStep({ orgId, error }: { orgId: string; error: string | null }) {
  return (
    <Form method="post" encType="multipart/form-data" className="grid gap-5">
      <div className="grid gap-1.5">
        <label htmlFor="receipt" className="font-text text-sm">
          {t('receipts.new.uploadLabel')}
        </label>
        <input
          id="receipt"
          name="receipt"
          type="file"
          accept="image/png,image/jpeg"
          required
          aria-describedby={error ? 'receipt-hint receipt-error' : 'receipt-hint'}
          aria-invalid={error ? true : undefined}
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
        />
        <p id="receipt-hint" className="text-muted-foreground text-sm">
          {t('receipts.new.uploadHint')}
        </p>
        {error && (
          <p id="receipt-error" role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <SubmitButton
          name="intent"
          value="extract"
          className="bg-primary text-primary-foreground font-text inline-flex min-h-11 items-center rounded-md px-4 py-2 text-sm"
        >
          {t('receipts.new.submit')}
        </SubmitButton>
        <Link
          to={`/orgs/${orgId}`}
          className="text-muted-foreground inline-flex min-h-11 items-center text-sm underline-offset-4 hover:underline"
        >
          {t('vouchers.new.cancel')}
        </Link>
      </div>
    </Form>
  );
}

function ReviewStep({
  orgId,
  review,
  isRegistered,
  error,
}: {
  orgId: string;
  review: ReviewProposal;
  isRegistered: boolean;
  error: string | null;
}) {
  // Confidence is a plain 0..1 ratio (not money) shown as a whole-percent — toFixed(0), no money helper.
  const confidencePct = `${(review.confidence * 100).toFixed(0)} %`;
  const submit = useSubmit();
  const formRef = useRef<HTMLFormElement>(null);
  // RHF drives inline validation over the SAME `manualVoucherInput` the action re-validates (the truth),
  // pre-filled from the AI proposal; the real <Form> stays server-authoritative (works without JS).
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ManualVoucherInput>({
    resolver: zodResolver(manualVoucherInput),
    mode: 'onTouched',
    defaultValues: { kind: review.kind, amount: review.amount },
  });
  const onValid = () => submit(formRef.current, { method: 'post' });
  return (
    <div className="grid gap-6">
      {/* Art. 50(1)+(2): the shared disclosure primitive (ADR 0036). `focusOnMount` moves focus here
          on the server round-trip, so keyboard/SR users land on the new, legally required content. */}
      <AiAssisted
        id="ai-disclosure"
        heading={t('receipts.new.reviewHeading')}
        disclosure={t('receipts.new.aiDisclosure')}
        provenance={t('receipts.new.aiProvenance', {
          model: review.model,
          confidence: confidencePct,
        })}
        focusOnMount
      >
        <dl className="grid gap-1 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{t('receipts.new.fieldSupplier')}</dt>
            <dd>{review.supplier ?? t('receipts.new.supplierUnknown')}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{t('receipts.new.fieldDate')}</dt>
            <dd className="tabular">
              {review.documentDate
                ? formatIsoDate(review.documentDate)
                : t('receipts.new.dateUnknown')}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{t('receipts.new.fieldNet')}</dt>
            <dd className="tabular">{review.netFormatted}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{t('receipts.new.fieldVat')}</dt>
            <dd className="tabular">{review.vatFormatted}</dd>
          </div>
        </dl>
        {!review.vatLooksStandard && (
          <p role="status" className="text-sm">
            {t('receipts.new.vatHeadsUp')}
          </p>
        )}
      </AiAssisted>

      <Form
        method="post"
        ref={formRef}
        onSubmit={(event) => void handleSubmit(onValid)(event)}
        className="grid gap-5"
      >
        {/* Programmatic submit drops the button's value, so the intent travels as a hidden field. */}
        <input type="hidden" name="intent" value="confirm" />
        {/* The AI provenance rides the review round-trip as hidden fields, re-validated at confirm and
            persisted as the durable Art. 50(2) record (ADR 0037). No personal data here — model/version/
            confidence only. `aiAssisted` carries the Art. 50(1) disclosure literal so the confirm cannot
            validate without it. */}
        <input type="hidden" name="aiAssisted" value="true" />
        <input type="hidden" name="model" value={review.model} />
        <input type="hidden" name="modelVersion" value={review.modelVersion} />
        <input type="hidden" name="confidence" value={review.confidence} />
        {/* Display-only fields ride along too, so a FAILED confirm can re-render this review card
            instead of losing the extraction (they are never part of the posted voucher). */}
        <input type="hidden" name="netFormatted" value={review.netFormatted} />
        <input type="hidden" name="vatFormatted" value={review.vatFormatted} />
        <input type="hidden" name="supplier" value={review.supplier ?? ''} />
        <input type="hidden" name="documentDate" value={review.documentDate ?? ''} />
        <input type="hidden" name="vatLooksStandard" value={String(review.vatLooksStandard)} />
        <p className="text-muted-foreground text-sm">{t('receipts.new.confirmIntro')}</p>
        <fieldset className="grid gap-3">
          <legend className="font-text text-sm">{t('vouchers.new.kindLegend')}</legend>
          {VOUCHER_KINDS.map((kind) => (
            <label key={kind} className="flex items-start gap-3">
              <input
                type="radio"
                value={kind}
                aria-describedby={
                  errors.kind ? `kind-${kind}-desc kind-error` : `kind-${kind}-desc`
                }
                className="mt-1"
                {...register('kind')}
              />
              <span className="grid gap-0.5">
                <span className="font-text text-sm">{t(`vouchers.new.kind.${kind}.label`)}</span>
                <span id={`kind-${kind}-desc`} className="text-muted-foreground text-sm">
                  {t(`vouchers.new.kind.${kind}.desc`)}
                </span>
              </span>
            </label>
          ))}
          {errors.kind && (
            <p id="kind-error" role="alert" className="text-destructive text-sm">
              {errors.kind.message}
            </p>
          )}
        </fieldset>

        <TextField
          id="amount"
          label={t('vouchers.new.amountLabel')}
          hint={
            isRegistered
              ? t('vouchers.new.amountHintRegistered')
              : t('vouchers.new.amountHintPlain')
          }
          error={errors.amount?.message}
          registration={register('amount')}
          inputMode="decimal"
          tabular
        />

        <p className="text-muted-foreground text-sm">{t('vouchers.new.confirmNote')}</p>

        {/* Server-side failure (a rare rule/chart block on confirm) — surfaced calmly, system owns it. */}
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-4">
          <SubmitButton className="bg-primary text-primary-foreground font-text inline-flex min-h-11 items-center rounded-md px-4 py-2 text-sm">
            {t('receipts.new.confirmSubmit')}
          </SubmitButton>
          <Link
            to={`/orgs/${orgId}/receipts/new`}
            className="text-muted-foreground inline-flex min-h-11 items-center text-sm underline-offset-4 hover:underline"
            reloadDocument
          >
            {t('receipts.new.startOver')}
          </Link>
        </div>
      </Form>
    </div>
  );
}
