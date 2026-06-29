# Saldo — Full Repository Code Review

## 1. Executive summary

**Overall grade: A−.** Saldo is, by a clear margin, above the bar of most production SaaS codebases and competitive with best-in-class financial systems (Stripe, Modern Treasury, Lago, Medici) on the dimensions that matter for a system of record. The hard invariants are not merely documented — they are mechanically enforced at the correct layer: money is branded integer `Øre` with all arithmetic funneled through guarded helpers; the ledger is append-only via SQL triggers (not ORM logic); invoice numbering is gapless from a per-org counter row (verified by a Testcontainers test that also asserts *no SEQUENCE exists*); tenancy is FORCE-RLS + a non-owner role + composite same-org FKs as defense-in-depth; and the propose-only AI boundary with Art. 50 provenance is structural (a `literal(true)` disclosure that cannot type-check if omitted). Test discipline is a genuine outlier: exhaustive VAT-code × MVA-status sweeps against an independent oracle, fast-check property tests for algebraic money laws, and a stateful model-based ledger test driving random post/reverse/lock/allocate interleavings against real Postgres.

The findings were adversarially verified by an independent skeptic: **7 of 184 raw findings (3.8%) were refuted and dropped**, which is a strong precision signal — what remains is real. No CRITICAL invariant breach survived verification. The headline gaps are concentrated in three places: (1) the OIDC callback links/creates accounts on an unverified `email` claim (a genuine account-takeover vector); (2) the production Docker image runs as root and ships the full dev tree; and (3) a hand-rolled SAF-T XML escaper that can emit non-well-formed XML. The remaining medium findings are correctness-adjacent (error-channel hygiene, a couple of regulatory edge cases, test-coverage holes), not data-corruption risks. What keeps this from an A is a short, fully actionable list — close those and this is an A repo.

## 2. Gate results

All gates were run in-environment (Node 22.22.2, pnpm 9.12.0).

| Gate | Status | Detail |
|---|---|---|
| `pnpm typecheck` | ✅ pass | 2 packages, exit 0 (only vite-tsconfig-paths deprecation notices) |
| `pnpm lint` | ✅ pass | eslint clean across `@saldo/domain` + `@saldo/web`, no warnings |
| `pnpm test` | ✅ pass | 594 tests pass (466 domain + 128 web); 121 tests in 23 integrity files **auto-skip** (Docker/Testcontainers unavailable — graceful skip by design, not a failure) |
| `pnpm lint:repo` | ✅ pass | 86 docs, 10 sourced pages, 0 warnings; no-contradiction/ADR gate clean |
| `pnpm audit --prod` | ✅ pass | No known vulnerabilities |

**Notable failures:** none. Caveat: the 121 Docker-dependent integrity tests did not execute here; they are the load-bearing ledger/RLS/restore proofs and must run in a Docker-enabled CI (they do, per `ci.yml`).

## 3. Scorecard by area

| Area | Grade | One-line verdict |
|---|---|---|
| Domain: money, ids, time | B | Best-in-class money discipline; thin id-module tests (KID mod11 has no positive vector). |
| Domain: VAT engine + rules | B | Source-grounded, exhaustively oracle-tested; activity gate exists but isn't wired in. |
| Domain: posting / double-entry | A | Single-source VAT fork, append-only reversal, strong property tests. |
| Domain: invoice, catalog, honest-number, tax | A | Verbatim source-grounded tax params; minor lifecycle-modeling gaps. |
| Domain: SAF-T model | B | Schema-faithful, integer-safe money; XML escaper misses control chars. |
| Domain: MVA-melding + reporting | A | Pure, property-proven tie-outs; one no-treatment-code basis-line edge. |
| Domain: banking, recon, PEPPOL, extraction | B | Exemplary purity; KID mod-10-only matching + a few UBL conformance gaps. |
| Web DB: schema, client, ledger core | B | Textbook RLS + gapless counter; generated `relations.ts` joins on wrong FK. |
| Web DB: feature query modules | A | Atomic issue+number, frozen amounts, idempotent import; overloaded error codes. |
| Web: auth / identity / sessions | B | Solid Lucia/oslo model; unverified-email account linking is the weak point. |
| Web: Zod contracts | B | Strong parse-don't-validate; a few cross-field + external-input gaps. |
| Web: external integrations | B | Outstanding I/O hygiene; token-cache stampede + SSRF gate is hostname-only. |
| Web: lib, observability, copy, components | A | Accessible money/AI primitives; shallow log redaction, one radio-a11y gap. |
| Web: documents (PDF/EHF/email) + scripts | B | Real XSD gate, frozen figures; unvalidated customer email; no PDF/send tests. |
| Routes: auth, orgs, home, oppslag | A | Layered authz+RLS, no open redirect; un-rate-limited public lookup proxy. |
| Routes: contacts, products, receipts, vouchers | A | Model propose-only AI surface; provenance round-trips via client fields; no route tests. |
| Routes: sales invoicing | A | Gapless+atomic posting done right; one misleading error code. |
| Routes: bank, reports, MVA, SAF-T | B | Clean read-only exports + CSRF; no route-level header/404 contract tests. |
| SQL migrations + integrity | A | Sophisticated integrity layer; DR verifier list is stale (skips 7 tables). |
| Harness: tools, hooks, eslint plugin | A | Mature fail-closed hooks, real restore drill; money rule misses unary negation. |
| Config, CI/CD, infra | A | Strict TS, SHA-pinned actions, real CI; Docker runs as root + floating base tags. |
| Docs: guidance + drift | A | Enforced single-source-of-truth; minor prose-count drift. |
| Docs: ADRs + regulatory | A | Every number traces to a dated capture; one SAF-T code-6 contradiction. |
| Test suite quality + coverage | A | Stateful ledger property tests + RLS coverage gate; LLM residency gate undertested. |

## 4. Critical & High findings

No CRITICAL findings survived verification. The following are HIGH (corrected severity), ordered by risk.

### H1. OIDC callback links/creates accounts on an **unverified** email claim
**`apps/web/app/routes/auth.callback.tsx:19-20`** (with `apps/web/app/auth/oidc.server.ts:67-70`) — severity **high** — verdict **confirmed**.
`completeOidcLogin` returns `{ email }` straight from the ID token's `email` claim and the callback does pure find-or-create: `const user = (await findUserByEmail(db, email)) ?? (await createOidcUser(db, email))`. `email_verified` is never read (grep confirms it appears nowhere in the repo), and the stable `sub` claim *is* returned by `completeOidcLogin` but **dropped** at the callback. For a multi-IdP broker (Criipto/Signicat fronting BankID/Vipps + potential social providers), a token asserting an unverified email equal to a victim's account logs the attacker in as that account — the classic "login with unverified email" account-takeover.
**Why it matters:** direct authentication-bypass / account-takeover on the production login path.
**Fix:** require `email_verified === true` before find-or-create; better, key the account on `(iss, sub)` (persist `sub` on `app_user`, already available) and treat email as a contact attribute only.
**Benchmark:** Auth0/Okta and the OIDC security BCP (RFC 9700) require `email_verified` before linking and recommend matching on `iss+sub`; Auth.js gates automatic linking on a verified email.

### H2. SAF-T XML escaper does not handle XML-illegal control characters → non-well-formed export
**`packages/domain/src/saft/financial-xml.ts:39-45`** — severity **high** — verdict **confirmed**.
`esc()` escapes only `& < > "` and passes everything else through. XML 1.0 forbids the C0 controls (U+0000–U+0008, U+000B, U+000C, U+000E–U+001F) entirely — they cannot even be expressed as numeric references. Free-text fields (party/account names, line descriptions) originate from user input; a pasted NUL or vertical tab yields a document `xmllint`/any conformant parser rejects. The property test (`financial-xml.test.ts:176-195`) generates `fc.string()` (which includes control chars) but only asserts "no bare ampersand" + "ends with `</AuditFile>`" — it never asserts well-formedness, so this slips through.
**Why it matters:** a statutory SAF-T export can be silently invalid; rejection happens downstream at the authority, not in CI.
**Fix:** strip/reject the XML-1.0-illegal char class in `esc()` (`/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g`), and tighten the property test to parse the output and assert well-formedness rather than only checking for `&`.
**Benchmark:** fast-xml-parser's builder and libxml2 serializers strip/escape the illegal-char set by default; UBL/PEPPOL toolchains reject illegal control chars at serialization. (Same hand-rolled-escaper pattern recurs in `mva-melding/xml.ts` and `peppol/ubl.ts` — audit those `esc()` helpers identically.)

### H3. Production Docker image runs as root and ships the full build tree
**`infra/docker/Dockerfile:20-24`** — severity **medium** (corrected down from high) — verdict **confirmed**.
The runtime stage does `COPY --from=build /app /app` (entire tree: all dev dependencies, source, tests, tooling) and never adds `USER node`, so the production container runs as UID 0. Two hardening failures: (1) root in-container enlarges blast radius for any escape primitive; (2) every dev dependency becomes a production attack surface.
**Why it matters:** this is the production runtime image for an EU-region accounting service holding personal + financial data.
**Fix:** add `USER node` (with `chown`) before `CMD`; prune to prod deps via `pnpm deploy --filter @saldo/web --prod /app/out` and copy only the pruned output + `build/`.
**Benchmark:** GitHub's, Snyk's, and Google distroless Node guidance all run non-root and copy only pruned prod `node_modules` + build output.

---

The following four were originally filed "high" but verification corrected them to **medium**; they are listed here because they were high-severity candidates and warrant priority attention.

### H4 (→medium). KID matching only accepts mod-10; legitimate mod-11 KIDs miss the auto-match tier
**`packages/domain/src/reconciliation/match.ts:133`** — verdict **confirmed**.
`isValidKid(inv.kid)` defaults to mod-10 (`kid.ts:44`); Norwegian KIDs are issuer-configured mod-10 **or** mod-11 (`kid.ts:2-4`, and `isValidKidMod11` exists). A mod-11 KID fails the check, so a correct in-message KID payment degrades from unique-kid-exact auto-apply to the weaker amount/date tier → manual work. Saldo mints its own KIDs as mod-10 today, so the live risk is inbound/migrated/legacy invoices.
**Fix:** carry the KID scheme on `OpenInvoice`, or accept a hit under either scheme; add a mod-11 test vector.

### H5 (→medium). Generated `relations.ts` wires relations to `organization_id` instead of the real FK
**`apps/web/app/db/relations.ts:9-12, 40-43, 133-136, 170-177, 219-234, 250-257`** — verdict **partial** (latent).
Many `one()/many()` relations join on `organizationId` rather than the intended FK (e.g. `invoice.contact` uses `invoice.organizationId → contact.id` instead of `customerId`; `voucher.invoice` uses `voucher.organizationId → invoice.id`). These are drizzle-kit introspection artifacts — **latent** because no code uses the relational query API today (grep for `db.query.*` finds nothing). Any future `db.query.*.findMany({ with })` would return garbage.
**Fix:** regenerate with a drizzle-kit version that resolves composite/named FKs, or hand-author and exempt the file from the no-hand-edit hook; add a smoke test per relation before adopting the relational API.

### H6 (→medium). LLM SSRF/residency gate validates hostname only, never the resolved IP
**`apps/web/app/integrations/llm/config.server.ts:28-51`** — verdict **partial**.
`isOnPremHost` classifies on the hostname string only — missing `0.0.0.0`, IPv4-mapped IPv6, encoded IPv4, and DNS names resolving to private/metadata IPs. Verification reduced severity because `LLM_BASE_URL` is operator-controlled env (not end-user input), so the realistic threat is misconfiguration/insider, not request forgery. Still, the gate is the only control between receipt-image PII and a third party.
**Fix:** parse with `node:net`, reject encoded/mapped forms and `0.0.0.0`/link-local; for the strongest posture resolve DNS at request time and validate the resolved address. Add adversarial unit cases.

### H7 (→medium). Activity gate (kap. 3 sectoral exemption) is never wired into the rules engine
**`packages/domain/src/rules/vat-line.ts:44-81`** — verdict **partial**.
`checkVatActivityLine` (the only enforcement of helse/undervisning/kunst-kultur "may never carry output VAT") is referenced solely by its own test; `vatLineRule` calls only `checkVatLine`. Its docstring claims "valid only if BOTH gates pass," which is false at runtime. Verification noted this is likely an intended later increment (ADR 0030) — but as committed the gate provides no protection and the "BOTH gates" claim is untrue.
**Fix:** thread a per-line `activity` into `VatLineRuleContext` and call `checkVatActivityLine` in the loop; or, if deferred, add a STATUS/ADR note and a test asserting the boundary is deliberately open (mirroring how the code-51/reverse-charge deferrals are locked in tests).

## 5. Medium findings (by area)

**Auth**
- `auth.login.tsx:51-56` — no session rotation/invalidation on login; `invalidateUserSessions` exists but is never called — wire it into login + password-change/"sign out everywhere."
- `dev-auth.server.ts:16-18` — user-enumeration timing oracle (early return skips argon2) — do a constant-work dummy verify on the absent-user branch.
- `auth.login.tsx:45-49` — no rate-limiting/brute-force throttle on password login — add per-IP/per-account limiter.
- `apps/web/app/auth/` — thin tests (verification found the integrity suite covers session lifecycle/RLS, so this is partly refuted) — add unit tests for `readSessionToken`, `assertSameOrigin`, OIDC tx round-trip.

**DB / queries**
- `invoices.server.ts:399` — `updateDraft` returns `'unknown-vat-code'` for the not-a-draft/not-found case — add a `'not-a-draft'` variant.
- `invoices.server.ts:280` — `prepareInvoice` reports unparseable price/qty as `'unknown-vat-code'` — add `'invalid-amount'` or throw an invariant error (Zod already validated).
- `invoices.server.ts:538-549` — credit note can post an *unlinked* reversing voucher when `creditsInvoiceId` is missing (cross-tenant case refuted by an SQL FK) — require a resolved issued source voucher at issue, else fail typed.
- `ledger.server.ts:24-26,36-46` — `SUM(bigint)` narrowed via `Number()` can lose precision >2^53 øre (astronomically unlikely for an ENK) — parse with `BigInt()` + range-check.

**SAF-T / reporting**
- `financial.ts:234-241` — Transaction `period` from line date but `periodYear` from export year — derive both from `t.date` with a guard/assert.
- `mva-melding/melding.ts:91-93` — `reportsGrunnlag` emits a basis line for no-VAT-treatment codes 0/7/20 — restrict basis emission to melding-reportable codes via a committed allow-list.

**Integrations / documents**
- `gocardless.server.ts:67-95` — token cache has an in-flight stampede window (no single-flight promise) — coalesce concurrent refreshes (verification corrected to low, but it can exhaust the token rate-limit scope).
- `peppol/ubl.ts:262-269` — EHF omits `cac:PayeeFinancialAccount` required for `PaymentMeansCode 30` — add seller bank account to the model.
- `peppol/validate.ts:79-84` — validator never checks VAT = base × rate (BR-CO-17), only non-zero — add the rounded-product check.
- `contracts/invoice.ts:70` — `customerEmail` is `z.string().max(320)` with no email format check, yet becomes the SMTP `to` — reuse the strict `email` schema from `contracts/index.ts:25`.

**Routes / a11y / testing**
- `oppslag.tsx:35-52` — unauthenticated, un-rate-limited outbound proxy to brreg — add IP/session rate limiting + short-TTL cache before public exposure.
- `contact-form.tsx:73-97` (and `product-form.tsx:76-98`) — radio-group error not associated via `aria-invalid`/group-level error — add `aria-invalid` and a shared `RadioGroupField`.
- `receipts.new.tsx:390-393,140-146` — AI provenance (model/version/confidence) persisted from tamperable client hidden fields (corrected to low) — stash extraction server-side / sign it, dereference at confirm.
- Route-level test gaps (multiple, **medium**): `saft[.xml]/mva[.xml]` response-contract (headers, 404), the eight contacts/products/receipts/vouchers routes, and the auth/tenancy boundaries — add loader/action + Testcontainers tests.

**Infra / docs / harness**
- `infra/docker/Dockerfile:3`, `compose.yaml:8,25`, `ci.yml:20` — base images floating tags (`minio/minio` untagged = `:latest`) — digest-pin + add Dependabot `docker` ecosystem.
- `ci.yml:45` — `pnpm audit --audit-level=high` is a hard blocking gate duplicated by the weekly non-blocking sweep — make CI copy non-blocking, gate on triaged findings.
- `deploy-migrate.yml:33-39` — production migration has no `lock_timeout`/dry-run (corrected to low; greenfield today) — set a session `lock_timeout`, re-enable squawk timeout rules on first data-bearing ALTER.
- `db/dr/verify-restore.sql:28-31, 34-37` — DR verifier's tenant-table + trigger lists are stale (skips 7 of 15 tables; omits `invoice_immutable`/`invoice_line_immutable`/`bank_transaction_append_only`) — derive the set from `pg_catalog` so it can't drift.
- `db/migrations/20260623030558_ledger_integrity_gaps.sql:37-53` — period-lock trigger uses `COALESCE(NEW,OLD)` single-value; an unposted voucher can be moved *out* of a locked period — check both OLD and NEW period on UPDATE.
- `vat/line-treatment.ts:61` — treatment classified by substring of free-text NOB description (CSV even typos `omvendt avgiftplikt`) — centralize the keyword→classification table and compute `isOutsideScope` once at parse.
- `LLM residency gate untested` — `config.server.ts:28-36` — add a table-test across every `isOnPremHost` branch with adversarial near-miss hosts (cross-listed with H6).

## 6. Low / nits

Roughly 90 low/nit findings, none invariant- or security-critical, by area:

- **Domain (money/ids/posting/saft/recon):** ~20 — checked-overflow vs throw, duplicated rounding formula, string-literal brands, CSV amount-locale heuristic, `Math.abs` on branded Øre, dedup-key delimiter collisions, splitName heuristic, helper co-location.
- **DB / routes:** ~18 — RLS-only point reads (defense-in-depth note), redundant `organizationId` params, `ensureFiscalPeriod` find-then-insert race, non-null assertions on single-org rows, partial-payment reconcile ceiling, duplicated `kr`/`resolveYear` helpers, non-injected `as-of` date.
- **Auth / contracts / integrations:** ~16 — unsigned OIDC tx cookie, email-only OIDC scope, sliding-renewal no token rotation, org-nr regex duplicated 4×, loose external currency/amount schemas, `.passthrough()`, password no max-length, 429 collapsed to generic error, malformed-`LLM_BASE_URL` silent disable.
- **UI / a11y:** ~9 — inline `kr` not SR-hidden in some forms, fieldset legend uses intro copy, focus-after-remove target, em-dash placeholder, subtotal label duplication.
- **Docs / infra / harness:** ~12 — stale "scaffold" label (`runbook.md:27`), "6 triggers" prose now 7 (`STATUS.md:28`), `eu-ai-act.md` hardcoded "today", missing `ehf:validate` root script, no per-job CI `timeout-minutes`, MinIO dev creds, `@saldo/domain` source-only entrypoint, `--passWithNoTests`, unary-negation gap in the money eslint rule.

## 7. Cross-cutting themes

1. **Error-channel hygiene is the most common smell.** Several DB functions overload `'unknown-vat-code'` as a catch-all sentinel for unrelated failures (`invoices.server.ts:399, 280`), and integration clients collapse 429 into a generic `'error'` while a sibling client surfaces it distinctly. The codebase models *success* paths with rigorous discriminated unions but is looser on *failure* taxonomy. Adopt stable, distinct machine-readable error codes everywhere (the Stripe/Zod-issue pattern).

2. **Hand-rolled XML escapers recur** across `saft/financial-xml.ts`, `mva-melding/xml.ts`, and `peppol/ubl.ts` — each only escapes the five predefined entities. The control-char gap (H2) likely applies to all three. Centralize one spec-correct `esc()` and one well-formedness property test.

3. **"Drift guards exist but a few facts escaped them."** The AUTOGEN/lint discipline is genuinely best-in-class, yet hand-typed prose slipped past it (`STATUS.md` "6 triggers", `runbook.md` "scaffold", DR verifier's stale table list). The fix pattern is consistent: derive the fact from the schema/CI rather than typing it.

4. **Test coverage is deep in the domain/integrity core but thin at the route and integration-boundary edges.** No route-level tests for any RR7 loader/action; no tests for the PDF renderer, the send-invoice flow, or the LLM residency gate. These are exactly the consequential-act and security-gate surfaces the quality bar targets.

5. **Client-trust edges on the newest surfaces (AI + uploads).** Provenance round-trips through tamperable hidden fields; receipt upload trusts client MIME. The AI boundary is otherwise exemplary — these are the rough edges of a new feature, not a systemic flaw.

6. **Tenancy is consistently correct** — every reviewed module goes through `withUserOrg` (authz → FORCE-RLS), with composite same-org FKs as a second lock. The few "RLS-only point read" notes are defense-in-depth observations, not holes. This is a genuine strength, not a theme of concern.

## 8. What this repo does better than most

- **Money is genuinely float-free** end-to-end: branded `Øre`, every op re-validates the safe-integer invariant via `øre()`, `parseKroner` assembles øre by string concatenation (never float multiply), and round-half-away-from-zero normalizes `-0`. Stricter than Stripe/Lago, which typically validate only at construction.
- **The ledger integrity layer lives in SQL, not the ORM** — deferred balance + posted-completeness constraint triggers, append-only triggers, period locks on both voucher and posting, EXCLUDE no-overlap periods, and a gapless per-org counter (not a SEQUENCE). Composite `(id, organization_id)` FKs make cross-tenant references impossible at the storage layer.
- **The stateful, model-based ledger property test** drives random post/reverse/lock/allocate interleavings against real Postgres and re-asserts balance + append-only + gaplessness after every command — and asserts no invoice SEQUENCE exists. This is the Medici/Modern-Treasury bar.
- **Regulatory facts are source-grounded to the paragraph.** Every tax/VAT constant traces verbatim to a committed, dated Lovdata/Skatteetaten capture; `taxParamsFor` fails closed for un-captured years. VAT treatment is derived from the committed SAF-T CSVs, never memorized.
- **The propose-only AI boundary is structural**: `aiAssisted: z.literal(true)` means a non-disclosed proposal cannot type-check; provenance is persisted in the same tenant tx as the human-confirmed post; an explicit no-creditworthiness-scoring boundary keeps Saldo out of Annex III high-risk.
- **Accessible financial UI primitives** (`Money` with `aria-hidden` glyph + sr-only "kroner", tabular-nums, centralized form label/aria wiring) and a compile-time-typed microcopy system exceed typical dashboards.
- **Supply-chain + CI maturity:** SHA-pinned actions with Dependabot, the strictest practical TS config, the money invariant and domain↛web boundary enforced in ESLint, a real backup→restore→integrity-bites DR drill, and fail-closed hooks.

## 9. Prioritized recommendations

**P0 — fix before production / before enabling the affected feature**
- **H1** Require `email_verified` and key accounts on `(iss, sub)` in the OIDC callback (`auth.callback.tsx:19-20`, `oidc.server.ts:67-70`). Account-takeover.
- **H2** Strip XML-1.0-illegal control chars in all three `esc()` helpers (`saft/financial-xml.ts:39-45`, `mva-melding/xml.ts`, `peppol/ubl.ts`) and assert well-formedness in the property tests.
- **H3** Add `USER node` and prune to prod deps in the runtime Docker stage (`infra/docker/Dockerfile:20-24`).
- Add rate limiting + cache to the unauthenticated `/oppslag` proxy (`oppslag.tsx:35-52`) before public exposure.

**P1 — correctness, security hardening, regulatory completeness**
- **H6** Harden the LLM residency gate to validate resolved IPs + add adversarial tests (`llm/config.server.ts:28-51`).
- **H7** Wire the activity gate into `vatLineRule` or document+test the deliberate deferral (`rules/vat-line.ts:44-81`).
- **H4** Support mod-11 KID matching (`reconciliation/match.ts:133`).
- Auth hardening: session rotation/invalidation on login, constant-work dummy verify for enumeration, password rate-limiting (`auth.login.tsx`, `dev-auth.server.ts`).
- Validate `customerEmail` with the strict schema (`contracts/invoice.ts:70`); require a resolved source for credit-note reversals (`invoices.server.ts:538-549`).
- EHF/PEPPOL conformance: add `PayeeFinancialAccount` and the BR-CO-17 VAT=base×rate check (`peppol/ubl.ts:262-269`, `peppol/validate.ts:79-84`).
- Fix the period-lock move-out gap (`ledger_integrity_gaps.sql:37-53`); fix the SAF-T `periodYear` source (`financial.ts:234-241`); restrict melding basis-line emission (`mva-melding/melding.ts:91-93`).
- Make the DR verifier derive its table/trigger set from `pg_catalog` (`db/dr/verify-restore.sql:28-37`).
- Add route-level tests: XML export contracts, the eight CRUD/AI routes, auth/tenancy 403/404/redirect, send-invoice + PDF, and the LLM residency gate.

**P2 — hygiene, maintainability, drift elimination**
- Replace overloaded error sentinels with distinct codes; surface 429 distinctly across integration clients.
- Regenerate or hand-author `relations.ts` correctly + add a smoke test before adopting the relational query API.
- Digest-pin base images + add Dependabot `docker`; make `pnpm audit` non-blocking in CI; add `lock_timeout` to deploy-migrate; add per-job `timeout-minutes`.
- Centralize the VAT keyword→classification table; single-source the org-nr Zod schema, the rounding formula, and the `kr`/`resolveYear` helpers.
- Add the missing KID/mod-11 positive test vector; pin a fast-check global seed; harden the SAF-T property test as in H2.
- Sweep doc drift: `runbook.md:27` scaffold label, `STATUS.md:28` trigger count, `eu-ai-act.md` hardcoded date, missing root `ehf:validate`; resolve the SAF-T code-6 contradiction between `mva-melding.md` and `mva-rates.md`/the CSV.