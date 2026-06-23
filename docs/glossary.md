# Glossary (Norwegian accounting terms)

Treat these as precise domain terms, not approximate translations. The authoritative table lives in
`docs/saldo-build-specification.md` §3; the high-frequency subset is below for quick reference.

| Term | Meaning |
|---|---|
| **Enkeltpersonforetak (ENK)** | Sole proprietorship; the target legal form. Owner not an employee. |
| **Bokføringsplikt** | Bookkeeping obligation — follows from the duty to submit annual accounts and/or income statements (næringsoppgave) or a VAT return; distinct from the 50,000 NOK MVA-registration threshold. |
| **Regnskapsplikt** | Annual-accounts obligation (ENK only above 20M assets / 20 årsverk). Out of scope. |
| **MVA / merverdiavgift** | VAT. Output = utgående, input = inngående. |
| **Bilag** | Voucher — the documented accounting transaction. |
| **Motbilag** | Reversing/correction voucher — the only way to fix a posted bilag. |
| **Kreditnota** | Credit note — the only way to correct an issued invoice. |
| **Kontoplan / Hovedbok** | Chart of accounts (NS 4102) / general ledger. |
| **Reskontro** | Customer/supplier subledgers; basis of AR/AP aging. |
| **Unntatt** | Exempt — outside the VAT Act. No output VAT, no input deduction. |
| **Fritatt / 0-sats** | Zero-rated. 0% output, input VAT IS deductible. |
| **Snudd avregning** | Reverse charge — buyer accounts for both VAT legs. |
| **KID** | Payment identifier enabling automatic reconciliation. |
| **SAF-T** | Standard Audit File for Tax — mandatory export format. |
| **EHF** | Norwegian e-invoice format (= PEPPOL BIS Billing 3.0). |
| **Altinn / ID-porten** | Government filing platform / national auth gateway. |
| **Enhetsregisteret** | Brønnøysund entity register; open API for company + VAT-register status. |

Full table (40+ terms): `docs/saldo-build-specification.md` §3.
