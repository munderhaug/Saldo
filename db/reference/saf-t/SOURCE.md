# SAF-T reference — provenance

Vendored copy of the official Norwegian SAF-T artifacts. **Do not hand-edit** (a PreToolUse
hook and Prettier/ESLint ignores treat this tree as immutable, vendored source). Refresh only
by re-copying from upstream and recording the new commit + date below (see the
`regulatory-update` skill).

- **Upstream:** https://github.com/Skatteetaten/saf-t
- **Upstream commit:** `021ede90bce361e285229da15aa2ba93831a3f0d` (2026-05-26)
- **Collected:** 2026-06-22
- **verify-by:** 2026-12-31 (re-confirm the schema version and code lists against upstream)

## Files
| Path | Upstream original | Purpose |
|---|---|---|
| `schema/Norwegian_SAF-T_Financial_Schema_v_1.10.xsd` | same | SAF-T Financial XSD — validated against in CI / `pnpm saft:validate` |
| `tax-codes/Standard_Tax_Codes.csv` | `Standard Tax Codes/CSV/…` | Standard VAT code list (code, NOB/ENG description, rate category, compensation) |
| `tax-codes/Standard_Tax_Codes.xml` / `.xsd` | `Standard Tax Codes/XML/…` | Same list as XML + its schema |
| `accounts/General_Ledger_Standard_Accounts_2_character.csv` | `General Ledger Standard Accounts/CSV/…` | Standard accounts, 2-digit grouping level |
| `accounts/General_Ledger_Standard_Accounts_4_character.csv` | same | Standard accounts, 4-digit level (SAF-T mapping kontoplan) |
| `accounts/General_Ledger_Standard_Accounts.xsd` | `…/XML/…` | Schema for the standard-accounts lists |
| `accounts/Copyright Notice GL Standard Accounts.txt` | same | License notice (see below) |

## Licensing
The **General Ledger Standard Accounts** code lists are © **Regnskap Norge AS, 2018**, and may be
used **only in connection with SAF-T mapping**. Other commercial use requires agreement with
Regnskap Norge AS (https://www.regnskapnorge.no). The SAF-T schema and Standard Tax Codes are
published by Skatteetaten.
