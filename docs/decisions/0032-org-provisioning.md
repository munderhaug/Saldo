# ADR 0032 — Per-org provisioning: seed the SAF-T kontoplan + VAT codes in the org-creation transaction

- **Status:** Accepted
- **Date:** 2026-06-23

## Context
`account` and `vat_code` are **tenant tables** — per-org rows under FORCE-RLS (ADR 0012). The SAF-T
standard kontoplan and the standard tax codes are committed reference data (`db/reference/saf-t/`,
parsed by the pure `@saldo/domain` SAF-T module), but a static migration **cannot** seed them: there
is no organization to attach the rows to until a user creates one, and RLS scopes every row to its org.
So an org's chart and codes have to be written **when the org is created**, per logged-in user — the
`feat-org-onboarding` keystone, the gateway that makes `withOrgTx` real for a real user.

Two questions had to be settled: (1) **which** accounts/codes to provision, and (2) **how** to do it
atomically and within the RLS model, including how a user lists the orgs they belong to when
`organization` is itself RLS-scoped to a single active org.

## Decision
**Provision the full committed SAF-T lists, mechanically, inside one tenant transaction.**

- **Data — the whole committed lists, no curation.** Provision every row of the SAF-T standard
  4-character kontoplan (745 accounts) and every standard tax code (30). Account numbers/names come
  straight from the committed CSV; the VAT rate is resolved from the cited rate table
  (`rateForCategory`) and the direction from the committed description — never hand-picked from memory.
  The account `type` is the Norwegian **kontoklasse** (leading digit), derived by a pure, tested
  `classifyAccountType` in `@saldo/domain`. Choosing a *subset* would be editorial accounting judgment
  (memory-grounding risk); loading the committed list is deterministic and source-grounded. The CSVs
  are inlined at build time via Vite `?raw`, so there is no runtime filesystem dependency.
- **Mechanism — one atomic `withOrgTx` bootstrap.** The app generates the org id, opens
  `withOrgTx(orgId)` (sets `app.current_org`), then inserts the `organization` row (its
  `WITH CHECK (id = current_org)` holds), all provisioned `account`/`vat_code` rows (same GUC), and the
  creator's `membership` (`owner`) — the membership table is pre-org/non-RLS but lives in the same
  transaction so a created org always has its owner. A duplicate org number is a typed, expected
  outcome (`{ ok: false, reason: 'duplicate-org-nr' }`), not a 500; the whole transaction rolls back, so
  no partial chart is ever left behind.
- **MVA status is human-confirmed, not inferred.** The create form proposes a default from the
  Enhetsregisteret VAT-register flag (a deterministic register read via `/oppslag`, **not** AI), and the
  user confirms it explicitly by submitting — it forks all posting (hard invariant), so it is a
  consequential, sober (§5.5) choice, never silently defaulted.
- **Multi-membership selection reads each org through its own `withOrgTx`.** Listing the orgs a user may
  act for is a pre-active-org, cross-org operation, but `organization` is RLS-scoped to one
  `app.current_org`. Rather than assume a cross-org RLS bypass (a SECURITY-DEFINER/BYPASSRLS path whose
  behaviour on Neon's custom-role topology is still unverified — see STATUS "Known issues"), the
  selection query loops the user's memberships and reads each org inside its own tenant transaction —
  the proven per-request boundary, correct on every topology. A user has a handful of orgs, so the cost
  is negligible.

## Consequences
- The foundation becomes a usable product: a logged-in user creates an org, gets a complete, standards-
  grounded chart + VAT codes, and is the owner — unblocking `feat-honest-number-surface` and all
  invoicing/posting, which need a real org with provisioned codes/accounts to write against.
- **No schema change.** Every table already exists; this is an app-layer + domain decision. Integrity is
  proven by a Testcontainers test: the provisioning transaction seeds exactly the committed counts
  scoped to the org, an owner membership exists, RLS keeps one org's rows invisible to another, and a
  duplicate org number rolls back wholesale.
- **First real forms/tables surface.** React Hook Form + `@hookform/resolvers` (the create form, with
  the `app/contracts` Zod schema as the single source of truth and the server action re-validating —
  authoritative; the page works without JS) and TanStack Table (the provisioned VAT-code table) are
  installed here, in their first consuming feature (per `frontend.md`).
- **Accepted costs / future work.** (1) 745 accounts per org is the complete standard chart, not a
  curated working set — a fresh ENK uses a fraction; a later **favourites/used-accounts** refinement can
  filter pickers without changing what is provisioned (`feat-account-chart-curation`). (2) There is no
  persisted "active org" yet — selection links to each org's overview; a session-scoped active-org
  context is `feat-org-active-context`. (3) No `fiscal_period`/`invoice_counter` is seeded here (posting
  features create the period they need); provisioning stays scoped to the chart + codes.

## Alternatives considered
- **A static migration seeding global reference rows.** Rejected — `account`/`vat_code` are per-org and
  RLS-scoped; there is no org at migrate time, and a shared global chart breaks tenancy. The rows must
  be written per org, at creation.
- **Provision a curated ENK starter chart (~30–40 accounts).** Rejected for now — the selection criteria
  are accounting judgment (memory-grounding risk) and add a hand-maintained list to keep in sync with the
  committed source. Loading the whole committed list is deterministic; curation is a UI-layer filter
  (sequenced).
- **A SECURITY DEFINER `organizations_for_user(uuid)` for the selection list.** Rejected for now —
  cleaner as a single query and matches the `allocate_invoice_number` precedent, but a definer that reads
  the RLS-FORCEd `organization` table depends on the owner's RLS/BYPASS behaviour, which is unverified on
  Neon's custom-role setup. Looping `withOrgTx` is correct on every topology today; the function can
  replace it once the live RLS topology is confirmed.
- **Hand-derive account `type` per account.** Rejected — the kontoklasse (leading digit) is the SAF-T
  class structure itself (evidenced by the committed 2-character list); a pure, exhaustively-tested
  classifier is source-grounded and needs no per-row table.
