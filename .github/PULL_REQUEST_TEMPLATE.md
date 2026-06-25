<!--
  Saldo PR template. The full Definition of Done is docs/quality-bar.md — this is the pre-merge
  checklist, not a restatement. Delete any line that genuinely doesn't apply, and say why.
-->

## What & why

<!-- One or two sentences. Link the ADR and/or backlog task this implements. -->

- ADR / decision:
- Backlog task (`pnpm backlog`):

## Definition of Done (docs/quality-bar.md)

- [ ] `pnpm typecheck` · `lint` · `format:check` · `test` · `audit --audit-level=high` · `lint:repo` · `knip` green
- [ ] New behaviour is tested — domain (money/VAT/posting): **exhaustive + fast-check property**
- [ ] Ledger-touching change has a **Testcontainers integrity test** proving the SQL trigger/constraint blocks the bad case
- [ ] Accessibility: `jsx-a11y` clean + an axe pass on changed screens (WCAG 2.2 AA)
- [ ] Security & privacy: no secrets; Zod at every boundary; tenancy (org filter + RLS) honoured; no personal data outside the EU/EEA
- [ ] New VAT/posting behaviour is source-grounded (committed SAF-T / `db/reference/`), never from memory
- [ ] Docs: ADR for any decision; `docs/STATUS.md` updated; user-facing copy in **NO and EN**
- [ ] Reviewed by the relevant subagent (vat / privacy / a11y / integration) where applicable

## Notes for the reviewer

<!-- Anything non-obvious: a deliberate trade-off, a disclosed boundary, a follow-up task filed. -->

---

> Branch → reviewed PR; **never a direct push to `main`** (CONTRIBUTING.md). CI must be green and a human must approve.
