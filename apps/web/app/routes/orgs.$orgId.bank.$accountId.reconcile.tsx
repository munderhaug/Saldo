/**
 * Bank reconciliation (build-spec §8.7, feat-reconciliation) — the manual workflow that settles
 * incoming payments against open invoices. The loader runs the pure `@saldo/domain` matcher over the
 * account's UNMATCHED incoming transactions and the org's OPEN invoices; the action posts a
 * human-confirmed match (a §5.5 consequential act → explicit confirm, ADR 0002).
 *
 * Deterministic, rules-based matching — NOT an AI system (EU AI Act Recital 12), so no Art. 50
 * disclosure. The select offers only equal-amount candidates (an exact settlement is required; partial
 * payments are a later refinement), ranked KID → amount+date → amount. The page works without JS (real
 * `<Form>` per row) and is off any shared cache (transactions are personal/financial data).
 */
import { Form, Link } from 'react-router';
import { z } from 'zod';
import { type MatchTier } from '@saldo/domain';
import type { Route } from './+types/orgs.$orgId.bank.$accountId.reconcile';
import { assertSameOrigin, withUserOrg } from '~/auth/auth.server';
import { readBankAccount } from '~/db/bank.server';
import { kr } from '~/lib/money-format';
import {
  buildSuggestions,
  listOpenInvoices,
  listUnmatchedIncoming,
  reconcileMatch,
  type SuggestedMatch,
  type TxSuggestion,
} from '~/db/reconciliation.server';
import { confirmMatchInput } from '~/contracts';
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
import { SubmitButton } from '~/components/ui/submit-button';

export function meta() {
  return [{ title: t('recon.title') }];
}

/** Transactions + customer names are personal/financial data; keep the page off any shared cache. */
export function headers() {
  return { 'Cache-Control': 'private, no-store' };
}

const idsValid = (orgId: string, accountId: string): boolean =>
  z.string().uuid().safeParse(orgId).success && z.string().uuid().safeParse(accountId).success;

export async function loader({ request, params }: Route.LoaderArgs) {
  if (!idsValid(params.orgId, params.accountId)) throw new Response('Not found', { status: 404 });
  const data = await withUserOrg(request, params.orgId, async (tx) => ({
    account: await readBankAccount(tx, params.accountId),
    transactions: await listUnmatchedIncoming(tx, params.accountId),
    openInvoices: await listOpenInvoices(tx),
  }));
  if (!data.account) throw new Response('Not found', { status: 404 });
  return {
    orgId: params.orgId,
    accountId: params.accountId,
    accountLabel: data.account.label,
    suggestions: buildSuggestions(data.transactions, data.openInvoices),
  };
}

type ActionData =
  | { readonly ok: true; readonly invoiceId: string }
  | { readonly ok: false; readonly error: string };

export async function action({ request, params }: Route.ActionArgs): Promise<ActionData> {
  assertSameOrigin(request);
  if (!idsValid(params.orgId, params.accountId)) throw new Response('Not found', { status: 404 });

  const parsed = confirmMatchInput.safeParse(Object.fromEntries(await request.formData()));
  if (!parsed.success) return { ok: false, error: t('recon.error.invalid') };

  const result = await withUserOrg(request, params.orgId, (tx) =>
    reconcileMatch(tx, params.orgId, parsed.data),
  );
  if (!result.ok) return { ok: false, error: t(`recon.error.${result.reason}`) };
  return { ok: true, invoiceId: result.invoiceId };
}

const matchLabel = (tier: MatchTier): string =>
  tier === 'kid-exact'
    ? t('recon.match.kid-exact')
    : tier === 'amount-date'
      ? t('recon.match.amount-date')
      : t('recon.match.amount');

const invoiceLabel = (c: SuggestedMatch): string =>
  c.invoiceNumber !== null
    ? t('recon.invoiceLabel', { number: c.invoiceNumber, customer: c.customerName })
    : t('recon.invoiceLabelNoNumber', { customer: c.customerName });

export default function ReconcileRoute({ loaderData, actionData }: Route.ComponentProps) {
  const { orgId, accountId, accountLabel, suggestions } = loaderData;

  return (
    <main className="mx-auto grid max-w-3xl gap-6 p-6 sm:p-10">
      <header className="grid gap-1">
        <h1 className="font-serif text-3xl tracking-tight">{t('recon.title')}</h1>
        <p className="text-muted-foreground text-sm">{accountLabel}</p>
        <p className="text-muted-foreground text-sm">{t('recon.intro')}</p>
      </header>

      {actionData?.ok && (
        <p role="status" className="text-sm">
          {t('recon.success')}
        </p>
      )}
      {actionData && !actionData.ok && (
        <p role="alert" className="text-destructive text-sm">
          {actionData.error}
        </p>
      )}

      {suggestions.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('recon.empty')}</p>
      ) : (
        <Table>
          <TableCaption>{t('recon.listCaption', { count: suggestions.length })}</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{t('recon.col.date')}</TableHead>
              <TableHead scope="col">{t('recon.col.description')}</TableHead>
              <TableHead scope="col" className="text-right">
                {t('recon.col.amount')}
              </TableHead>
              <TableHead scope="col">{t('recon.col.suggestion')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {suggestions.map((s: TxSuggestion) => (
              <TableRow key={s.transaction.id}>
                <TableCell className="tabular align-top">
                  {s.transaction.bookingDate ?? '—'}
                </TableCell>
                <TableCell className="align-top">
                  {s.transaction.remittanceInfo ?? s.transaction.counterparty ?? '—'}
                </TableCell>
                <TableCell className="tabular text-right align-top">
                  {kr(s.transaction.amountOre)} {t('common.currency')}
                </TableCell>
                <TableCell className="align-top">
                  {s.candidates.length === 0 ? (
                    <span className="text-muted-foreground text-sm">
                      {t('recon.suggestionNone')}
                    </span>
                  ) : (
                    <Form method="post" className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="bankTransactionId" value={s.transaction.id} />
                      <label htmlFor={`inv-${s.transaction.id}`} className="sr-only">
                        {t('recon.choose')}
                      </label>
                      <select
                        id={`inv-${s.transaction.id}`}
                        name="invoiceId"
                        defaultValue={s.candidates[0]!.invoiceId}
                        className="border-input bg-background min-h-11 rounded-md border px-3 py-2 text-sm"
                      >
                        {s.candidates.map((c) => (
                          <option key={c.invoiceId} value={c.invoiceId}>
                            {invoiceLabel(c)} · {matchLabel(c.tier)}
                          </option>
                        ))}
                      </select>
                      <SubmitButton className="bg-primary text-primary-foreground font-text inline-flex min-h-11 w-fit items-center rounded-md px-4 py-2 text-sm">
                        {t('recon.confirm')}
                      </SubmitButton>
                    </Form>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Link
        to={`/orgs/${orgId}/bank/${accountId}`}
        className="text-primary font-text inline-flex min-h-11 w-fit items-center text-sm underline-offset-4 hover:underline"
      >
        {t('recon.back')}
      </Link>
    </main>
  );
}
