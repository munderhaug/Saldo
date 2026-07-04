---
name: ehf-validate
description: Validate a generated EHF / PEPPOL BIS Billing 3.0 e-invoice — XML well-formedness plus the enforced business-rule subset — before claiming the e-invoice output is correct. Use when touching the EHF/UBL export, the invoice→EHF route, or the PEPPOL generator.
allowed-tools: Bash(pnpm ehf:validate) Read Glob Grep
---
# EHF validate

An EHF e-invoice must be PEPPOL BIS Billing 3.0-valid before it can go to a real access point. Validate
the generated XML; don't eyeball it. This is the sibling of `saft-validate` for the outbound e-invoice.

## Steps
1. `pnpm ehf:validate` — builds a representative invoice from the pure generator (`buildUblXml`) and
   checks XML well-formedness (fast-xml-parser) + the enforced BIS business-rule subset (`validateEhf`,
   grounded in `db/reference/peppol/bis-billing-3.0.md`).
2. On failure the validator prints the rule that broke. Fix the mapping in the UBL generator
   (`packages/domain/src/peppol`), not the XML — codes/units/identifiers come from the BIS reference.
3. Keep the sample in `apps/web/scripts/ehf-validate.ts` representative of the happy path the generator
   must keep valid; extend it when you add a new line/charge/allowance shape.

## Notes
- This runs in CI on every change touching the EHF/PEPPOL surface — keep it green.
- It is the build-spec §9 "start now" gate, NOT the full VEFA Schematron. When the commercial access
  point lands (`feat-peppol-send`), tighten to full VEFA and re-validate.
- The peppol generator is part of the pure domain — new behavior needs a domain test too.

## Rationalizations (don't)
| Excuse | Reality |
|---|---|
| "The XML looks right; skip validation." | Well-formedness + BIS rules catch mapping errors the eye misses — always run it. |
| "I'll map this identifier/unit from memory." | BIS codes (UNECE units, EAS scheme, tax categories) come from the committed reference; memory drifts. |
| "It's only the generator; the route is fine." | A generator regression silently breaks every e-invoice — the gate exists to catch exactly that. |

## Red flags — STOP
- Claiming EHF/PEPPOL output is correct without running `pnpm ehf:validate`. Mapping a unit/scheme/tax
  code from memory instead of the BIS reference. A generator change with no domain test.

## Done means (evidence required)
- [ ] `pnpm ehf:validate` passes (well-formed AND BIS-subset clean), not skipped/stubbed
- [ ] any new line/charge shape is reflected in the sample and covered by a `peppol` domain test
