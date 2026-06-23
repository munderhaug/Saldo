# db/reference/brreg

Committed raw captures of the **Enhetsregisteret (Brønnøysundregistrene) Open Data API** — the
source of truth for the `enhetsregisteret` integration's response shape, so company-lookup code is
grounded in a committed source, never model memory. Cited by `docs/integrations/enhetsregisteret.md`.

**Captured:** 2026-06-23 · live `https://data.brreg.no/enhetsregisteret/api/enheter`. NLOD-licensed
open data; no auth. **verify-by:** 2026-12-31 (re-capture via the `regulatory-update` skill if the
shape drifts).

## Files
| File | Endpoint | What it grounds |
|---|---|---|
| `enheter-923609016.json` | `…/enheter/923609016` | Single unit, full shape. EQUINOR ASA — `registrertIMvaregisteret: true`, `naeringskode1`, both `forretningsadresse` + `postadresse`, status flags. |
| `enheter-311000004.json` | `…/enheter/{orgnr}` | Single ENK (the target user type) — `organisasjonsform.kode: "ENK"`, `registrertIMvaregisteret: false` (under-threshold), minimal fields (no `postadresse`/`kapital`). **Synthetic** — see below. |
| `enheter-sok-navn.json` | `…/enheter?navn=rema 1000&size=2` | Search envelope **with** results: `_embedded.enheter[]` + `page` (`totalElements`, `totalPages`, …). |
| `enheter-sok-tomt.json` | `…/enheter?navn=<no match>&size=2` | Search envelope with **zero** results — note `_embedded` is **absent** (only `_links` + `page.totalElements: 0`). The contract must treat `_embedded` as optional. |

## Privacy note (why one capture is synthetic)
An **enkeltpersonforetak**'s `navn` and `forretningsadresse` are frequently a natural person's name
and home address — personal data (`.claude/rules/data-handling.md`), even though the register is
public/open. We do **not** commit a real individual's PII as a permanent fixture. `enheter-311000004.json`
therefore keeps a **faithful ENK response structure** but with the natural-person fields replaced by
placeholders (`EKSEMPEL ENKELTPERSONFORETAK`, `Eksempelveien 1`) and a **synthetic, mod11-valid,
unassigned** org number (`311000004` → 404 on the live API). The two non-personal captures (Equinor
ASA; the REMA 1000 AS/FLI search results) are real and verbatim.
