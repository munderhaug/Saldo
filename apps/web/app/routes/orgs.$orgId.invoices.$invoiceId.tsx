import { Form, Link, redirect } from 'react-router';
import { z } from 'zod';
import {
  INVOICE_STATUSES,
  canTransition,
  chargesOutputVat,
  formatKr,
  type InvoiceStatus,
  øre,
} from '@saldo/domain';
import type { Route } from './+types/orgs.$orgId.invoices.$invoiceId';
import { assertSameOrigin, withUserOrg } from '~/auth/auth.server';
import { listAccountOptions } from '~/db/org-defaults.server';
import {
  createCreditNoteDraft,
  isInvoicePosted,
  issueInvoice,
  listCustomerOptions,
  listInvoiceVatCodeOptions,
  listProductLineOptions,
  readInvoice,
  readOrgMvaStatus,
  transitionInvoice,
  updateDraft,
} from '~/db/invoices.server';
import { invoiceInput, type InvoiceInput } from '~/contracts';
import { sendInvoiceEmail } from '~/documents/send-invoice.server';
import { invoiceFormToObject } from '~/lib/invoice-form-data';
import {
  invoiceKindLabel,
  invoiceNumberLabel,
  invoiceStatusBadgeClass,
  invoiceStatusLabel,
} from '~/lib/invoice-format';
import { InvoiceForm } from '~/components/invoice-form';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';
import { t } from '~/copy';

export function headers() {
  return { 'Cache-Control': 'private, no-store' };
}

/** today + n days, as an ISO calendar date (the action's small clock; the domain stays pure). */
function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function loader({ request, params }: Route.LoaderArgs) {
  if (
    !z.string().uuid().safeParse(params.orgId).success ||
    !z.string().uuid().safeParse(params.invoiceId).success
  ) {
    throw new Response('Not found', { status: 404 });
  }
  const data = await withUserOrg(request, params.orgId, async (tx) => {
    const invoice = await readInvoice(tx, params.invoiceId);
    if (!invoice) return null;
    const creditsNumber = invoice.creditsInvoiceId
      ? ((await readInvoice(tx, invoice.creditsInvoiceId))?.invoiceNumber ?? null)
      : null;
    return {
      invoice,
      creditsNumber,
      posted: invoice.status === 'draft' ? false : await isInvoicePosted(tx, params.invoiceId),
      status: await readOrgMvaStatus(tx),
      customers: await listCustomerOptions(tx),
      accounts: await listAccountOptions(tx),
      vatCodes: await listInvoiceVatCodeOptions(tx),
      products: await listProductLineOptions(tx),
    };
  });
  if (!data) throw new Response('Not found', { status: 404 });
  return { orgId: params.orgId, ...data, orgRegistered: chargesOutputVat(data.status) };
}

export async function action({ request, params }: Route.ActionArgs) {
  assertSameOrigin(request);
  if (
    !z.string().uuid().safeParse(params.orgId).success ||
    !z.string().uuid().safeParse(params.invoiceId).success
  ) {
    throw new Response('Not found', { status: 404 });
  }
  const form = await request.formData();
  const field = (key: string): string => {
    const value = form.get(key);
    return typeof value === 'string' ? value : '';
  };
  const intent = field('intent');
  const detailUrl = `/orgs/${params.orgId}/invoices/${params.invoiceId}`;

  if (intent === 'save') {
    const parsed = invoiceInput.safeParse(invoiceFormToObject(form));
    if (!parsed.success) return { error: t('invoices.form.errorInvalidInput') };
    const result = await withUserOrg(request, params.orgId, (tx) =>
      updateDraft(tx, params.orgId, params.invoiceId, parsed.data),
    );
    if (!result.ok) {
      return {
        error:
          result.error === 'not-a-draft'
            ? t('invoices.error.notADraft')
            : t(`invoices.error.${result.error}`),
      };
    }
    return redirect(detailUrl);
  }

  if (intent === 'issue') {
    const today = new Date().toISOString().slice(0, 10);
    const result = await withUserOrg(request, params.orgId, async (tx) => {
      const invoice = await readInvoice(tx, params.invoiceId);
      const issueDate = invoice?.issueDate ?? today;
      const dueDate = invoice?.dueDate ?? addDays(issueDate, 14);
      return issueInvoice(tx, params.orgId, params.invoiceId, { issueDate, dueDate });
    });
    if (!result.ok) {
      return {
        error:
          result.error === 'not-a-draft'
            ? t('invoices.error.notADraft')
            : t(`invoices.error.${result.error}`),
      };
    }
    return redirect(detailUrl);
  }

  if (intent === 'transition') {
    const to = z.enum(INVOICE_STATUSES).safeParse(field('to'));
    if (!to.success) return { error: t('invoices.form.errorInvalidInput') };
    await withUserOrg(request, params.orgId, (tx) =>
      transitionInvoice(tx, params.invoiceId, to.data),
    );
    return redirect(detailUrl);
  }

  if (intent === 'credit-note') {
    const id = await withUserOrg(request, params.orgId, (tx) =>
      createCreditNoteDraft(tx, params.orgId, params.invoiceId),
    );
    if (!id) return { error: t('invoices.error.creditNote') };
    return redirect(`/orgs/${params.orgId}/invoices/${id}`);
  }

  if (intent === 'send') {
    // §5.5 consequential act — the form's explicit "Send nå" click IS the active confirm (ADR 0002).
    const outcome = await sendInvoiceEmail(request, params.orgId, params.invoiceId);
    if (outcome.ok) return { success: t('invoices.detail.sendOk', { email: outcome.recipient }) };
    const reasonMessage: Record<Exclude<typeof outcome, { ok: true }>['reason'], string> = {
      'not-found': t('invoices.form.errorInvalidInput'),
      'no-recipient': t('invoices.detail.sendNoEmail'),
      'not-configured': t('invoices.detail.sendNotConfigured'),
      'send-failed': t('invoices.detail.sendError'),
    };
    return { error: reasonMessage[outcome.reason] };
  }

  return { error: t('invoices.form.errorInvalidInput') };
}

export default function InvoiceDetailRoute({ loaderData, actionData }: Route.ComponentProps) {
  const {
    orgId,
    invoice,
    creditsNumber,
    posted,
    customers,
    accounts,
    vatCodes,
    products,
    orgRegistered,
  } = loaderData;
  const accountLabel = new Map(accounts.map((a) => [a.id, `${a.number} — ${a.name}`]));
  const vatLabel = new Map(vatCodes.map((c) => [c.id, c.code]));
  const isDraft = invoice.status === 'draft';
  const errorMessage = actionData && 'error' in actionData ? actionData.error : undefined;
  const successMessage = actionData && 'success' in actionData ? actionData.success : undefined;

  const defaultValues: InvoiceInput = {
    kind: invoice.kind,
    customerId: invoice.customerId ?? '',
    customerName: invoice.customerName,
    customerEmail: invoice.customerEmail ?? '',
    customerOrgNr: invoice.customerOrgNr ?? '',
    customerAddress: invoice.customerAddress ?? '',
    currency: invoice.currency,
    language: invoice.language as InvoiceInput['language'],
    issueDate: invoice.issueDate ?? '',
    dueDate: invoice.dueDate ?? '',
    creditsInvoiceId: invoice.creditsInvoiceId ?? '',
    notes: invoice.notes ?? '',
    lines: invoice.lines.map((l) => ({
      productId: l.productId ?? '',
      description: l.description,
      quantity: l.quantity,
      unit: l.unit,
      unitPriceKr: formatKr(øre(l.unitPriceOre)),
      accountId: l.accountId,
      vatCodeId: l.vatCodeId,
    })),
  };

  return (
    <main className="mx-auto grid max-w-2xl gap-6 p-6 sm:p-10">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="font-serif text-3xl tracking-tight">
            {invoiceKindLabel(invoice.kind)} {invoiceNumberLabel(invoice.invoiceNumber)}
          </h1>
          {creditsNumber !== null && (
            <p className="text-muted-foreground text-sm">
              {t('invoices.detail.creditsInvoice', { number: creditsNumber })}
            </p>
          )}
        </div>
        <span className={invoiceStatusBadgeClass(invoice.status)}>
          {invoiceStatusLabel(invoice.status)}
        </span>
      </header>

      {errorMessage && (
        <p role="alert" className="text-destructive text-sm">
          {errorMessage}
        </p>
      )}
      {successMessage && (
        <p role="status" className="text-sm">
          {successMessage}
        </p>
      )}

      {isDraft ? (
        <>
          <InvoiceForm
            defaultValues={defaultValues}
            customers={customers}
            accounts={accounts}
            vatCodes={vatCodes}
            products={products}
            orgRegistered={orgRegistered}
            submitLabel={t('invoices.form.submitSave')}
            intent="save"
            error={undefined}
            lockKind
          />
          <section className="border-input grid gap-2 border-t pt-4">
            <p className="text-muted-foreground text-sm">{t('invoices.detail.issueNote')}</p>
            <Form method="post">
              <input type="hidden" name="intent" value="issue" />
              <button
                type="submit"
                className="bg-primary text-primary-foreground font-text inline-flex min-h-11 w-fit items-center rounded-md px-4 py-2 text-sm"
              >
                {t('invoices.detail.issue')}
              </button>
            </Form>
          </section>
        </>
      ) : (
        <ReadOnlyInvoice
          invoice={invoice}
          posted={posted}
          accountLabel={accountLabel}
          vatLabel={vatLabel}
        />
      )}

      {!isDraft && invoice.kind !== 'quote' && (
        <DeliverySection
          orgId={orgId}
          invoiceId={invoice.id}
          customerEmail={invoice.customerEmail}
        />
      )}

      {!isDraft && (
        <section className="flex flex-wrap gap-3" aria-label={t('invoices.detail.actionsLabel')}>
          {canTransition(invoice.status, 'sent') && (
            <LifecycleButton to="sent" label={t('invoices.detail.markSent')} />
          )}
          {canTransition(invoice.status, 'paid') && (
            <LifecycleButton to="paid" label={t('invoices.detail.markPaid')} />
          )}
          {invoice.kind === 'invoice' && (
            <Form method="post">
              <input type="hidden" name="intent" value="credit-note" />
              <button
                type="submit"
                className="border-input font-text inline-flex min-h-11 w-fit items-center rounded-md border px-4 py-2 text-sm"
              >
                {t('invoices.detail.createCreditNote')}
              </button>
            </Form>
          )}
        </section>
      )}

      <Link
        to={`/orgs/${orgId}/invoices`}
        className="text-primary font-text inline-flex min-h-11 w-fit items-center text-sm underline-offset-4 hover:underline"
      >
        {t('invoices.back')}
      </Link>
    </main>
  );
}

function DeliverySection({
  orgId,
  invoiceId,
  customerEmail,
}: {
  orgId: string;
  invoiceId: string;
  customerEmail: string | null;
}) {
  const base = `/orgs/${orgId}/invoices/${invoiceId}`;
  return (
    <section className="border-input grid gap-3 border-t pt-4" aria-labelledby="delivery-heading">
      <h2 id="delivery-heading" className="font-text text-sm">
        {t('invoices.detail.deliveryHeading')}
      </h2>
      <div className="flex flex-wrap gap-3">
        <a
          href={`${base}/pdf`}
          target="_blank"
          rel="noreferrer"
          className="border-input font-text inline-flex min-h-11 w-fit items-center rounded-md border px-4 py-2 text-sm"
        >
          {t('invoices.detail.downloadPdf')}
        </a>
        <a
          href={`${base}/ehf.xml`}
          download
          className="border-input font-text inline-flex min-h-11 w-fit items-center rounded-md border px-4 py-2 text-sm"
        >
          {t('invoices.detail.downloadEhf')}
        </a>
      </div>
      {/* Sending is a §5.5 act — plain, sober copy; the "Send" click is the explicit confirm. The
          explanation is linked to the button (aria-describedby) so it is announced in context. */}
      {customerEmail ? (
        <Form method="post" className="grid gap-2">
          <input type="hidden" name="intent" value="send" />
          <p id="send-desc" className="text-muted-foreground text-sm">
            {t('invoices.detail.sendBody', { email: customerEmail })}
          </p>
          <button
            type="submit"
            aria-describedby="send-desc"
            className="bg-primary text-primary-foreground font-text inline-flex min-h-11 w-fit items-center rounded-md px-4 py-2 text-sm"
          >
            {t('invoices.detail.send')}
          </button>
        </Form>
      ) : (
        <p className="text-muted-foreground text-sm">{t('invoices.detail.sendNoEmail')}</p>
      )}
    </section>
  );
}

function LifecycleButton({ to, label }: { to: InvoiceStatus; label: string }) {
  return (
    <Form method="post">
      <input type="hidden" name="intent" value="transition" />
      <input type="hidden" name="to" value={to} />
      <button
        type="submit"
        className="border-input font-text inline-flex min-h-11 w-fit items-center rounded-md border px-4 py-2 text-sm"
      >
        {label}
      </button>
    </Form>
  );
}

function ReadOnlyInvoice({
  invoice,
  posted,
  accountLabel,
  vatLabel,
}: {
  invoice: Awaited<ReturnType<typeof readInvoice>> & object;
  posted: boolean;
  accountLabel: ReadonlyMap<string, string>;
  vatLabel: ReadonlyMap<string, string>;
}) {
  return (
    <div className="grid gap-6">
      <section className="grid gap-1">
        <h2 className="font-text text-sm">{t('invoices.detail.customerHeading')}</h2>
        <p>{invoice.customerName}</p>
        {invoice.customerOrgNr && (
          <p className="text-muted-foreground tabular text-sm">{invoice.customerOrgNr}</p>
        )}
        {invoice.customerEmail && (
          <p className="text-muted-foreground text-sm">{invoice.customerEmail}</p>
        )}
        {invoice.customerAddress && (
          <p className="text-muted-foreground text-sm">{invoice.customerAddress}</p>
        )}
        {invoice.kid && (
          <p className="text-muted-foreground tabular text-sm">
            {t('invoices.detail.kid')}: {invoice.kid}
          </p>
        )}
      </section>

      <Table>
        <TableCaption>{t('invoices.detail.linesCaption')}</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">{t('invoices.detail.lineHeaderDescription')}</TableHead>
            <TableHead scope="col">{t('invoices.detail.lineHeaderQuantity')}</TableHead>
            <TableHead scope="col">{t('invoices.detail.lineHeaderVat')}</TableHead>
            <TableHead scope="col">{t('invoices.detail.lineHeaderNet')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoice.lines.map((l) => (
            <TableRow key={l.id}>
              <TableCell>
                {l.description}
                <span className="text-muted-foreground block text-xs">
                  {accountLabel.get(l.accountId) ?? ''}
                </span>
              </TableCell>
              <TableCell className="tabular">
                {l.quantity} {l.unit}
              </TableCell>
              <TableCell className="tabular">{vatLabel.get(l.vatCodeId) ?? ''}</TableCell>
              <TableCell className="tabular text-right">
                {formatKr(øre(l.netOre))} {t('common.currency')}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <dl className="border-input grid gap-1 border-t pt-4 text-sm">
        <div className="flex justify-between">
          <dt>{t('invoices.form.totalsNet')}</dt>
          <dd className="tabular">
            {formatKr(øre(invoice.netOre))} {t('common.currency')}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt>{t('invoices.form.totalsVat')}</dt>
          <dd className="tabular">
            {formatKr(øre(invoice.vatOre))} {t('common.currency')}
          </dd>
        </div>
        <div className="font-text flex justify-between">
          <dt>{t('invoices.form.totalsGross')}</dt>
          <dd className="tabular">
            {formatKr(øre(invoice.grossOre))} {t('common.currency')}
          </dd>
        </div>
      </dl>

      {posted && (
        <p className="text-muted-foreground border-input border-t pt-4 text-sm">
          {t('invoices.detail.posted')}
        </p>
      )}
    </div>
  );
}
