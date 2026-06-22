# SAF-T reference data (committed copy)

Commit a versioned copy of the official Skatteetaten SAF-T artifacts here and load codes/accounts
from them — **never hardcode VAT-code numbers or account numbers from memory** (rule §4.3).

Fetch from `github.com/Skatteetaten/saf-t`:
- `Norwegian_SAF-T_Financial_Schema_v_*.xsd` — validated against in CI and `pnpm saft:validate`.
- Standard VAT codes (`vat_code` seed).
- Standard chart of accounts (`account` seed).

Licensing note: the SAF-T standard-accounts list is copyright **Regnskap Norge AS**, licensed only
for SAF-T mapping. Keep this directory out of Prettier/ESLint (already ignored) and treat it as
vendored — a PreToolUse hook blocks hand-edits.
