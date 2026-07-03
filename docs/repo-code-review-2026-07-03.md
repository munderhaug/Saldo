# Saldo — Full Repository Code Review (2026-07-03)

> In-depth review of the entire repo: bugs, duplication, dead code/docs, simplifications, and
> refactoring needs. Findings were produced by area-scoped passes (domain, db/migrations, routes/auth,
> integrations/jobs, UI/a11y, CI/tooling, docs, dead-code) and each is quoted against `file:line`.
> This is the successor snapshot to `docs/repo-code-review-2026-06-28.md` (all of whose findings are
> closed per STATUS). Nothing here is auto-applied — it is a work-list.

## 1. Executive summary

Saldo remains well above the bar of typical production SaaS and holds its hard invariants where it
counts: money is branded integer `Øre` with arithmetic funnelled through guarded helpers; RLS is
FORCE-enabled with a non-owner role and composite same-org FKs; invoice numbering is gapless from a
per-org counter row; the propose-only AI boundary with Art. 50 provenance is structural. The
mechanical gates (typecheck, lint, test, knip, lint:repo) are green and knip finds no dead exports.

The 2026-06-28 review is fully closed, but this pass surfaces **new** material issues, concentrated in
two themes: (a) **concurrency and lifecycle correctness on money-moving paths** — an append-only INSERT
hole, double-settlement races, and a credit-note draft that silently reverts to a plain invoice; and
(b) **surface hardening** — an unauthenticated LLM endpoint and a rate limiter keyed on a spoofable
header. A third, lower theme is **doc drift**: `tech-stack.md` and two `.claude/rules` files name a
stack that no longer matches the manifests.

**Top fixes, in order:**
1. Credit-note draft silently becomes a second positive invoice on save (P0 — data-integrity, normal UI use).
2. Unauthenticated vision-LLM receipt endpoint (P0 — cost burn / DoS / free OCR oracle).
3. Append-only hole: INSERT of postings into an already-posted voucher is not blocked by any trigger (P0).
4. `/oppslag` rate limiter keyed on the left-most (client-controlled) `X-Forwarded-For` (P1).
5. Double-settlement race in reconcile / `transitionInvoice` (P1).
6. No pending/disabled state anywhere → double-click duplicates posted vouchers and customer emails (P1).

## 2. Gate results

| Gate | Status |
|---|---|
| `pnpm typecheck` | ✅ pass |
| `pnpm lint` | ✅ pass |
| `pnpm test` | ✅ pass (Testcontainers integrity suites auto-skip without Docker) |
| `pnpm knip` | ✅ clean (only RR7 `+types` typegen noise) |

## 3. P0 — data-integrity / auth-bypass (fix first)

### P0-1. Saving a credit-note draft silently converts it to a plain invoice and severs the credits link
**`apps/web/app/routes/orgs.$orgId.invoices.$invoiceId.tsx:190`**, **`components/invoice-form.tsx:34`**,
**`db/invoices.server.ts:311-327,399-413`**.
The draft editor builds `defaultValues.kind = invoice.kind === 'credit_note' ? 'invoice' : invoice.kind`;
the form's `KINDS = ['invoice','quote']` never offers `credit_note` and never renders a
`creditsInvoiceId` field, so `invoiceFormToObject` yields `creditsInvoiceId: ''`. `updateDraft` applies
`kind` and `creditsInvoiceId` (`'' → NULL`) unconditionally.
**Failure:** create a linked credit-note draft ("Lag kreditnota") → edit a line → save. `kind` flips to
`invoice`, `credits_invoice_id` → NULL. Issuing then posts a **second positive AR voucher** (revenue +
receivable doubled) instead of a reversing motbilag, and re-invoices the customer. The append-only /
motbilag invariant is defeated through ordinary UI use. `updateDraft` has **zero test coverage**.
**Fix:** render `kind` read-only (or include `credit_note`) for credit-note drafts, carry
`creditsInvoiceId` through the form, and make `updateDraft` refuse to change `kind`/`creditsInvoiceId`.

### P0-2. The AI receipt-extraction action runs the vision LLM with no authentication
**`apps/web/app/routes/orgs.$orgId.receipts.new.tsx:104-188`**.
The default `extract` intent does `assertSameOrigin` + an orgId **shape** check, then calls
`extractReceipt(...)` directly — no `requireUser`, no `withUserOrg`. `assertSameOrigin`
(`auth/auth.server.ts:58-65`) only compares `Origin` to `Host`, trivially forged by a non-browser
client; the route config is flat (no parent guard), and parent loaders don't run before actions.
**Failure:** `curl -X POST -H "Origin: https://<host>" -F "receipt=@img.png"
https://<host>/orgs/<any-uuid>/receipts/new` runs a paid vision inference (up to 10 MB) per request,
unauthenticated and unthrottled — cost burn / DoS, and a free OCR oracle. The sibling `confirm` intent
in the *same action* correctly gates via `withUserOrg`.
**Fix:** `await requireUser(request)` (or full `withUserOrg`) before the extract branch; add a
per-user rate limit.

### P0-3. INSERT of postings into an already-posted voucher is not blocked (append-only hole)
**`db/migrations/20260622090000_core_ledger.sql:123-125`**.
`posting_immutable` fires `BEFORE UPDATE OR DELETE` only. The only INSERT-time triggers on `posting`
are the period-lock (locked periods only) and the balance constraint trigger (passes as long as the
new legs balance). `voucher_posted_complete` fires on `voucher`, not on late posting inserts.
**Failure:** the `saldo_app` role inserts a balanced pair (e.g. debit 7798 / credit 2400) into a voucher
whose `posted_at` is set, in an open period — commits, silently rewriting a posted entry with no
motbilag. The integrity suite covers UPDATE and DELETE of postings on a posted voucher
(`test/integrity/ledger-integrity.integration.test.ts:80-88`) but **never INSERT**.
**Fix:** extend `posting_immutable` (or add a trigger) to `BEFORE INSERT`, rejecting when
`NEW.voucher_id`'s `posted_at IS NOT NULL`; add the missing bad-case test.

## 4. P1 — high

### P1-1. `/oppslag` rate limiter is bypassed by a client-supplied `X-Forwarded-For`
**`apps/web/app/integrations/enhetsregisteret/throttle.server.ts:28-32`** — keys buckets on the
**first** (`split(',')[0]`) XFF hop, which is client-controlled. An attacker sets `X-Forwarded-For:
<random>` per request for an unbounded number of fresh 30-lookup budgets — the exact
amplification/enumeration abuse the module's own docstring says it exists to stop.
**Fix:** derive the key from the trusted proxy's real peer address (right-most XFF entry after the known
hop count, or the platform's verified client-IP header), never the left-most token.

### P1-2. Double-settlement race: reconcile / `transitionInvoice` are check-then-update with no guard
**`db/reconciliation.server.ts:187-259`**, **`db/invoices.server.ts:610-634`**.
`transitionInvoice` reads status, checks `canTransition`, then `UPDATE … WHERE eq(invoice.id)` with **no
status predicate and no row-count check**; the reconcile link update
(`reconciliation.server.ts:248-251`) is `WHERE id = btx.id` with no `matched_voucher_id IS NULL`
guard. Settlement vouchers have no per-invoice uniqueness (`voucher_invoice_uniq` covers only non-NULL
`invoice_id`).
**Failure:** two equal-amount incoming bank transactions reconciled against the same open invoice
concurrently (or one btx against two candidate invoices) — both pass validation under READ COMMITTED,
both post a settlement voucher, both mark paid. One payment → two posted vouchers / two invoices paid.
The same-btx/same-invoice case survives only by luck (the re-read sees `paid`, `canTransition('paid',
'paid')` is false).
**Fix:** add `AND matched_voucher_id IS NULL` + row-count check on the link update, and a
`status = cur.status` (or open-status set) predicate + row-count check in `transitionInvoice`.

### P1-3. No pending/disabled state on any submit → double-click duplicates ledger posts and emails
**`apps/web/app`-wide** (`useNavigation`/`useFetcher`/`disabled` appear zero times).
`orgs.$orgId.vouchers.new.tsx:180-185` and the receipt confirm at `receipts.new.tsx:459-464` post via
`recordManualVoucher` with no idempotency key → a double-click books the entry **twice into the
append-only ledger** (only fixable by motbilag). Invoice "Send"
(`invoices.$invoiceId.tsx:357-363` → `send-invoice.server.tsx:74-76`) deliberately allows re-send →
two clicks = two customer emails. Issue is DB-backstopped by `voucher_invoice_uniq` but
`issueInvoice` (`db/invoices.server.ts:480-497`) never checks the UPDATE row count and posts
unconditionally, so a concurrent second submit surfaces as an unhandled **500** even though the invoice
did issue.
**Fix:** one shared pending-aware submit button (`useNavigation().state !== 'idle'` → disabled + label
swap); add a `.returning()` row-count check to `issueInvoice` (return `not-a-draft` when empty).

### P1-4. Two domain-level regulatory correctness bugs

**(a) Per-line VAT rounding makes multi-line invoices fail Saldo's own EHF BR-CO-17 validator.**
`peppol/validate.ts:89` enforces BR-CO-17 as an **exact** øre equality against a category-level
recomputation, but `invoice/invoice.ts:116` rounds VAT **per line** and feeds the per-line-rounded sums
to the validator (`db/invoice-document.server.ts:159,217`). Two lines of net 49,90 at 25 % →
per-line VAT 1248+1248=2496 vs recomputed round(9980×0.25)=2495 → BR-CO-17 fires on an invoice Saldo
itself produced. Every `peppol/validate.test.ts` case uses one line per category, so this is untested.
**Fix (design decision):** freeze category-level VAT at issue per EN 16931, or document a ±1-øre tolerance.

**(b) MVA-melding drops code 6 (unntatt turnover), contradicting the committed Skatteetaten example.**
`mva-melding/melding.ts:93-95` (`isMeldingReportable`) excludes `direction:'none' + rateCategory:'none'`,
removing code 6 — but `db/reference/skatt/mva-melding/examples/eksempelMedAlleTilfeller.xml` includes a
code-6 line (grunnlag 20000 / sats 0). A registered org with mixed unntatt revenue files a melding
missing its unntatt turnover. Inversely, import-basis codes 21/22 pass the predicate and would emit
lines absent from the code list. `docs/regulatory/mva-melding.md:29-33` asserts the opposite of the raw
capture it cites — the source-grounding gate failed here.

## 5. P1/P2 — CI, tooling, contracts

### P1-5. `db:introspect` CI step never diff-checks its output (schema drift passes silently)
**`.github/workflows/ci.yml:60`** regenerates `apps/web/app/db/schema.ts` but no later step runs `git
diff --exit-code`. `schema.ts` is also exempt from eslint, type-coverage, and knip, so a wrong
column type/nullability that still typechecks sails through. **Fix:** add
`git diff --exit-code -- apps/web/app/db/` after introspect (confirm introspection is deterministic first).

### P1-6. Turbo `lint` cache is blind to the ESLint config and the money-invariant plugin
**`turbo.json:4,25`** — `eslint.config.mjs` and `tools/eslint-plugin-saldo/**` are outside every lint
input hash (verified empirically: editing either does not change the `@saldo/web#lint` hash). Locally
(or with any future remote cache) tightening `saldo/no-money-arithmetic` and re-linting returns a stale
**cache HIT** — the mechanical enforcement of the #1 invariant silently doesn't run. CI is unaffected
today only because it persists no `.turbo` cache. **Fix:** add both paths to `globalDependencies` (or
`lint.inputs`).

### P2 — CI gate weaknesses (all `file:line`-verified)
- `db:lint` pipeline has no `pipefail`: a `migrations-up.mjs` crash lets squawk lint empty stdin and exit 0 (`package.json:28`).
- The `eslint-plugin-saldo` rules (money invariant, design tokens) have **no RuleTester tests** and the package is `eslint`-ignored — a rule that stops firing keeps everything green.
- CI's Postgres service is `image: postgres:16` (tag-only) while compose/Dockerfile are digest-pinned (`ci.yml:21`).
- `pnpm dlx squawk-cli@…` / `cdxgen@…` fetch gate tooling outside the lockfile (`package.json:28`, `security.yml:44`) — make them devDependencies.
- `apps/web` test uses `--passWithNoTests`, hiding a broken `include` glob (`apps/web/package.json:12`).
- Minor: `typecheck` declares no `outputs` for `.react-router/types`, and `lint` has no `dependsOn` on it; duplicated 4× checkout/setup block; `turbo.json:16` dead `coverage/**` output; `git fetch … || true` redundant after `fetch-depth: 0`.

### P2 — contracts looser than the DB (500 instead of typed error)
- `invoiceInput.creditsInvoiceId` has no correlation with `kind` (`contracts/invoice.ts:89`) vs
  `CHECK (credits_invoice_id IS NULL OR kind='credit_note')` (`sales_invoicing.sql:75`). A crafted POST
  500s on the CHECK. (Tenancy still holds via RLS + composite FKs; only error quality suffers.)
- **Contact email is never format-validated** (`contracts/contact.ts:46` = `z.string().trim().max(320)`),
  while `credentialsInput.email` and invoice `customerEmail` both check `.email()`. That unvalidated
  string can later flow into an invoice `customerEmail` / SMTP `to`.
- `invoiceLineInput.quantity` bounds decimals to 3 but not integer digits vs `numeric(14,3)` — a ≥12-digit
  integer part 500s (unreachable via UI).

## 6. P2 — quality, duplication, dead code

### Domain (`packages/domain`)
- Stale comment: `vat/line-treatment.ts:32` calls code 20 `no-treatment`, but it's classified `reverse-charge`.
- CSV bank import never validates the currency cell (`banking/csv.ts:237`) while camt/GoCardless hard-fail on bad currency.
- CSV `CsvRowError.line` drifts after blank lines (tokenise drops blanks; `parseCsvStatement` reports post-drop index — `csv.ts:85-93,202`).
- Duplicated logic: `isoDayOrdinal` in `reconciliation/match.ts:88-102` **and** `reporting/reskontro.ts:65-76`; three øre→decimal-string impls (`saft/financial-xml.ts:49`, `peppol/ubl.ts:145`, display `formatKr`); two CSV splitters in `saft/` (`accounts.ts:17` quote-aware vs `tax-codes.ts:108` bare `split(';')`).
- Dead exports (no non-test consumer): `imbalance`, `saftClosingBalanceNet`, `EMPTY_LIQUIDITY`, `fixedClock`, `termMonths`+`BIMONTHLY_TERMS`.
- `Standard_Tax_Codes.csv` fixture is `readFileSync`-loaded independently in **9 test files** — extract one shared `test-helpers/saft-fixtures.ts`.
- No negative-amount guard/test in `derivePurchase`/`deriveSales` (`posting/derive.ts:56,187`) while `deriveSettlement` throws — inconsistent policy on the most critical function.

### DB / query layer
- `bank_transaction.matched_voucher_id` is the only cross-row ref without a same-org composite FK (`bank_accounts.sql:61`) — one-liner, `voucher_id_org_uniq` already exists.
- Generated `schema.ts` has every composite FK's column pairing **reversed** (systematic; harmless at runtime, but `drizzle-kit generate` would emit nonsense). Worth a comment/lint.
- Missing indexes on hot ledger columns: `posting(account_id)` and `voucher(period_id)` — cheap now, painful at 5-year retention.
- DR verifier's counter check only asserts `next >= 1`, not `next >= max(invoice_number)` per org (`db/dr/verify-restore.sql:138-141`) — weaker than its own comment.

### Duplication in the web app (the same extraction the repo already did, left unfinished)
- `formatOrgNr` is byte-identical in `lib/org-format.ts:31-33` **and** `routes/oppslag.tsx:268-270` (the local copy shadows the import name).
- `idsValid` route-param guard copy-pasted in `orgs.$orgId.bank.$accountId.tsx:53` and `…reconcile.tsx:48`.
- Five files hand-compose `formatKr(...) + t('common.currency')` instead of the existing `krWithUnit` (`lib/money-format.ts:15`): invoices/products lists, invoice detail, `invoice-form.tsx`, plus saft/mva/bank routes.
- Three labelled-field impls (`form-field.tsx` `TextField`, local `Field` in `orgs.new.tsx:185` and `bank.new.tsx:137`); report total-row triplicated (`balanse`/`likviditet`/`reskontro`); `Money` vs a private `Amount` in `home.tsx`.

### UI / accessibility (WCAG 2.2 AA is the bar)
- **PWA manifest icons all 404**: `public/manifest.webmanifest:12-21` references `/icons/*.png` but `public/` contains only the manifest; no favicon/apple-touch-icon in `root.tsx`. Install is broken.
- Receipt review step discards the AI proposal on confirm failure — even with JS (`receipts.new.tsx:236-261` derives `review` solely from `actionData`, so `{ok:false}` unmounts `ReviewStep`); the error is also wired to the wrong control's `aria-describedby`.
- Pages with no `<title>` (WCAG 2.4.2): `auth.login.tsx`, `invoices.$invoiceId.tsx`, `invoices.new.tsx`.
- Status badge smuggles a banned raw color and bypasses the semantic `--paid`/`--overdue` tokens (`lib/invoice-format.ts:41,43` → `bg-primary`, `bg-destructive text-white`; the ESLint rule misses it because the class lives in a `.ts` template string).
- `CardTitle` is a `<div>` used as a section heading (`components/ui/card.tsx:25` used in `orgs.$orgId.tsx:96,128`, `reports.tsx:65`) — SR heading nav skips these.
- Money loses its accessible unit outside the reports (the `Money` component is used only in the 5 report routes; ~9 other surfaces inline `formatKr + 'kr'`).
- Decimal fields declare `inputMode="numeric"` (`invoice-form.tsx:277,291`, `product-form.tsx:139`) — the iOS keypad has no comma, so mobile users can't type øre; `TextField`'s prop type bakes this in.
- `TextField` hardcodes `autoComplete="off"` (`form-field.tsx:72`) — disables autofill on every contact/address field.
- Wide tables aren't keyboard-scrollable (`components/ui/table.tsx:7` `overflow-x-auto` with no `tabIndex`); manifest locks `orientation: portrait`; VAT-rate/date formatting diverges 3 ways; no-JS form round-trip wipes typed values.

### Routes / auth (P3s)
- `orgs.tsx` is the only personal-data page missing `headers()` `private, no-store`.
- Sliding session renewal never reaches the browser: `validateSessionToken` extends the DB row but `getOptionalUser`/`requireUser` discard the renewed `expiresAt` and never re-issue the cookie — sessions hard-expire 30 days after login.
- `assertSameOrigin` 500s on `Origin: null` (`new URL('null')` throws) instead of 403.
- `devAuthEnabled = !isProd || !oidcConfigured` — password login is silently live in prod whenever OIDC env vars are missing; consider an explicit `DEV_AUTH=true` opt-in.
- `recordReverseChargePurchase` has no route call site (tests only).

## 7. Documentation drift & dead docs

- **`docs/tech-stack.md` names ~12 technologies absent from every manifest**: Motion, Vaul, vite-plugin-pwa, Dexie, Capacitor, Recharts, visx, graphile-worker, Langfuse, OpenTelemetry, SigNoz/Grafana, GlitchTip, Testing Library, Playwright, Radix, class-variance-authority. Some are deliberately deferred (per `.claude/rules/frontend.md`), but the doc presents them as the current stack. It also omits the installed `@node-rs/argon2`.
- **`docs/roadmap.md:126` and `.claude/rules/frontend.md` both claim React Hook Form / TanStack Table are "NOT currently dependencies"** — they now are (`react-hook-form ^7.80.0`, `@tanstack/react-table ^8.21.3`, `@hookform/resolvers ^5.4.0`, `useForm` in 9 files). Both files are stale and mutually reinforce a false statement.
- **ADR 0010 (graphile-worker) is Accepted but unimplemented** — `apps/web/app/jobs/` is a README-only stub; the bank/email flows run inline. Self-acknowledged in STATUS, but the ADR reads as shipped. (ADR 0009's named LLM backends — Ollama/vLLM/Qwen/Langfuse — are likewise unwired, though the OpenAI-compatible abstraction is real.)
- **CI gate list is restated in two docs that disagree with each other and with `ci.yml`**: `quality-bar.md:37` omits `backlog validate`; both it and `runbook.md:52` predate `knip` / `mva:validate` / `ehf:validate` now in the pipeline. State it once (link to `ci.yml`).
- **`AGENTS.md:18` names `pnpm format` (write-mode) as a static gate** where CI/CONTRIBUTING/quality-bar use `format:check`; `runbook.md` gets it right.
- **DR runbook describes "six integrity triggers"** including `posting_balance` / `voucher_posted_complete` categories that were later `DROP`ped; the live, mechanically-generated count in `architecture.md:64` is 7 (`disaster-recovery.md:93`).
- **Backlog:** `feat-enhetsregisteret-cache` is implemented in code (`enhetsregisteret/throttle.server.ts` + `oppslag.tsx` loader) but still `todo`; `oppslag.tsx:28-30` carries a stale "a proper cache is a separate task" comment sitting directly above the code that does it.
- **Dead scaffolding:** `integrations/skatteetaten/validation-client.server.ts` is imported only by its own test and targets a self-described "PROVISIONAL — best-effort guess" endpoint path — reads as ready but would POST melding XML to an unverified URL if wired.
- Old review reports (`repo-consistency-audit-2026-06-23.md`, `repo-code-review-2026-06-28.md`) are unreferenced and superseded — consider archiving under `docs/decisions/`-adjacent history or noting them closed.

## 8. Verified clean (checked, no finding — do not re-flag)

- Money core (`money/ore.ts`): single half-away-from-zero rounding, `-0` normalization, string-assembled øre, sub-øre rejected; ReDoS-hardened scans.
- RLS/tenancy: every tenant table ENABLE+FORCE+USING+WITH CHECK, fails closed on unset/empty GUC; `withOrgTx` uses transaction-local `set_config`; TRUNCATE never granted to `saldo_app`. Auth-table RLS exemption is deliberate and CI-guarded.
- Gapless numbering: counter allocation serializes on the row lock in the issuing tx; double-issue loser aborts on `voucher_invoice_uniq` and rolls back its allocation.
- Auth core: hashed opaque session tokens, OIDC keyed on `(iss,sub)` with `email_verified` required, PKCE+state+nonce, timing-safe dummy verify, dual-key login throttle.
- LLM residency gate: classifies hosts by parsed IP value (`node:net`), rejects obfuscated numerics, defaults feature-off. AI propose-only boundary holds end-to-end; provenance is validated and persisted atomically.
- XML parsing safe against entity-expansion DoS (fast-xml-parser limits); secret/PII log redaction consistent; all external clients carry AbortController timeouts and typed no-throw results.
- GitHub Actions all SHA-pinned with least-privilege `permissions:` blocks; Node/pnpm versions consistent across `.nvmrc`/engines/CI/Dockerfile; turbo domain→web invalidation works.
- knip/typecheck/lint green; no dead shadcn components; the `en` copy export feeds the parity test (not dead).
