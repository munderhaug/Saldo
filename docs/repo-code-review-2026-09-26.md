# Saldo — Repository Audit & Direction Review (2026-09-26)

> Successor to [`repo-code-review-2026-07-03.md`](repo-code-review-2026-07-03.md). **Scope:** the whole
> repository at `78fe4e1` **plus its live state on GitHub** (CI runs, open PRs, Dependabot, issues),
> twelve weeks after the last commit. **Method:** seven area-scoped review passes (domain ·
> DB/migrations · routes/auth/contracts · integrations · UI/copy/a11y · harness/CI · docs/ADRs/backlog),
> then lead re-verification of every P0 and most P1s — by execution (a scratch Postgres driven as
> `saldo_app`, probe scripts, the real route handlers) or against the committed primary sources. No code
> was changed; this is a work-list plus an assessment.
>
> **Confidence tags:** **[exec]** reproduced by execution · **[src]** checked against a committed primary
> source · **[read]** confirmed by reading code/config · **[plausible]** reasoned, not reproduced.
> **Severity:** **P0** = a hard invariant not enforced, ordinary use corrupting the books, or a
> guaranteed outage · **P1** = a wrong money/filing result or a security gap (including latent, in
> shipped code) · **P2** = edge-case correctness, robustness, duplication, test gaps, misleading docs ·
> **P3** = minor.

## 1. Executive summary

**The code that exists is carefully built; the product it adds up to is not yet a correct bookkeeping
system, and the repository has been quietly decaying for twelve weeks.**

What holds: every local gate is green (typecheck, lint, format, lint:repo, knip); 537 domain tests and
481 web tests pass, including 176 integrity tests against a real Postgres. Money is branded integer øre
throughout, tenancy is FORCE RLS with a fail-closed GUC, every route authorizes before it touches org
data, the AI surface is propose-only with durable provenance, and integrations fail closed. Most fixes
from the 2026-07-03 review hold.

What does not:

1. **The SQL integrity layer has holes** — the layer `docs/architecture.md` calls the last line of defence. Lines can
   be moved out of an issued invoice; the app role can rewrite the VAT codes, account numbers and fiscal
   periods under posted entries (and unlock and re-lock a period); one tenant can append postings to
   another tenant's _posted_ voucher; gapless numbering is a convention, not a constraint. All reproduced
   as `saldo_app` (§3, P0-1).
2. **Ordinary use books wrong money.** Foreign-currency documents post their face value as NOK; "Marker
   som betalt" marks an invoice paid with no settlement voucher; an invoice can be credited several times
   over; owner events and opening balances can be posted twice (§3–§4.1).
3. **Time bombs.** From **1 January 2027** the home page throws for every user with an org (tax
   parameters exist only for 2026). Every January the previous year's SAF-T export fails as soon as a
   document dated in that year is posted. "Today" is computed in UTC, so an invoice issued just after midnight on
   1 January lands in the previous fiscal year (§3, §4.2, §4.6).
4. **The ledger model lacks bookkeeping fundamentals** the build spec requires: no voucher date
   (bilagsdato) or voucher number, no document (bilag) storage at all — receipt images are discarded after
   AI extraction — only the annual MVA term, and nothing ever locks a period. None of these is a backlog
   task (§4.5).
5. **Filing is wired to unverified integrations that, in places, contradict their own captured
   sources.** The Skatteetaten validation client calls a different path than the committed capture
   documents; the Altinn envelope omits a field the capture says is required; the filing record is
   written before anything is uploaded; the melding's reverse-charge lines contradict Skatteetaten's
   committed official example (§4.2–§4.3).
6. **Operational rot since 5 July.** The weekly Security workflow on `main` has failed for six weeks (a
   gitleaks false positive nobody triaged); `pnpm audit --prod` reports 9 advisories (3 high) whose
   Dependabot fixes cannot merge because the grouping splits the `react-router` packages; the
   critical-path PR #71 (year-end close) has waited twelve weeks on one auto-fixable lint error; the
   freshness issue #56 can never close; the Altinn/Skatteetaten sources expire in nine days (§4.7, §9).

**Direction.** In two weeks the project ran the build spec's phases 0 → 9 end to end — 60 merged PRs,
63 ADRs, ~24k lines of product code and ~12k lines of docs, ADRs and harness — but went _wide_ before the
bookkeeping core was _deep_, and before anything was deployed or exercised against a live system. The
agentic harness is sophisticated, yet several of its gates check presence rather than truth (a
"code-true" generated block that miscounts triggers, a freshness gate that reads only the first date on
a page, a DR verifier that derives its expectations from the state it verifies, a Definition-of-Done
checklist asserting a green lint that CI shows red). The recommendation is to **freeze feature breadth,
fix correctness in SQL and posting, complete the ledger model (date, number, bilag, terms, locks), and get
one vertical slice running in a real EU staging environment** before adding anything else (§10–§11).

### Top actions (in order)

| #   | Action                                                                                                                                                                                                                                                       | Why now                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| 1   | Unblock ops: a gitleaks allowlist for `db/reference/**`; regroup Dependabot so `react-router` + `@react-router/*` move together and majors are never grouped; merge the security bumps; fix the one lint error on PR #71                                       | Security gate red for 6 weeks; 3 high advisories; critical path stalled |
| 2   | Capture the 2027 tax parameters **and** make the honest number fail soft                                                                                                                                                                                      | Home page fails for every user on 2027-01-01                   |
| 3   | Close the SQL holes: line re-parenting, reference-table grants, composite FKs + a fail-closed insert guard, a gapless-numbering trigger                                                                                                                        | Hard invariants are not actually enforced                      |
| 4   | Refuse non-NOK documents; make "mark as paid" post a settlement (or remove it); cap credit notes at the source's gross; server-side idempotency on every posting action; opening balances at most once                                                         | Ordinary use corrupts the append-only ledger                   |
| 5   | An Oslo-time "today"; posting year from the document date; SAF-T dates that cannot fall outside the period                                                                                                                                                      | January breaks SAF-T and misdates documents                    |
| 6   | Capture bokføringsloven/-forskriften, then add `voucher_date` + a voucher number, a document (bilag) store with retention, bimonthly terms + an org term setting, and period locks on filing and year-end                                                      | Missing fundamentals of a system of record                     |
| 7   | Keep Altinn/Skatteetaten submission off until path, response model and `instansstatus` match the captures, outcomes are recorded append-only, and the reverse-charge coding follows the official example; re-capture the sources before 2026-10-05          | The filing flow contradicts its own sources                    |
| 8   | Require proof of authority (BankID identity × Brønnøysund roles) before an org can send invoices, EHF or filings                                                                                                                                                | Invoice-redirection fraud through Saldo's own sender           |
| 9   | Stand up an EU staging environment (Neon + PaaS + a Criipto test tenant + tt02) and prove one vertical slice live                                                                                                                                               | Nothing has ever run outside localhost                         |
| 10  | Right-size the process: STATUS as ~80 lines of state; ADRs for decisions only; semantic freshness/arch/DR gates; the real critical path encoded in the backlog                                                                                                  | Docs and gates are producing false confidence                  |
| 11  | Owner decisions: public vs private repository (the licence says proprietary); the SAF-T account-list licence (Regnskap Norge); LLM hosting; the product name                                                                                                    | Blocking or legal-risk items code cannot settle                |

## 2. Health snapshot

| Signal                   | State on 2026-09-26                                                                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Local gates              | typecheck · lint · format:check · lint:repo · knip — **all green**                                                                                                         |
| Tests                    | domain 537/537 · web 481/481 across 65 files with a real Postgres (238 of them skip without one) · eslint-plugin 23/23 · integrity suite 176/176                            |
| `main` CI                | green at the last push (2026-07-05); **weekly Security run red since at least 2026-08-17** (gitleaks)                                                                        |
| Dependencies             | `pnpm audit --prod`: 9 advisories, 3 high (`react-router` 8.1.0, `fast-xml-parser` 5.9.3, `nodemailer` 9.0.3); the all-dependencies audit in issue #56: 46 (1 critical, 27 high) |
| Open PRs                 | #71 year-end close (critical path), red on one lint error since 07-05 · 8 Dependabot PRs (oldest 07-13); the production group PR is red on a version skew                      |
| Open issues              | #56 "Weekly repo freshness" — structurally unable to close (§9)                                                                                                           |
| Activity                 | 60 merged PRs (51 authored, 9 Dependabot) between 2026-06-22 and 2026-07-05; no commits since                                                                                                              |
| Deployment               | none; no live Neon, R2, Criipto, Postmark, GoCardless, Skatteetaten or Altinn exercise on record                                                                           |
| Repository visibility    | **public** on GitHub, while `LICENSE` and ADR 0023 declare the code proprietary                                                                                              |
| Size                     | domain 5.3k LOC + 6.2k test · web 17.1k LOC + 10.3k test · SQL 1.6k · docs 9.6k (of which ADRs 3.8k) · harness + tools 3.2k                                                  |

## 3. P0 — critical

### P0-1 · The SQL integrity layer does not enforce what AGENTS.md says it enforces **[exec]**

Reproduced on a scratch database built from all 19 migrations, as the `saldo_app` role with
`app.current_org` set — exactly how the app connects.

- **Lines can be moved out of an issued invoice or a posted supplier invoice.**
  `block_issued_invoice_line_mutation` checks `COALESCE(NEW.invoice_id, OLD.invoice_id)`, which on UPDATE
  is only the _destination_ parent (`db/migrations/20260625190355_sales_invoicing.sql:158-173`; copied into
  `20260629144123_supplier_invoices.sql:137-152`). `UPDATE invoice_line SET invoice_id = <draft> … WHERE
  invoice_id = <issued #1>` committed; issued invoice #1 was left with lines summing 10 000 øre against a
  frozen `net_ore` of 20 000, and its PDF/EHF render from those lines. This is the same bug class as the
  `voucher.period_id` move-out fixed in `20260629065742`.
- **The app role can rewrite the meaning of posted entries.** `saldo_app` holds `UPDATE, DELETE` on
  `account`, `vat_code` and `fiscal_period`, and no trigger protects them
  (`20260622225726_tenancy_force_rls_app_role.sql:41-43`). Verified: VAT code `3` renamed to `6x` (posted
  legs then report under another code, because `aggregateVatByCode` groups by `vat_code.code`) and fiscal
  period 2026 moved to 2024 (every posted voucher changes year in every report). The DB pass also unlocked a
  locked period, posted into it and re-locked it with a backdated `locked_at`. The app only ever INSERTs
  these tables, so revoking is safe.
- **Cross-tenant append into a posted voucher.** `posting.voucher_id/account_id/vat_code_id` and
  `voucher.reverses_voucher_id` are single-column FKs (`20260622090000_core_ledger.sql:53,61-63`), and the
  INSERT guard's `SELECT … FROM voucher` runs under the caller's RLS — another tenant's voucher is
  invisible, `v_posted` is NULL, and the insert passes
  (`20260703190656_posting_append_only_insert_guard.sql:14-25`). As org A, two balanced postings were
  appended to org B's posted voucher (4 rows afterwards). It needs a foreign UUID and there is no UI path,
  but it breaks ADR 0012 and the append-only invariant together — and it disproves the previous review's
  statement that `matched_voucher_id` was the only cross-row reference without a same-org FK.
- **Gapless numbering is an application convention, not a constraint.** `saldo_app` can call
  `allocate_invoice_number()` outside an issue (a gap) or INSERT an issued invoice with an arbitrary number
  and no voucher; with the GUC unset, the SECURITY DEFINER function bumps another tenant's counter wherever
  its owner is a superuser (local, CI, self-host) **[exec, DB pass]**.

**Fix:** reject parent-id changes on line UPDATE and check the OLD parent; `REVOKE UPDATE, DELETE ON
account, vat_code`, and restrict `fiscal_period` to INSERT + `UPDATE(locked_at)` with a trigger that
forbids unlocking; composite `(…, organization_id)` FKs (`NOT VALID` then `VALIDATE`) and an insert guard
that raises when the voucher is not found; a trigger requiring an issued invoice's number to equal the
counter's `next`, plus a deferred "issued ⇒ exactly one voucher" check. Each with a bad-case integrity
test — the pattern that already works well in `test/integrity/`.

### P0-2 · The home page will fail for every user from 1 January 2027 **[exec]**

`taxParamsFor` is fail-closed and `PARAMS_BY_YEAR` holds only 2026
(`packages/domain/src/tax/params.ts:56-77`). `home.tsx:48-51` passes the wall-clock year to
`honestNumberFromLedger`, which throws `RangeError: No committed tax parameters for 2027` even for an empty
ledger. `/` is the post-login landing page. `SUPPORTED_TAX_YEARS` exists, but only tests read it.
**Fix:** capture the 2027 skattevedtak (adopted in December) and have the bridge return a typed "no
estimate for this year" state instead of throwing inside a loader.

### P0-3 · Foreign-currency documents are booked as NOK **[exec]**

Both contracts accept any ISO code (`contracts/invoice.ts:82-86`, `contracts/supplier-invoice.ts:71-75`),
the forms prefill the currency from the contact (`invoices.new.tsx:79`, `purchases.new.tsx:67`), and
posting ignores it (`db/invoices.server.ts:463-656`, `db/supplier-invoices.server.ts:395-514`); `posting`
has no currency column and reconciliation compares amounts only. A EUR 1 000 + 25 % supplier invoice posted
`6790 D 100 000 / 2710 D 25 000 / 2400 C 125 000` øre — euros booked as kroner plus Norwegian input VAT,
then carried into the melding and SAF-T. The receipt path already refuses non-NOK
(`packages/domain/src/extraction/map.ts:26-28`), so this is an unguarded gap rather than a design choice.
**Fix:** until FX handling is designed, restrict both contracts to NOK and guard at issue/post; require
currency equality in reconciliation.

## 4. P1 — high

### 4.1 Ledger and sub-ledger correctness

- **"Marker som betalt" marks an invoice paid with no settlement voucher [exec].**
  `invoices.$invoiceId.tsx:162-178` → `transitionInvoice` sets the status only
  (`db/invoices.server.ts:665-690`). Account 1500 keeps the receivable while the reskontro drops it (ADR
  0051's tie-out breaks), and the real bank payment can no longer be matched. Remove the manual transition,
  or post the settlement atomically the way `reconcileMatch` does.
- **An invoice can be credited several times over [exec].** `createCreditNoteDraft` never checks for
  existing credit notes (`db/invoices.server.ts:697-742`), and issue only checks that the source voucher
  exists. Two full credit notes drove account 3000 to −100 000 øre and 1500 to −125 000 while the invoice
  stayed open to the matcher.
- **Double-submit posts twice, and no posting action has a server-side guard [exec].** `owner.new.tsx:176-181`
  is a raw submit button (two concurrent POSTs → two posted vouchers); manual vouchers, receipts and opening
  balances rely only on the client-side `SubmitButton`. Add an idempotency nonce (a unique column or an
  advisory lock) to every posting action.
- **Opening balances can be posted repeatedly [read].** There is no existence check
  (`db/posting.server.ts:219-264`, the `opening.tsx` action); the voucher type stays `'manual'` and the
  audit act is the generic `voucher.posted`, so an opening voucher cannot even be identified in SQL. The
  route has **no test at any layer**, although it writes to the ledger and the quality bar requires a
  Testcontainers test for that.
- **Supplier-invoice posting takes no lock and ignores its row count [exec].** `db/supplier-invoices.server.ts:400`
  reads without `FOR UPDATE`, and the draft → posted UPDATE ignores its result (`:485-488`). A concurrent
  draft save makes the posted document disagree with its AP voucher (both then immutable); concurrent posts
  end in a 500 on `voucher_supplier_invoice_uniq`. Mirror `issueInvoice`.
- **Zero-priced lines produce 0/0 legs, which the SQL CHECK rejects [exec].** `posting/sales-invoice.ts:126-128`,
  `posting/purchase-invoice.ts:80-104`; issue/post returns a 500.
- **Credit notes are blocked after a registered → unregistered status change [read].** `issueInvoice`
  re-runs `computeLine` under the _current_ status for every line (`db/invoices.server.ts:482-497`), so
  the only permitted correction for VAT that was charged cannot be issued. Derive credit notes from the
  original's frozen treatment.

### 4.2 Filing and reporting (MVA-melding, SAF-T, the honest number)

- **The melding's reverse-charge lines contradict Skatteetaten's official example [src].** The
  self-assessed output leg is coded with the ordinary domestic code `3`/`31`/`33`
  (`apps/web/app/db/posting.server.ts:122-127`). The committed
  `db/reference/skatt/mva-melding/examples/eksempelMedAlleTilfeller.xml:150-160` reports code 86 as
  `grunnlag 10000, sats 25, merverdiavgift 2500` plus a separate `-2500` deduction line. Saldo's code-3
  line therefore carries VAT without the matching base, and code 86 carries only the deduction.
  `docs/regulatory/mva-melding.md:69-73` calls the difference "presentational" without citing a source.
  With ADR 0063 this melding is now submittable.
- **SAF-T for year N fails once a year-N document is posted in year N+1 [exec].** Transactions are dated
  with `to_char(voucher.posted_at)` (`db/saft.server.ts:71`) but selected by `fiscal_period.year`, which
  comes from the _document_ date (supplier-invoice date, issue date, bank booking date).
  `generateSaftFinancial` throws on the mismatch (`packages/domain/src/saft/financial.ts:237-241`) and
  neither SAF-T route catches it. Every January this makes the previous year's statutory export fail for
  good, since the ledger is append-only. Root cause: there is no voucher date (§4.5).
- **The honest number overstates "spendable" by reverse-charge VAT [exec].**
  `income = revenueNet + outputVatCollected` (`packages/domain/src/honest-number/from-ledger.ts:57`), and
  `aggregateLedger` counts the self-assessed reverse-charge output leg (`db/ledger.server.ts:38`). Buying
  foreign SaaS inflates the product's headline figure by the reverse-charge VAT.
- **A zero-rated org's manual income never reaches the melding [read].** `deriveStandardIncome` books every
  status other than `registered_standard` with no VAT code (`packages/domain/src/posting/manual.ts:41-50`),
  and the melding query inner-joins `vat_code`.
- **Only the annual term exists, and the default year is the current, unfinished one [read].**
  `ANNUAL_TERM` is hard-wired (`orgs.$orgId.mva.tsx:84,163,178,222`), while
  `docs/regulatory/mva-melding.md:49-53` records that the default cadence is six bimonthly terms and that
  årstermin must be applied for. There is no org cadence setting and no guard. The MVA and SAF-T pages have
  no year navigation (`resolveYear` defaults to the current year, `lib/fiscal-year.ts:9-13`; the overview
  links carry no `?year`), so last year's return is reachable only by editing the URL.

### 4.3 Filing integrations vs. their own captured sources (latent: gated off until `ALTINN_*` / `SKATT_*` are set)

- **The validation client calls an undocumented path with the wrong response model [src, exec].** The code
  posts to `/api/mva/melding/validering` (`integrations/skatteetaten/validation-client.server.ts:45`); the
  committed capture (`db/reference/skatt/mva-melding/innsending/2026-07-05-api.html`) documents
  `POST …/api/mva/grensesnittstoette/mva-melding/valider`, answering with a `valideringsresultat` whose
  `status` is `UGYLDIG_SKATTEMELDING` plus `valideringsfeil` entries. Given the captured body, the client
  returns `invalid-response`. The 2026-07-03 item ("targets an unverified path") was wired into the UI, not fixed.
- **The envelope omits `instansstatus`, which the capture says is required [src].** The captured API page
  lists "Valideringsfeil: instansstatus er påkrevd i MvaMeldingInnsending" (a 409 when null);
  `buildMvaMeldingInnsendingXml` never emits it (`packages/domain/src/mva-melding/innsending.ts:33-47`),
  and the XSD's `minOccurs="0"` lets the local gate pass.
- **The filing record is written before anything is filed [read; exec with a stubbed 409].** Phase 1
  commits the `mva_filing` row and the `mva_filing.submitted` audit act after only _opening_ the instance
  (`orgs.$orgId.mva.tsx:188-212`); the phase-2 outcome is never recorded. After a failure the page shows
  "Innsending {dato}", a plain retry is refused as `already-filed`, and the retry form sends `refile=true`,
  which can create a second, unintended korrigert melding after an ambiguous timeout. The migration comment
  ("the row's existence IS the status … uploaded", `20260705114846_mva_filing.sql:25`) does not describe
  what the code does. The XML is also regenerated at click time with no digest of the figures the user
  reviewed, and phase 1 performs network I/O inside the tenant transaction and advisory lock.
- **One operator ID-porten token acts for every tenant [read].** `ALTINN_ID_PORTEN_TOKEN` and
  `SKATT_VALIDATION_TOKEN` are single environment values (`integrations/altinn/config.server.ts:45-69`)
  with no restriction to tt02 hosts. Combined with the org-claim gap in §4.4, any user could file under the
  token holder's signing rights.
- **The sources expire:** `docs/integrations/altinn-mva-innsending.md` has verify-by **2026-10-05**; it is
  the only technical source, on a site bannered UTDATERT.

### 4.4 Security and privacy

- **Any user can create an org for any organisation number [read].** `orgs.new.tsx:42-57` checks only the
  mod-11 checksum; `org_nr` is globally UNIQUE, so the first claimant wins permanently. The squatter
  controls the payout account printed on every invoice and EHF, and can email invoices "fra {victim}" from
  Saldo's own `EMAIL_FROM` — invoice-redirection fraud with Saldo's sender reputation. It needs BankID
  identity × Brønnøysund roles verification (or an "unverified" state that blocks sending, EHF and filing)
  and a claim/dispute path.
- **Unhandled database errors write personal data to stdout [exec].** `entry.server.tsx` exports no
  `handleError`, so React Router's default `console.error` logs Drizzle's `Failed query … params: …`,
  including names, notes and email addresses — bypassing the pino redaction list and
  `.claude/rules/data-handling.md`. Every 500 in this report triggers it.
- **Known-vulnerable production dependencies [exec].** `fast-xml-parser` 5.9.3 (repeated DOCTYPE
  declarations reset the entity-expansion limits the camt.054 upload path relies on — the previous review's
  "safe against entity expansion" no longer holds); `nodemailer` 9.0.3 (an O(n²) address parser and
  recipient-domain validation bypasses); `react-router` 8.1.0; `qs`; `morgan`. CI's audit step ends in
  `|| true`, so none of this fails a build.
- **GoCardless account ids are user-typed under one shared credential [read; latent].** The id is free
  text (`bank.new.tsx:47,109-113`), not UNIQUE, and included in the raw export: anyone holding an org's
  export can bind its account id in an org of their own and pull that org's live transactions for as long
  as the agreement lasts.
- **Agent tooling runs unpinned code and can reach production.** `.mcp.json` starts
  `npx -y @modelcontextprotocol/server-postgres` (deprecated upstream; its read-only guard is a
  `BEGIN TRANSACTION READ ONLY` that a stacked `COMMIT;` escapes) and `npx -y brreg-mcp` unpinned at every
  session start, both inheriting the session environment; the Neon MCP uses a full-access API key with no
  `readonly`/`projectId` scoping and no permission rule. **[read]**
- **The GitHub repository is public** while `LICENSE` and ADR 0023 say proprietary. It also carries the
  Regnskap Norge SAF-T account list, whose notice limits use to SAF-T mapping (ADR 0032 seeds it as every
  org's working chart), and ~360 KB of verbatim Skatteetaten HTML, against `db/reference/skatt/SOURCE.md`'s
  "never reproduced". This is an owner/legal decision, but it should be a deliberate one.

### 4.5 The ledger model: fundamentals the build spec requires but the schema lacks

- **No voucher date (bilagsdato) and no voucher number.** `voucher` has `period_id`, `posted_at` and
  `created_at` only (`db/migrations/20260622090000_core_ledger.sql:48-56`). Manual vouchers, receipts,
  owner events and opening balances post into `systemClock.now().getFullYear()` (`vouchers.new.tsx:65`,
  `receipts.new.tsx:166`, `owner.new.tsx:57`, `opening.tsx:66`). The receipt's AI-extracted `documentDate`
  is displayed and then discarded (only a hidden form field, `receipts.new.tsx:464`). SAF-T writes
  `posted_at` as TransactionDate, SystemEntryDate and GLPostingDate
  (`packages/domain/src/saft/financial-xml.ts:144-147`). Consequences: a December receipt entered in
  January lands in the wrong year and MVA term; bimonthly terms are impossible (ADR 0050 says as much);
  SAF-T breaks (§4.2).
- **No document (bilag) storage at all.** None of the 22 tables stores documents and there is no object
  storage client; receipt images are "processed transiently … never persisted"; supplier invoices have no
  attachment. Build spec §4.5 ("every voucher links to its documentation … retention 5 years"),
  `docs/tech-stack.md:35` and `docs/architecture.md:22` present R2 document storage as current, and ADR
  0038's bucket lock waits on a document-write path that does not exist. There is no backlog task.
- **Nothing ever locks a period.** No code writes `locked_at`; filing does not freeze the filed term, and
  `mva_filing` stores no totals or hash of what was filed. (The year-end close in PR #71 would add the first
  writer.)
- **Bokføringsloven and -forskriften were never captured** (`bokforingslov-doc` is still todo), so the
  "compliance-grade" ledger was designed without its primary legal source in the repository.

### 4.6 Dates and time

- **"Today" and "this year" are UTC [read].** `new Date().toISOString().slice(0, 10)`
  (`invoices.$invoiceId.tsx:131`), `getFullYear()` in five routes and the shared year resolver, and no
  `TZ` in the image (`infra/docker/Dockerfile`). An invoice issued between 00:00 and 01:00 (02:00 in summer) Oslo time is
  dated the day before; on 1 January it posts into the previous fiscal year and MVA return. The injectable
  `systemClock` exists, but the issue path bypasses it.
- **Date validation is regex-only; cross-field rules live only in SQL CHECKs [exec].** `blankOrIsoDate`
  (duplicated in `contracts/invoice.ts:40` and `contracts/supplier-invoice.ts:26`) accepts `2026-02-30`
  (→ 500) and `2062-01-15` (→ `ensureFiscalPeriod` creates fiscal year 2062 and posts the immutable AR
  voucher there). Issuing a draft whose stored due date has passed sets `issue_date = today > due_date`
  and violates `invoice_due_after_issue` (`sales_invoicing.sql:77-78`) → a 500 in an ordinary flow.

### 4.7 Operations and supply chain

- **The Security workflow has been red on `main` for six weeks [exec].** Gitleaks flags
  `googleRecaptchaSiteKey` inside the captured `db/reference/mva/2026-06-22-skatteetaten-vat-rates.html:543`
  — a public site key, so a false positive. There is no `.gitleaks.toml`; a real leak would now go
  unnoticed. (Commits before PR #17 are not in the shallow clone and were not scanned locally.)
- **Security updates cannot merge [exec].** `.github/dependabot.yml:8-13` groups by dependency _type_, so
  `@react-router/dev` (dev) stays at 8.1.0 while `react-router` and `@react-router/serve` (production) jump
  to 8.4.0; PR #98 fails `docker-build` and `verify` on the skew. The same grouping let three **majors**
  (React Router 7 → 8, Zod 3 → 4, tailwind-merge 2 → 3) land as one "low-risk" PR (#60) with no ADR,
  although `docs/tech-stack.md` requires one for stack changes.
- **The critical path is stalled.** PR #71 (year-end close) fails `verify` on a single
  `@typescript-eslint/no-unnecessary-type-assertion` at `orgs.$orgId.year-end.tsx:47`, while its
  Definition-of-Done checklist states that lint was green.

## 5. P2 — medium, by area

### Domain (`packages/domain`)

- Codes 21/22 (import-VAT basis) are still melding-reportable and classified as reverse charge — the
  2026-07-03 P1-4(b) fix handled code 6 only (`mva-melding/melding.ts:95-98`, `saft/tax-codes.ts:85-93`).
  **[exec]**
- A purchase line coded 6 is reported as unntatt _turnover_; there is no `checkPurchaseLine` mirroring
  `checkSalesLine`. **[exec]**
- Purchase invoices round VAT per line, contradicting ADR 0054's category-level rule; the same lines
  differ by an øre per extra line between the sales and purchase derivations. **[exec]**
- EHF for a domestic reverse-charge sale (code 51, category AE) is emitted as Z and fails Saldo's own
  BR-Z-08 check (`invoice/invoice.ts:206-219`, `db/invoice-document.server.ts:217-242`). **[exec]**
- Bank CSV import: non-ISO dates silently become `bookingDate: null`; identical rows collapse into one
  fingerprint without being reported; an impossible date fails the whole import with a 500
  (`banking/csv.ts:300-301`, `banking/transaction.ts:185-196`, `db/bank.server.ts:155`). **[exec]**
- `validateMvaMelding` has no sign rule and no `grunnlag × sats` consistency check, and its property test
  generates VAT of either sign for any code — which is why the reverse-charge and code-21 errors pass.
  **[exec]**
- The negative/zero-amount policy differs between derive functions (`deriveReverseChargePurchase` and
  `deriveDrawing` are unguarded; others throw or return typed errors). **[exec]**
- Half-øre ties round the wrong way at the 11.11 % rate and with 3-decimal quantities (`saft/rates.ts:22`,
  `invoice/invoice.ts:38-40`) — small amounts, but it breaks the "never float math" invariant. **[exec]**
- `likviditet` hard-codes `outstandingPayablesØre: 0` although AP now exists
  (`reports.likviditet.tsx:53`); balanse and likviditet aggregate one year only until the year-end close
  merges.
- Stale docstrings still say reverse charge is "not yet implemented", including a rule-violation message
  (`rules/vat-line.ts:38`, `posting/derive.ts:54`, `posting/types.ts:2-4`, `vat/line-treatment.ts:31`).

### DB and query layer

- The DR verifier reports OK on a restore that lost RLS on `posting` — it derives the tenant set from
  `relforcerowsecurity`, the very property under test — and it omits both supplier-invoice immutability
  triggers (`db/dr/verify-restore.sql:41-45,55-58`). The restore drill's immutability probe
  (`UPDATE voucher SET type='tampered'`) fails on the CHECK constraint whether or not the trigger exists
  (`tools/restore-drill.sh:110-115`). **[exec]**
- `audit_log` accepts a forged `created_at`, an action/entity-table mismatch and a non-member actor on
  INSERT (`20260705110631_audit_log.sql`). **[exec]**
- The full export omits `mva_filing`; no test checks table coverage; its 17 reads run under READ
  COMMITTED, so the file is not a consistent snapshot (`db/export.server.ts`). **[read]**
- Bank-account creation and statement import are not audited; a failed email send is audited as
  `invoice.sent`. **[read]**
- A reconciliation link can be undone (`matched_voucher_id` set back to NULL), and a `posted` supplier
  invoice can be inserted without a voucher. **[exec]**
- The `posting` UPDATE trigger returns `OLD`, so updates silently no-op; a naive "fix" to `RETURN NEW`
  would open a re-parenting hole. **[exec]**
- Voucher + posting insertion is implemented three times, and the two newer copies drop the chart checks —
  a missing VAT code posts an uncoded leg that silently leaves the melding (`db/posting.server.ts:355-402`,
  `db/invoices.server.ts:634-656`, `db/supplier-invoices.server.ts:490-511`).
- `ensureFiscalPeriod` is check-then-insert, so the first two concurrent postings of a new year end in a
  500 (`db/posting.server.ts:277-299`). **[exec]**
- `rls-coverage.integration.test.ts` checks only that a policy exists and SELECT is granted; it would not
  catch a USING-only policy or UPDATE/DELETE granted on an append-only table.

### Routes, auth and contracts

- Upload bodies are buffered in full before authentication — an unauthenticated 30 MB POST to the receipt
  route is read completely before the redirect (`receipts.new.tsx:121` versus `:219`). **[exec]**
- The rate limiter's "right-most X-Forwarded-For hop" is a Cloudflare egress address in the documented
  Cloudflare → PaaS topology, so the `/oppslag` and login budgets are shared per Cloudflare location
  (`lib/client-ip.server.ts:13-21`). **[plausible]**
- Unsaved edits are silently discarded when posting or issuing: the editor and the post/issue button are
  separate forms, and the action books the _stored_ draft (`purchases.$purchaseId.tsx:132-154`,
  `invoices.$invoiceId.tsx:280-300`). **[read]**
- Filing is one click, styled like the read-only "Valider", with no step that restates org, year and
  amount; the page also tells the user that filing via Altinn "kommer senere" directly above the new
  "Send inn via Altinn" button (`copy/messages.ts:609-610`, `orgs.$orgId.mva.tsx:343`). **[read]**
- Test gaps: opening balances (none at any layer), the active-org cookie at route level, supplier
  `updateDraft`, the `invoices/new` action and credit-note/transition intents, all report routes, all
  auth routes.

### Integrations

- Timeouts stop at the response headers in all five HTTP clients; bodies are read without a deadline (a
  stalled body held a request for more than 40 s), so the "aggregate deadline" comments are false. SMTP
  sets no connection/greeting/socket timeouts (nodemailer defaults: 2 and 10 minutes). **[exec]**
- Redirects are followed (a 307 re-sent a full POST body to another host) and `http:` URLs pass the
  residency gates for LLM, Altinn and Skatteetaten; the fixed Norwegian authorities could be host-pinned.
  **[exec]**
- ADR 0063 does not record that filing runs inline rather than as a job, unlike ADR 0046/0047, and
  `.claude/rules/integrations.md` still mandates graphile-worker for retryable work.
- `env.ts` covers DB/auth/email/banking, while SKATT/ALTINN/LLM variables are read directly from
  `process.env` and are not in the contract at all (email and banking are parsed in both places); a value
  such as `ALTINN_EU_RESIDENT=TRUE` silently disables filing.
- `mva:validate` validates only the envelope, although the committed melding XSD has no imports and
  validates with `xmllint-wasm` today.

### UI, accessibility and copy

- The purchases/owner surfaces added after the last review re-introduce what that review removed: raw
  submit buttons, `formatKr(…) + 'kr'` without an accessible unit (9 sites), raw ISO dates,
  `inputMode="numeric"` (no comma on iOS), no `<title>` on `purchases.new`, and lost input after a no-JS
  error — because `supplier-invoice-form.tsx` is a fork of `invoice-form.tsx`.
- The root `ErrorBoundary` renders raw English `error.data`/`statusText` ("404 Not found", "Unexpected
  Server Error").
- WCAG: input borders are 1.37:1 against the page (1.4.11 requires 3:1); there is no route announcer or
  focus management after navigation; the date fieldset's legend is the page's intro sentence; repeated
  line items share identical accessible names.
- The `.dark` theme block (~125 lines) is unreachable, and would fail AA if enabled (badge text at
  1.75:1, focus ring at 2.93:1).
- `eslint-plugin-saldo` only catches scale steps whose names collide with Tailwind's palette, never lints
  class strings in `.ts` files, and cannot see string literals inside JSX expressions.

### Harness, CI and infrastructure

- Four of five hooks use cwd-relative `./.claude/scripts/…` paths; after any `cd` they fail to start
  (exit 127) and the action proceeds — the generated-file guard, the edit-time typecheck/lint, the docs
  lint and the Stop green-bar all fail open. `review-reminder.sh` is unregistered, and even if registered
  it writes to stderr with exit 0, which the agent never sees. **[exec]**
- The migration-integrity gate diffs `base.sha..head.sha` (two dots) against the base tip, so integrity
  tests changed on `main` since the fork point satisfy it; touching any file under `test/integrity/`
  also does (`.github/workflows/ci.yml:93`). **[exec]**
- The reviewer gate misses most of the VAT/AI surface — the whole `mva-melding/` module, `saft/rates.ts`,
  `saft/tax-codes.ts`, `invoice/invoice.ts`, `extraction/map.ts`, the receipt route — and renames escape
  it (`tools/review-gate.mjs:27-48`). **[exec]**
- `pnpm test:tools` matches zero files under `tools/` and passes on zero tests; none of the gate scripts
  (review-gate, repo-lint, backlog, status-block, arch-graph, commit-lint…) has a test, a lint or a
  typecheck. **[exec]**
- If CI ever loses Docker, 39 integrity/route test files skip and the build stays green; the Testcontainers
  image is tag-only `postgres:16` (the digest pin went only to the service container, which these tests do
  not use). **[exec]**
- `deploy-migrate.yml` can be dispatched on any branch — nothing in the repository restricts it to
  `main`; only out-of-repo Environment protection stands between an unreviewed branch and production
  migrations. **[read]**
- No `.dockerignore`: `COPY . .` pulls a local `.env`, host `node_modules`, `.git` and `infra/.data` into
  the build stage; there is no HEALTHCHECK or health route, though `quality-bar.md` claims one. **[read]**
- The turbo global hash includes the plugin's own `.turbo/turbo-test.log`, so every run invalidates the
  lint cache. `@types/node` is 26 while the runtime is Node 22. `Bash(pnpm --filter*)` auto-approves
  `pnpm --filter x exec <anything>`, bypassing the `ask` rule on `git push`. **[exec/read]**
- `db:introspect` rewrites the hand-maintained `relations.ts` (210 lines changed on a scratch run); only
  CI restores it, and the `add-migration` skill does not mention this. **[exec]**

### Documentation (details in §9)

- Docs describe unbuilt behaviour as current: R2 document storage (`tech-stack.md:35`,
  `architecture.md:22`), graphile-worker enqueueing (`architecture.md`, spec §7,
  `.claude/rules/integrations.md`), the 50k threshold watcher (`mva-registration-threshold.md:11-12`),
  the grace-window passive confirmation (the AI literacy note, STATUS "in effect" — zero code), an offline
  outbox (architecture narrative; there is no service worker).
- The quality bar's Definition of Done requires an axe pass, coverage thresholds, Playwright e2e and
  OpenTelemetry/health endpoints — none exists. AGENTS.md, `quality-bar.md`, CONTRIBUTING and the PR
  template require a green audit, while CI's audit step is deliberately `|| true`.

## 6. P3 — minor (condensed)

Open redirect through `/\evil.example` in the companion `safeRedirect` (needs a same-origin POST) · a
malformed `saldo_session` cookie makes every page 500 and blocks logout (`decodeURIComponent` without
try/catch) · the OIDC callback has no error handling (cancelling BankID → 500, cookie not cleared) ·
`orgs/new` lacks `no-store` and bypasses the lookup throttle · security headers only on HTML responses ·
session renewal slides forever though the docs claim an absolute expiry · `env.ts` says `APP_URL` feeds
the CSRF check (it uses Host) · the Altinn `instanceUrl` is logged at info level · every GoCardless token
error maps to `auth-failed` and the cached token is never evicted · `isValidOrgNr('000000000')` is true ·
migration `20260629144123_supplier_invoices.sql` is timestamped before two migrations that landed earlier
· VAT rates shown as "11.11 %" on the overview · internal rule ids ("MVA-KODE") shown to users · the home
page's "Du er à jour" is unconditional · the manifest `description` is English with `lang: "nb"` · report
row headers render at weight 700 against ADR 0026 · `next-adr.mjs` prints nothing when the path contains a
space or "ø" · `status-block.mjs`/`arch-graph.mjs` use `String.replace` with generated text (`$&`
hazard) · `ci.yml` cancels in-progress runs on `main` · the freshness job exposes an issues-write token to
install scripts.

## 7. Dead code, dead docs, duplication and redundancy

**Dead or test-only code**

- `recordReverseChargePurchase` (`db/posting.server.ts:434`) — kept "for PR #58", which merged without
  using it; only an integrity test calls it.
- `relations.ts` (331 hand-maintained lines) — no runtime consumer (`db/client.ts` says the relational API
  is unused); it survives on exemptions from knip, type-coverage, eslint and prettier plus a CI restore
  step.
- Domain exports hidden from knip by `export *`: `isValidKid`, `kid`, `KidScheme`, `isBalanced`,
  `SUPPORTED_TAX_YEARS`, `EMPTY_LEDGER_TOTALS`, `nextStatuses`, `isIssued`; `vat/activity.ts` (deliberately
  deferred per ADR 0030).
- 17 dead copy keys (34 strings), including `bank.detail.matched`/`unmatched` and
  `purchases.detail.draftTitle`, plus a test-only `app.tagline`; the copy test enforces parity, not usage.
- ~125 lines of unreachable `.dark` CSS; 120 `--color-*` scale steps that nothing uses.
- `.claude/scripts/review-reminder.sh` (never registered); `.claude/settings.json` `ask` rules for
  `kamal:*` and `pnpm deploy:*` (no Kamal config exists; `pnpm deploy` is pnpm's own built-in);
  `apps/web/app/jobs/` holds only a README; `components/README.md` describes a `mobile/` folder that does
  not exist; `/verify` is referenced by the new-feature skill and ADR 0017 but does not exist.

**Dead or superseded docs**

- `docs/overview.md` — a near-verbatim copy of build-spec §1 with a single inbound reference.
- `docs/backlog/README.md` — no inbound links.
- `docs/repo-code-review-2026-07-03.md` — closed per STATUS; belongs in `docs/archive/` (its line 6 still
  points at the pre-archive path of the 06-28 report).
- `docs/roadmap.md` — declared historical, yet its "COMPLETE" Part 2 still has 30 unchecked boxes, and
  three documents disagree on its role (historical record, forward plan, master plan).

**Duplication**

- UI: `supplier-invoice-form.tsx` (372 lines) forks `invoice-form.tsx` (458); totals `<dl>` ×4; `Field`
  ×2; `Row` ×2; the status-badge base class ×2; ~20 `purchases.form.*` keys duplicate `invoices.form.*`.
- Contracts and lib: `blankOrUuid` ×4, `blankOrIsoDate` ×2; `supplier-invoice-form-data.ts` ≈
  `invoice-form-data.ts`; the parse → `withUserOrg` → record → audit → redirect action skeleton ×4;
  `lib/route-params.ts` ("the ONE uuid-shape check") used by 2 routes while others hand-roll three styles.
- DB: voucher + posting insertion ×3; reverse-charge resolution ×2; `currentOrgStatus` ×2;
  `OPEN_STATUSES` ×2.
- Integrations: four near-identical residency-gate config modules; five fetch-with-timeout helpers (all
  with the same body-timeout bug); the melding generated in three places with the same `orgNr as never`
  cast; two configuration systems (`env.ts` plus direct `process.env` reads).
- Domain: `oreToAmount` versus SAF-T's private `amount()`; the tax-code CSV fixture still re-parsed in
  three test files (both leftovers of 2026-07-03 dedups).
- Tooling: three separate "up-section" SQL extractors (`tools/migrations-up.mjs`, `tools/restore-drill.sh`,
  the test harness).
- Docs: the CI gate list restated in two places, which disagree with each other and with `ci.yml`; two
  diverging architecture diagrams (`architecture.md` and spec §7); `domain-model.md` and spec §5 each call
  the other canonical, and both list entities that do not exist (item, quote, purchase, document,
  vat_return) while omitting ones that do; three open-decision lists that disagree.

## 8. Regression check of the 2026-07-03 review

**Holding:** credit-note kind/link immutability; receipt-extraction auth + rate limit; the posting INSERT
guard (within a tenant); reconciliation `FOR UPDATE` + compare-and-set; `issueInvoice` locking before
allocation; `SubmitButton` on the surfaces that existed then; category-level VAT rounding on sales; code 6
on the melding; the introspect drift gate; turbo cache inputs; RuleTester tests; `Money`/`MoneyText`,
titles, decimal input modes and table scrolling on the older surfaces; the `DEV_AUTH` opt-in;
`Origin: null` → 403; the trusted XFF hop; the DR counter check.

**Incomplete or regressed:**

- P1-4(b) fixed code 6 only; codes 21/22 remain wrong.
- The Skatteetaten client was wired into the UI unchanged; it still targets an unverified path, now
  contradicted by the committed capture.
- P1-3 (pending state) — the new purchase/owner surfaces skipped `SubmitButton`, and no server-side
  idempotency exists anywhere.
- The `oreToAmount` and tax-code-fixture dedups were half-applied.
- ADR 0010 now carries a third status ("Proposed" in `tech-stack.md`), introduced by the fix commit.
- The CI gate list is still restated in two documents.
- "Digest-pinned CI Postgres" pinned only the service container, not the Testcontainers image.
- "Verified clean: XML parsing safe against entity expansion" no longer holds on `fast-xml-parser` 5.9.3.

**Wrong premises in that review:** it stated that `posting_balance` and `voucher_posted_complete` had been
"later DROPped" and trusted the generated count of integrity triggers; both triggers are live (the DROPs
are in `migrate:down` sections) and the generator cannot see `CREATE CONSTRAINT TRIGGER` (§9). It also
stated that `matched_voucher_id` was the only cross-row reference without a same-org FK; the core ledger
FKs are single-column as well (P0-1).

## 9. Harness, gates and documentation — the meta-problem

**Gates that check form rather than truth**

- `tools/arch-graph.mjs:133` matches only `CREATE TRIGGER`, so the generated "code-true" block in
  `architecture.md` lists 10 integrity triggers and omits the two most important ones — `posting_balance`
  (Σ debit = Σ credit) and `voucher_posted_complete`; it also counts `migrate:down` text, inflating
  policies (25 reported, 19 live) and functions (19 reported, 13 distinct). The block claims it "cannot
  drift".
- The freshness gate reads only the first `verify-by` on a page and only warns (`tools/repo-lint.mjs:80`):
  `eu-ai-act.md`'s EEA/Norway item (verify-by 2026-09-30) is never checked; scheduled re-runs have no date
  field (the AI Act conformity re-run "next: 2 Aug 2026" is 55 days overdue with no run logged);
  runbooks and `db/reference` dates are never scanned. `freshness.yml:56` greps `warn|unused`, which
  matches lint:repo's own "0 warning(s)", and runs knip without React Router typegen (46 false "unresolved
  imports"), so issue #56 can never close — twelve bot comments, no human action.
- The DR verifier derives its expected tenant set from the property it verifies (§5).
- Self-reported Definition-of-Done checklists: PR #71 claims lint was green; the AI Act conformity run
  passed check 7 ("matches the shipped feature set") on a grace window that has no code; ADR 0057 says the
  review reminder prompts in-loop and the allowlist is synced (neither is true) while its backlog task is
  `done`.

**ADRs and docs that contradict the code or each other**

- React Router 8 is installed; AGENTS.md, README, `tech-stack.md`, ADR 0005 and ~15 other files say
  React Router 7; there is no ADR for the major upgrade (or for Zod 4), and the "Context7 pinned to the
  exact version" mitigation in ADR 0005/`tech-stack.md` does not exist in `.mcp.json`.
- ADR 0010 carries three statuses (file, index, tech-stack). ADR 0022 says no standalone AI Act subagent
  was adopted, yet `ai-act-reviewer` exists and the review gate enforces it. ADR 0017 and `rejected.md`
  R-0002 call knip advisory; it has blocked CI since June.
- `docs/STATUS.md` states that it is "forward-looking only" and keeps no per-session history, yet ~70 % of
  its 327 lines are history. It lists landed work as open — including a description of
  `feat-org-active-context` as the org-less route design that ADR 0060 explicitly rejected — and never
  mentions the open PR #71. The SessionStart hook prints only its first 45 lines (the history), so "Next
  up" and "Known issues" never reach a new session.
- The local quick start dead-ends at an empty login page: `DEV_AUTH=true` has been required since ADR 0055,
  but README, runbook and CONTRIBUTING never mention it, and `.env.example` (last changed 2026-06-23)
  cannot be read or updated by agents because `.claude/settings.json` denies `Read(./.env.*)`.
- Open decisions are listed in three places that disagree (Postmark and Criipto "decided" in STATUS,
  still open in spec §18 and the roadmap; no ADR records the Criipto choice).

**The backlog does not encode the priorities**

- All 30 todo tasks are valued medium or low, and none depends on another todo; `pnpm backlog next`
  therefore resolves by effort, then alphabetically, to `aia-gpai-docs` — which is gated on an LLM-hosting
  decision that is not a node in the graph. `feat-year-end-close`, the declared critical path, ranks 18th
  of 30.
- Missing nodes: the LLM-hosting decision, the jobs runner (both recurring tasks need one yet show as
  ready), document storage, voucher date/number, bimonthly MVA terms, go-live operations (Cloudflare DPA,
  Criipto tenant, Postmark account/DNS, product name), the recurring AI Act re-run.
- Stale or superseded todos: `harness-design-lint` claims no RuleTester tests exist (23 do);
  `aia-review-fold` is superseded by `ai-act-reviewer`; `sec-csp-nonce` says RR7; a dangling reference to
  `feat-audit-trail-export`; 27 of 54 done tasks have no `touches`, so the stale-done check cannot see
  them.

## 10. State and direction — evaluation

### Where the project stands

- **Engineering craft: high.** Typed money, a pure domain, property-based and stateful model tests,
  SQL-first integrity, FORCE RLS, fail-closed integrations, an AI surface designed around the EU AI Act,
  reviewer subagents. For a two-week build this is unusually rigorous, and most of it survives scrutiny.
- **Product correctness: not yet a system of record.** The bookkeeping model is incomplete (no voucher
  date or number, no bilag, no period locks, annual term only), the SQL guarantees have holes, and ordinary
  flows — foreign currency, mark-as-paid, re-crediting, double submits, January entries — corrupt or break
  the books.
- **Operational reality: none yet.** Nothing runs beyond localhost; every external integration is
  unexercised; two filing integrations contradict their own captures; OIDC login has never been verified
  live.
- **Maintenance: stalled.** Twelve idle weeks produced red security runs, unmerged security fixes, a stalled
  critical-path PR and expiring sources — each cheap to fix, none triaged. The automation keeps running
  (Freshness, Security, Dependabot), but its signals go unread because they are permanently red or noisy.

### How it got here

1. **Breadth-first phase execution.** The build spec's §16 phases 0 → 9 were all "landed" in 14 days, each
   with a PR and an ADR. Altinn _submission_ (Phase 9) reached `main` before the year-end close (Phase 7)
   merged and before a voucher date or a document store existed. Fundamentals were deferred inside ADRs
   instead of being tracked as blocking work.
2. **Process artefacts as a proxy for progress.** 63 ADRs in 14 days — most of them feature changelogs
   rather than decisions — a 327-line STATUS, three review reports and a harness that documents itself.
   The documentation (~12k lines) now drifts faster than it is maintained, and the canonical-source rule
   breaks in exactly the places it was meant to protect.
3. **Gates that verify form, not substance.** Several mechanical checks look authoritative but test the
   wrong thing (§9). Together with self-reported Definition-of-Done checklists, this produced confidence
   where the facts were wrong — the previous review trusted the generated trigger count.
4. **Fixes by instance, not by construction.** Each review found the same classes again (restated lists
   drifting, raw submit buttons, hand-formatted money, half-applied dedups) because new code was written by
   copying older code, and fixes were local patches rather than shared components, lint rules or SQL
   constraints.

### Recommended direction

- **Stop adding surface area** — companion variants, Torpedo, trade analogies, Vipps, PEPPOL send, the
  mobile companion — until the core is correct and deployed.
- **Correctness first, in SQL and in posting** (P0-1, P0-3, §4.1), each fix with a bad-case integrity
  test — the approach that already works well here.
- **Complete the ledger model before more filing work:** capture bokføringsloven and -forskriften and
  derive the requirements from them; then `voucher_date` + voucher number, bilag storage (the R2 WORM
  design ADR 0038 already describes), bimonthly terms with an org cadence setting, and period locks on
  filing and close.
- **Ship one vertical slice to an EU staging environment:** BankID/Criipto login → a verified org → an
  invoice → PDF and email → bank import → reconciliation → an MVA-melding validated in tt02 → SAF-T.
  Treat "works in staging" as the definition of done for integrations.
- **Right-size the process:** STATUS as ~80 lines of current state; ADRs only for decisions (feature notes
  belong in the PR); make the gates in §9 semantic and give the tools tests; let the backlog carry the
  real critical path with `high` values and decision/ops nodes; archive closed reports.
- **Owner decisions:** repository visibility versus the licence; the SAF-T account-list licence; LLM
  hosting; the org-verification design; the product name.

## 11. Suggested sequence

1. **Week 1 — stop the bleeding (mostly small changes):** gitleaks allowlist · Dependabot regrouping +
   security bumps · PR #71 lint fix and merge · 2027 tax parameters + a fail-soft honest number · a
   redacting `handleError` · the NOK-only guard · remove or fix "mark as paid" · `SubmitButton` + server
   idempotency on every posting action · opening balances at most once · date-contract hardening ·
   re-capture the Altinn/Skatteetaten sources and fix the validation path and `instansstatus` (submission
   stays disabled) · pin the MCP servers and scope the Neon MCP · a STATUS rewrite.
2. **Weeks 2–3 — SQL and ledger correctness:** the P0-1 holes with tests · supplier-post locking · a
   credit-note cap · an Oslo-time clock · SAF-T/date consistency · reverse-charge melding coding per the
   official example · codes 21/22 and a purchase-line gate · DR verifier and `audit_log` hardening · an
   export coverage test.
3. **Weeks 3–5 — the ledger model:** bokføringsloven/-forskriften capture → voucher date + number → bilag
   storage → bimonthly terms + cadence → period locks on filing and close.
4. **Then — staging:** Neon EU + a PaaS + a Criipto test tenant + tt02; prove the vertical slice; only then
   resume integrations and new features.

## 12. Verified clean (do not re-flag)

- **Tenancy at the app layer:** every org route calls `withUserOrg`/`requireOrgAccess` before touching
  data; a non-member gets 403 for existing and non-existent org ids alike (no existence oracle); all 19
  tenant tables have RLS enabled + forced with a single policy whose USING and WITH CHECK both carry the
  org predicate and fail closed when the GUC is unset.
- **Grants:** no TRUNCATE/REFERENCES/TRIGGER, no default ACLs, no CREATE on `public`; `ai_provenance`,
  `invoice_email`, `audit_log` and `mva_filing` are genuinely append-only for the app;
  `allocate_invoice_number` is SECURITY DEFINER with a pinned `search_path` and EXECUTE revoked from PUBLIC.
- **Header immutability** of `voucher`, `invoice`, `supplier_invoice` and `bank_transaction` compares OLD
  with NEW directly and holds.
- **CSRF:** all 22 actions call `assertSameOrigin` first. **Downloads:** all five set `private, no-store`
  and Content-Disposition. **Active-org cookie:** HttpOnly, SameSite=Lax, set only after the membership
  check, never read for authorization.
- **Money core:** unsafe integers fail loudly; half-away-from-zero rounding and −0 normalisation are
  correct; `mulRate` is exact at 25/15/12 %; every derive function balances for all inputs, including zero
  and negative; reverse-charge dual legs balance; `deriveSalesInvoice` matches the totals, the frozen
  breakdown and EHF under ADR 0054.
- **ID validators** (org-nr mod 11, KID mod 10, BBAN mod 11, IBAN mod 97) and the MVA/innsending XML
  against the committed XSDs.
- **AI surface:** propose-only holds end to end; provenance is written in the same transaction as the
  human-confirmed post; every proposed value is wrapped in `AiAssisted`; the prompt forbids assessing
  people; the residency classifier works by IP value.
- **Integrations** make no external call when unconfigured; secrets are neither hardcoded nor logged;
  Enhetsregisteret calls match the capture and are cached and throttled.
- **Aggregations** exclude drafts; year selection by fiscal-period year is consistent; `schema.ts` shows no
  drift from the migrations; all 19 `migrate:down` sections apply cleanly in reverse.
- **CI hygiene:** every action is pinned to a full SHA with least-privilege permissions; Node 22 is
  consistent across `.nvmrc`, engines, CI, the Dockerfile and the devcontainer; the runtime image is
  multi-stage, production-only and non-root.
- **Copy catalogue:** 693/693 nb/en keys with placeholder parity; no key used but undefined; every table
  has a caption and scoped headers; light-theme contrast passes AA for every text pair in use.

## Appendix — method and reproduction

- **Gates:** `pnpm typecheck`, `lint`, `format:check`, `lint:repo`, `test`, `knip`, `knip --production`,
  `test:tools`, `status:check`, `arch:check`, `backlog validate`, `db:lint`, `type-coverage`,
  `saft:validate`, `mva:validate`, `ehf:validate`, `audit` — run on 2026-09-26.
- **Real database:** the local PostgreSQL 16 cluster with a `saldo` superuser;
  `SALDO_TEST_PG_URI='postgres://saldo:saldo@127.0.0.1:5432/postgres?sslmode=disable'` runs the full web
  suite (481/481).
- **SQL probes:** a scratch database built from `node tools/migrations-up.mjs`; statements executed under
  `SET LOCAL ROLE saldo_app` with `set_config('app.current_org', …, true)`, exactly as the app connects.
- **Domain probes:** `tsx` scripts against `packages/domain/src` (e.g. `honestNumberFromLedger(…, 2027, …)`).
- **Route probes:** the real loaders/actions invoked through the existing route-test harness.
- **GitHub state:** workflow runs, PR check runs and job logs, issue #56, repository metadata — read through
  the API on 2026-09-26.
- **Secret scan:** gitleaks 8.28.0 over the 50 commits present in the (shallow) clone; commits before
  PR #17 were not scanned locally.
