# ADR 0052 — SAF-T Financial export

- **Status:** Accepted
- **Date:** 2026-06-26

## Context
Norwegian bookkeeping law (bokføringsforskriften § 7-8) requires that, on demand from the tax
authorities (a *bokettersyn*), a business produce its accounting records as a standardised
**SAF-T Financial** XML file, valid against Skatteetaten's official XSD. Saldo had only a scaffold
(`pnpm saft:validate` printed `NOT YET IMPLEMENTED`, CI label SCAFFOLD); build-spec §8 / Phase 8 calls
for the real export. We already commit the official SAF-T artifacts (`db/reference/saf-t/`: the v1.10
schema, the standard accounts, the standard tax codes) and the reporting/MVA work (ADR 0050/0051)
established the pattern: a pure `@saldo/domain` generator over an RLS-scoped aggregation of the posted
ledger, validated locally in CI.

## Decision
Generate the SAF-T Financial document **purely in `@saldo/domain`**, read-only over the posted ledger,
and **XSD-validate it in CI**.

- **Domain (`packages/domain/src/saft/financial.ts` + `financial-xml.ts`):** `generateSaftFinancial`
  composes account masters (with opening/closing balances), one Journal per voucher type → Transactions
  → Lines, the parties register, and the tax table into a `SaftFinancial` model; `buildSaftXml`
  serializes it to the schema's element tree. Money stays integer **øre**; the 2-decimal
  `SAFmonetaryType` is formed integer-safely at the XML boundary only. Account numbers, VAT codes and
  rates come from the committed reference lists (passed in as indices) — never memorised.
- **Aggregation (`apps/web/app/db/saft.server.ts`):** `readSaftFinancial(tx, year)` reuses the existing
  read pattern (the same posted-ledger joins as `aggregateVatByCode`/`aggregateAccountBalances`), all
  through `withUserOrg` + FORCE-RLS — no new posting path, no new table. The kontoklasse (`account.type`)
  is the source of an account's economic role, never a hardcoded number.
- **The tie-out is the contract:** `TotalDebit = TotalCredit`, every transaction balances, and the
  account masters' signed closing balances net to zero — all by construction from the append-only
  balanced ledger (`saftBalances`/`saftClosingBalanceNet`).
- **`pnpm saft:validate` is now real:** it builds a representative export from the committed lists and
  validates tie-out + XML well-formedness + **XSD validation against the committed schema** via
  `xmllint-wasm` (a deterministic WASM build of libxml — no native/system dependency, pinned in the
  lockfile). The SCAFFOLD label is removed.
- **Surface:** a sober view route (`/orgs/:orgId/saft`) and an XML resource route
  (`/orgs/:orgId/saft.xml`, `private, no-store`, attachment) — the file a user hands to an accountant
  or uploads at a bokettersyn. Deterministic, **NOT an AI system** (EU AI Act Recital 12; no Art. 50).

**TaxInformation mapping.** A `TaxInformation` block is emitted only on a posting's **MVA-account leg**
(kontoklasse 2 `equity_liability` carrying a VAT code), with `TaxAmount` = the VAT actually posted. The
basis (revenue/cost) line carries the code but no tax block, so amounts never double-count and the file
ties out. A reverse-charge dual leg posts two MVA-account legs, so both legs carry their own
`TaxInformation` (output + and deductible input); a non-deductible (`uten fradragsrett`) VAT booked to
the cost account carries none — correctly, since the VAT is part of the cost. This keys off where the
ledger actually posted the VAT (the source of truth for what was booked), not a re-derivation.

## Consequences
- A real, XSD-valid SAF-T Financial file is producible per org per year, reusing the posted ledger with
  no new posting path — figures cannot diverge from the ledger.
- The CI `saft:validate` gate now actually validates generation + XSD on every change to export logic;
  a mapping regression fails the build (it already caught a 36-char UUID overflowing the 35-char
  `CustomerID` limit during development). A new dev dependency (`xmllint-wasm`) is accepted as the cost
  of deterministic, system-independent XSD validation.
- **Known limitation — opening balances for result accounts.** Opening = prior-year cumulative,
  closing = through year end. Because **year-end close is deferred** (ADR 0051), P&L accounts
  (klasse 3–8) are never reset, so their SAF-T opening/closing carry prior-year cumulative rather than
  starting at zero each fiscal year. The per-year movement and the whole-chart tie-out remain correct,
  and a **first-year export is fully honest**; multi-year result-account opening balances await
  `feat-year-end-close`. The export stays internally consistent and XSD-valid throughout.
- **Deferred:** line-level `CustomerID`/`SupplierID` subledger references on AR/AP legs (the masters
  register is emitted; per-line party links need the invoice→contact join and supplier-invoice work);
  the `SourceDocuments` section (invoices/payments — "not in use" in the schema, optional);
  account-master filtering to a curated subset (`feat-account-chart-curation`); programmatic delivery to
  Altinn. The committed v1.10 schema is the validation target until the `regulatory-update` skill
  refreshes it (verify-by 2026-12-31).
- **Data protection.** The file is personal + financial data: generated locally (EU-resident, no
  egress), streamed and persisted nowhere, `private, no-store`, never logged, RLS-scoped. The full
  parties register is included by design — SAF-T `MasterFiles` is standing audit data and the lawful
  basis is the statutory bokføringslov export obligation (data-minimisation rationale recorded here per
  the privacy review).

## Alternatives considered
- **Shell out to system `xmllint`** for XSD validation: available on the CI image, but relying on a
  system binary is non-deterministic across environments; the lockfile-pinned `xmllint-wasm` is
  self-contained and reproducible. Rejected.
- **Well-formedness + a grounded rule subset only** (the `mva:validate`/`ehf:validate` "start now"
  approach): insufficient here — the task and a bokettersyn demand actual XSD validity, and the schema
  is committed and self-contained, so full XSD validation is achievable now. Rejected in favour of real
  XSD validation.
- **A separate SAF-T posting/extraction path:** rejected — it would risk divergence from the ledger.
  The export reuses the same posted-ledger aggregation as reporting/MVA (hard invariant: figures tie
  out to the ledger).
- **Attaching `TaxInformation` to the basis (revenue/cost) line with `TaxBase` + `TaxAmount`:** the
  XSD allows it, but it requires pairing each basis line with its VAT line within a voucher; mapping the
  tax to the MVA-account leg (the posted VAT) is simpler and exactly tie-out-correct. Deferred as a
  possible enrichment.
