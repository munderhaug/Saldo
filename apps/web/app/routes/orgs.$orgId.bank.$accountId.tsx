/**
 * Bank account detail + import (build-spec §8.7, feat-banking-import). Shows an account's imported
 * transactions and the two import paths behind one provider-agnostic surface:
 *   - a FILE upload (camt.054 XML or CSV), parsed by the self-built parser / pure CSV reader, and
 *   - a GoCardless FETCH (PSD2/AIS), when the account is linked and the server is configured.
 *
 * Import is IDEMPOTENT (dedup on the external ref): re-importing the same window is a no-op. Posting to
 * the ledger is NOT done here — these are append-only imported facts; matching/reconciliation is the
 * downstream task. Transactions are personal/financial data: the page is off any shared cache, and the
 * GoCardless interim runs INLINE (a job runner is not built yet) — safe because the import is idempotent,
 * so a crash mid-import re-runs cleanly (documented in ADR 0047, mirroring ADR 0046's inline send).
 *
 * Rate-limit safety (capture §"Rate limits"): a fetch is one batch; a 429 is surfaced calmly.
 */
import { Form, Link } from 'react-router';
import { z } from 'zod';
import { formatKr, parseBankCsv, øre } from '@saldo/domain';
import type { Route } from './+types/orgs.$orgId.bank.$accountId';
import { assertSameOrigin, withUserOrg } from '~/auth/auth.server';
import {
  importTransactions,
  listBankTransactions,
  readBankAccount,
  type BankTransactionRow,
} from '~/db/bank.server';
import { parseCamt054 } from '~/integrations/banking/camt054.server';
import { fetchAccountTransactions } from '~/integrations/banking/gocardless.server';
import { bankingConfig } from '~/integrations/banking/config.server';
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
  return [{ title: t('bank.title') }];
}

/** Transactions are personal/financial data; keep the page off any shared cache. */
export function headers() {
  return { 'Cache-Control': 'private, no-store' };
}

/** Statements are small; cap the upload so a stray large file can't exhaust memory. */
const MAX_FILE_BYTES = 5 * 1024 * 1024;

const idsValid = (orgId: string, accountId: string): boolean =>
  z.string().uuid().safeParse(orgId).success && z.string().uuid().safeParse(accountId).success;

export async function loader({ request, params }: Route.LoaderArgs) {
  if (!idsValid(params.orgId, params.accountId)) throw new Response('Not found', { status: 404 });
  const data = await withUserOrg(request, params.orgId, async (tx) => ({
    account: await readBankAccount(tx, params.accountId),
    transactions: await listBankTransactions(tx, params.accountId),
  }));
  if (!data.account) throw new Response('Not found', { status: 404 });
  return {
    orgId: params.orgId,
    account: data.account,
    transactions: data.transactions,
    isLinked: Boolean(data.account.gocardlessAccountId),
    // Whether the live GoCardless client is configured here — gates the fetch button.
    gocardlessAvailable: bankingConfig() !== null,
  };
}

type ActionData =
  | { readonly ok: true; readonly imported: number; readonly skipped: number }
  | { readonly ok: false; readonly error: string };

export async function action({ request, params }: Route.ActionArgs): Promise<ActionData> {
  assertSameOrigin(request);
  if (!idsValid(params.orgId, params.accountId)) throw new Response('Not found', { status: 404 });
  const form = await request.formData();
  const intent = form.get('intent');

  // ── GoCardless fetch (PSD2/AIS) ──────────────────────────────────────────────────────────────
  if (intent === 'import-gocardless') {
    const account = await withUserOrg(request, params.orgId, (tx) =>
      readBankAccount(tx, params.accountId),
    );
    if (!account) throw new Response('Not found', { status: 404 });
    if (!account.gocardlessAccountId) {
      return { ok: false, error: t('bank.import.gocardlessNotLinked') };
    }
    // Network I/O OUTSIDE the DB transaction (don't hold a tx open over a remote call).
    const fetched = await fetchAccountTransactions(account.gocardlessAccountId);
    if (!fetched.ok) {
      const error =
        fetched.reason === 'not-configured'
          ? t('bank.import.gocardlessUnavailable')
          : fetched.reason === 'rate-limited'
            ? t('bank.import.errorRateLimited')
            : fetched.reason === 'auth-failed'
              ? t('bank.import.errorAuth')
              : t('bank.import.errorGeneric');
      return { ok: false, error };
    }
    const summary = await withUserOrg(request, params.orgId, (tx) =>
      importTransactions(tx, params.orgId, params.accountId, 'gocardless', fetched.transactions),
    );
    return { ok: true, ...summary };
  }

  // ── File upload (camt.054 XML or CSV) ────────────────────────────────────────────────────────
  const file = form.get('statement');
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: t('bank.import.errorNoFile') };
  }
  if (file.size > MAX_FILE_BYTES) return { ok: false, error: t('bank.import.errorTooLarge') };

  const account = await withUserOrg(request, params.orgId, (tx) =>
    readBankAccount(tx, params.accountId),
  );
  if (!account) throw new Response('Not found', { status: 404 });

  const text = await file.text();
  const looksXml = file.name.toLowerCase().endsWith('.xml') || text.trimStart().startsWith('<');

  if (looksXml) {
    const parsed = parseCamt054(text);
    if (!parsed.ok) return { ok: false, error: t('bank.import.errorParse') };
    const summary = await withUserOrg(request, params.orgId, (tx) =>
      importTransactions(tx, params.orgId, params.accountId, 'camt054', parsed.transactions),
    );
    return { ok: true, ...summary };
  }

  const csv = parseBankCsv(text, account.currency);
  if (!csv.mapped) return { ok: false, error: t('bank.import.errorNoColumns') };
  const summary = await withUserOrg(request, params.orgId, (tx) =>
    importTransactions(tx, params.orgId, params.accountId, 'csv', csv.transactions),
  );
  return { ok: true, ...summary };
}

const kr = (ore: number): string => formatKr(øre(ore));

export default function BankAccountRoute({ loaderData, actionData }: Route.ComponentProps) {
  const { orgId, account, transactions, isLinked, gocardlessAvailable } = loaderData;

  return (
    <main className="mx-auto grid max-w-3xl gap-6 p-6 sm:p-10">
      <header className="grid gap-1">
        <h1 className="font-serif text-3xl tracking-tight">{account.label}</h1>
        {account.accountNumber && (
          <p className="text-muted-foreground tabular text-sm">{account.accountNumber}</p>
        )}
      </header>

      {actionData?.ok && (
        <p role="status" className="text-sm">
          {t('bank.import.success', { imported: actionData.imported, skipped: actionData.skipped })}
        </p>
      )}
      {actionData && !actionData.ok && (
        <p role="alert" className="text-destructive text-sm">
          {actionData.error}
        </p>
      )}

      <section className="grid gap-3">
        <h2 className="font-text text-lg">{t('bank.import.fileTitle')}</h2>
        <p className="text-muted-foreground text-sm">{t('bank.import.fileIntro')}</p>
        <Form method="post" encType="multipart/form-data" className="grid gap-3">
          <label htmlFor="statement" className="font-text text-sm">
            {t('bank.import.fileLabel')}
          </label>
          <input
            id="statement"
            name="statement"
            type="file"
            accept=".xml,.csv,.txt,text/xml,application/xml,text/csv"
            required
            className="border-input bg-background rounded-md border px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="bg-primary text-primary-foreground font-text inline-flex min-h-11 w-fit items-center rounded-md px-4 py-2 text-sm"
          >
            {t('bank.import.fileSubmit')}
          </button>
        </Form>
      </section>

      <section className="grid gap-3">
        <h2 className="font-text text-lg">{t('bank.import.gocardlessTitle')}</h2>
        <p className="text-muted-foreground text-sm">{t('bank.import.gocardlessIntro')}</p>
        <p className="text-muted-foreground text-sm">{t('bank.import.rateLimitNote')}</p>
        {!gocardlessAvailable ? (
          <p className="text-muted-foreground text-sm">{t('bank.import.gocardlessUnavailable')}</p>
        ) : !isLinked ? (
          <p className="text-muted-foreground text-sm">{t('bank.import.gocardlessNotLinked')}</p>
        ) : (
          <Form method="post" className="grid gap-3">
            <input type="hidden" name="intent" value="import-gocardless" />
            <button
              type="submit"
              className="bg-primary text-primary-foreground font-text inline-flex min-h-11 w-fit items-center rounded-md px-4 py-2 text-sm"
            >
              {t('bank.import.gocardlessSubmit')}
            </button>
          </Form>
        )}
      </section>

      <section className="grid gap-3">
        <h2 className="font-text text-lg">{t('bank.detail.transactionsTitle')}</h2>
        {transactions.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('bank.detail.empty')}</p>
        ) : (
          <Table>
            <TableCaption>
              {t('bank.detail.listCaption', { count: transactions.length })}
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{t('bank.detail.col.date')}</TableHead>
                <TableHead scope="col">{t('bank.detail.col.description')}</TableHead>
                <TableHead scope="col">{t('bank.detail.col.counterparty')}</TableHead>
                <TableHead scope="col" className="text-right">
                  {t('bank.detail.col.amount')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((tx: BankTransactionRow) => (
                <TableRow key={tx.id}>
                  <TableCell className="tabular">{tx.bookingDate ?? '—'}</TableCell>
                  <TableCell>{tx.remittanceInfo ?? t('bank.detail.descriptionNone')}</TableCell>
                  <TableCell>{tx.counterparty ?? '—'}</TableCell>
                  <TableCell className="tabular text-right">
                    {kr(tx.amountOre)} {t('common.currency')}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <Link
        to={`/orgs/${orgId}/bank`}
        className="text-primary font-text inline-flex min-h-11 w-fit items-center text-sm underline-offset-4 hover:underline"
      >
        {t('bank.detail.back')}
      </Link>
    </main>
  );
}
