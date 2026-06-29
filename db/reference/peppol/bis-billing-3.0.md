# EHF / PEPPOL BIS Billing 3.0 — the subset Saldo generates locally (capture)

> **Captured:** 2026-06-26 · **Verify by:** 2027-06-26 (re-check VEFA release notes annually).
> **Why this file exists:** VAT codes, category mappings and identifier schemes are NEVER built from
> model memory (hard invariant, AGENTS.md). The EHF generator (`@saldo/domain/peppol`) maps Saldo's
> frozen sales document onto UBL 2.1 + PEPPOL BIS Billing 3.0 using ONLY the mappings recorded here.

## What EHF is
**EHF** (Elektronisk handelsformat) is the Norwegian profile of **PEPPOL BIS Billing 3.0**, which binds
the **EN 16931** semantic data model to **OASIS UBL 2.1** `Invoice` / `CreditNote` syntax. The wire
identifiers are fixed strings:

| Field | Value |
|---|---|
| `cbc:CustomizationID` | `urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0` |
| `cbc:ProfileID` | `urn:fdc:peppol.eu:2017:poacc:billing:01:1.0` |
| Invoice type code (`cbc:InvoiceTypeCode`) | `380` (commercial invoice) — UNCL1001 |
| Credit note type code (`cbc:CreditNoteTypeCode`) | `381` (credit note) — UNCL1001 |
| Party scheme for a Norwegian org nr | `0192` (ISO 6523 — "Norwegian organisation number") |
| EndpointID scheme (PEPPOL routing address) | `0192` for a NO org nr |

## VAT category (UNCL5305) — Saldo treatment → BIS category code
EN 16931 carries a **VAT category code** per line + per tax-subtotal (`cbc:ID` under
`cac:TaxCategory`). Saldo derives the line treatment from the committed SAF-T tax code
(`checkSalesLine` / `line-treatment`), so the mapping is treatment-driven, never code-number-driven:

| Saldo treatment (rate category) | UNCL5305 | Meaning |
|---|---|---|
| `output-vat` (regular / reduced-*) | `S` | Standard rate |
| `zero-rated` (fritatt / export, `zero`) | `Z` | Zero rated |
| exempt — `unntatt` (`none`, outside the VAT Act) | `E` | Exempt from VAT |
| `reverse-charge` (domestic omvendt avgiftsplikt, code 51) | `AE` | VAT reverse charge |

Rules tied to the category (subset enforced by the validator):
- **BR-S-08 / BR-Z-08 / BR-E-08 / BR-AE-08** — each VAT breakdown's *taxable amount* equals the sum of
  line net amounts assigned that category.
- **BR-S-09 …** — the breakdown's *tax amount* = taxable × rate (for `S`); for `Z`/`E`/`AE` the rate is
  0 and the tax amount is 0.
- **BR-AE-05/AE-09** — a reverse-charge line carries rate 0 and the document books no VAT on it (the
  buyer self-accounts); Saldo already posts revenue-at-net for code 51.

## Unit of measure (UN/ECE Rec 20) — Saldo's free-text unit → code
`cbc:InvoicedQuantity/@unitCode` is a UN/ECE Rec 20 code. Saldo stores a free-text unit ("stk", "time");
the generator maps the common ones and falls back to **`C62`** ("one"/piece) for anything unmapped:

| Saldo unit (lowercased) | Rec 20 |
|---|---|
| `stk`, `stykk`, `enhet`, `ea` | `C62` (one) |
| `time`, `t`, `timer`, `hour`, `hr` | `HUR` (hour) |
| `dag`, `dager`, `day` | `DAY` |
| `kg`, `kilo` | `KGM` |
| `km` | `KMT` |
| `liter`, `l` | `LTR` |
| `mnd`, `måned`, `month` | `MON` |
| _anything else_ | `C62` (fallback) |

## Document-level money rules (subset enforced)
- **BR-CO-10** — `LineExtensionAmount` (Σ line net) ties to the document's frozen net.
- **BR-CO-13** — `TaxExclusiveAmount` = Σ line net.
- **BR-CO-15** — `TaxInclusiveAmount` = TaxExclusive + Σ VAT (the frozen gross).
- **BR-CO-17** — each VAT breakdown's *category tax amount* = the category taxable base × (rate ÷ 100),
  rounded to the øre (round half away from zero). The magnitude tie BR-S-09/BR-`{cat}`-09 (direction
  only) misses; enforced as an exact integer-øre comparison via `mulRate`.
- **BR-CO-16 / PayableAmount** — equals the tax-inclusive amount (no prepaid/rounding handled in the
  "start now" subset).
- Money is integer **øre** end-to-end; amounts are serialized as decimal kroner only at the XML
  boundary (the `formatKr`-style 2-decimal presentation), never recomputed from rates.

## Payment means (`cac:PaymentMeans`)
- **PaymentMeansCode 30** (credit transfer) is the means Saldo emits. A code-30 invoice requires
  `cac:PayeeFinancialAccount/cbc:ID` — the seller's bank account (BBAN/IBAN) the customer pays into
  (BG-17 / BT-84; the BR-CO-25 payment-instructions family). Saldo emits it from the org's configured
  payout account, plus the KID as `cbc:PaymentID`. UBL child order: `PaymentMeansCode` → `PaymentID` →
  `PayeeFinancialAccount`. When the org has no account configured, `cac:PaymentMeans` is still emitted
  for the KID but without `PayeeFinancialAccount` (the document is then incomplete for a code-30
  transfer until a payout account is set).

## Mandatory presence (subset enforced)
BR-01 CustomizationID · BR-02 invoice number · BR-03 issue date · BR-04 type code · BR-05 currency ·
BR-06 seller name · BR-07 buyer name · BR-09 seller country code · BR-11 buyer country code · BR-CO-26
seller legal registration id (the org nr, scheme 0192). The postal-address GROUP (BG-5/BG-8, BR-08/
BR-10) is emitted by construction; the individually rule-mandated field is the **country code** (city
BT-37/BT-52 is recommended, not blocked).

## Deliberately OUT of scope here (deferred to `feat-peppol-send`, build-spec §9 / Phase 9)
- The **full VEFA Schematron** (every EN 16931 + PEPPOL business rule) — needs the compiled `.sch`
  artefacts and an XSLT processor; this local generator enforces the **subset above** + XML
  well-formedness, exactly the "start now" posture build-spec §9 asks for ahead of the access point.
- **Transmission** via a commercial PEPPOL access point (Storecove/Tickstar/…), ELMA participant
  lookup, and the SBDH envelope.
- Allowances/charges, prepaid amounts, rounding, multi-currency tax, delivery/period, attachments.

## Sources (consult, don't memorise)
- PEPPOL BIS Billing 3.0 — https://docs.peppol.eu/poacc/billing/3.0/
- EHF (DFØ/Anskaffelser) — https://anskaffelser.no/verktoy/standarder/elektronisk-handelsformat-ehf
- OASIS UBL 2.1 — http://docs.oasis-open.org/ubl/UBL-2.1.html
- VEFA validator — https://vefa.difi.no/
