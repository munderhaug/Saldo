---
name: regulatory-update
description: Ingest or refresh a primary regulatory/integration source (Skatteetaten, Altinn, SAF-T, MVA rules, PEPPOL, GoCardless, BankID) and update the cited, dated knowledge page. Use whenever an external rule, API, or onboarding flow may have changed, or a page's verify-by date has passed.
---
# Regulatory update

Adapted from the "LLM wiki" pattern: our regulatory/integration knowledge is **compiled, cited, and
dated** — never carried in model memory. `db/reference/` is the immutable raw store (git is the
append-only log); `docs/regulatory/` and `docs/integrations/` are the compiled, cited pages.

## Steps (ingest → compile → date)
1. **Capture the raw source.** Commit the primary material under `db/reference/<topic>/` as
   `YYYY-MM-DD-<slug>.<ext>` with a header noting the source URL and the date collected. Don't
   paraphrase from memory — capture the real text/file.
2. **Compile the page.** Update the relevant `docs/regulatory/*.md` (or `docs/integrations/*.md`):
   - same thesis → merge into the existing page; new concept → new page.
   - cite the raw source(s) in a `## Sources` section.
   - set/refresh `verify-by: YYYY-MM-DD` (how long until this must be re-confirmed — short for
     in-flux flows like Altinn onboarding, longer for stable law).
3. **Cross-reference** related pages and the index; keep links valid.
4. **Lint:** `pnpm lint:repo` checks Sources presence, verify-by dates, and link integrity.

## Sources section format
```
## Sources
- <author/org>, "<title>", <date>. Raw: db/reference/<topic>/<file>. verify-by: <YYYY-MM-DD>
```

## Done means (evidence required)
- [ ] Raw source committed under `db/reference/` (not paraphrased from memory)
- [ ] Page cites it and carries a future `verify-by` date
- [ ] `pnpm lint:repo` passes
- [ ] If the change affects posting/VAT codes, the SAF-T reference lists were used (not hardcoded)

## Red flags — STOP
- Writing a regulatory claim with no committed source. Trusting a flow that's "in flux" (Altinn 2→3,
  systembruker/tilgangspakke) without re-confirming. A page with a past-due verify-by left unaddressed.
