# MVA-melding (skattemelding for merverdiavgift) — raw captures

Primary-source captures of Skatteetaten's **MVA-melding** (VAT return) XML format — the schema, code
lists and canonical example the generator (`@saldo/domain/mva-melding`) and the validator are grounded
in. The melding is **code-based**: every figure maps to a SAF-T standard VAT code (the same list under
`db/reference/saf-t/tax-codes/`), never a fixed numbered field. Append-only; refresh by adding the next
schema version alongside (do not rewrite history). Distilled into `docs/regulatory/mva-melding.md`.

| File | Source | Collected |
|---|---|---|
| `xsd/no.skatteetaten.fastsetting.avgift.mva.skattemeldingformerverdiavgift.v1.0.xsd` | Skatteetaten `mva-meldingen` repo — the `mvaMeldingDto` schema (v1.0) | 2026-06-26 |
| `examples/eksempelMedAlleTilfeller.xml` | Skatteetaten — canonical example covering every code/case | 2026-06-26 |
| `examples/mvakode3.xml` | Skatteetaten — minimal single-code (output VAT 25 %) example | 2026-06-26 |
| `examples/omvendtavgiftsplikt_mvamelding.xml` | Skatteetaten — reverse-charge (omvendt avgiftsplikt) example | 2026-06-26 |
| `kodelister/sats.xml` | Skatteetaten — the `sats` (rate %) code list: `0`, `11,11`, `12`, `15`, `25` | 2026-06-26 |
| `kodelister/mvaSpesifikasjon.xml` | Skatteetaten — the `mvaSpesifikasjon` code list (justering / tapPåKrav / …) | 2026-06-26 |

## The shape (grounded, not memorised)
- Root `mvaMeldingDto`, namespace `no:skatteetaten:fastsetting:avgift:mva:skattemeldingformerverdiavgift:v1.0`.
- One `mvaSpesifikasjonslinje` per (code, leg): `mvaKode`, optional `grunnlag` + `sats`, and `merverdiavgift`.
- **Sign rule (verified against `eksempelMedAlleTilfeller.xml`):** output VAT lines carry a POSITIVE
  `merverdiavgift` with `grunnlag` + `sats`; pure input-deduction codes (1, 11–15) carry only a NEGATIVE
  `merverdiavgift` (no `grunnlag`); zero-rated / exempt turnover carries `grunnlag`, `sats` 0, VAT 0.
- **The tie-out:** `fastsattMerverdiavgift` == the SIGNED sum of every line's `merverdiavgift`
  (output − deductible input). Confirmed numerically: the all-cases example sums to its declared `77511`.
- Amounts are whole **kroner** (`Beloep` = decimal); the domain holds integer **øre** and rounds to
  kroner only at the XML/presentation boundary.

The SAF-T standard tax-code list (the `mvaKodeSAFT` code list) is the existing committed
`db/reference/saf-t/tax-codes/Standard_Tax_Codes.csv` — not duplicated here.

Statutory text is quoted verbatim where used (åndsverkloven § 14 — law is not copyright-protected).
The Skatteetaten schema/example files are public technical artefacts from the open `mva-meldingen`
documentation repository, captured for interoperability.
