# MVA (VAT) rates and the SAF-T rate categories

The SAF-T **Standard Tax Codes** list (committed under `db/reference/saf-t/tax-codes/`) names a
_rate category_ per code — e.g. `Regular rate`, `Reduced rate, middle`, `Reduced rate, low`,
`Reduced rate, raw fish` — but **not** the numeric percentage, which Skatteetaten sets per year.
This page is the cited, dated mapping from category → percentage. The domain never hardcodes a
rate from memory: it maps a SAF-T code to its category, then this table to a `Rate`.

## Current rates (2026)
| SAF-T rate category | Percentage | Applies to |
|---|---|---|
| `Regular rate` | **25 %** | Standard rate — most goods and services |
| `Reduced rate, middle` | **15 %** | Foodstuffs; water and wastewater services |
| `Reduced rate, low` | **12 %** | Passenger transport, accommodation, cinema/cultural entry, public broadcasting |
| `Reduced rate, raw fish` | **11.11 %** | First-hand sale of raw fish via a fishermen's sales organisation (råfisklag) |
| `Zero rate` | **0 %** | Zero-rated (fritatt) turnover, exports, reverse-charge basis |
| _(no category)_ | n/a | Codes outside the VAT Act / no VAT treatment (`0`, `6`, `7`, `20`) |

Rates apply per the date of supply; crossing a rate change is not retroactive. The `raw fish`
rate (11.11 %) is the input-side rate for first-hand raw-fish purchases and is out of scope for a
typical ENK; it is included for completeness and flagged for re-confirmation.

## Why it matters in Saldo
- `vat_code.rate` is seeded from this mapping when an organization's code list is provisioned.
- The pure posting derivation computes VAT as `mulRate(net, rate)` — rounded once, half away from
  zero (`.claude/rules/money.md`). It takes the `Rate` as input; it does not know the percentages.
- A yearly rate change is a data change here + a new dated capture, not a code change.

## Sources
- Skatteetaten, "Value added tax — rates" (2026: 25 % / 15 % / 12 %).
  Raw: db/reference/mva/2026-06-22-skatteetaten-vat-rates.html. verify-by: 2026-12-31
- Skatteetaten, SAF-T "Standard Tax Codes" (rate categories per code).
  Raw: db/reference/saf-t/tax-codes/Standard_Tax_Codes.csv. verify-by: 2026-12-31
- Råfisk rate 11.11 %: confirm against Skatteetaten's "Merverdiavgift — satser" before relying on it
  for raw-fish purchases. verify-by: 2026-12-31
