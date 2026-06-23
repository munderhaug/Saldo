# Income-tax (skatt) — raw captures

Primary-source captures for the Norwegian **personal income-tax** layer an *enkeltpersonforetak* owner
is taxed under (trinnskatt, alminnelig inntekt, personfradrag, trygdeavgift). These ground the
honest-number "set aside" estimate (`feat-tax-estimate`). Append-only; refresh by adding a new dated
file when Stortinget sets the next year's rates. Distilled into `docs/regulatory/skatt-enk-personskatt.md`.

| File | Source | Collected |
|---|---|---|
| `2026-06-23-stortingets-skattevedtak-2026.md` | Stortingets skattevedtak 2026 (FOR-2025-12-18-2747) — trinnskatt, fellesskatt, kommune/fylke, personfradrag, minstefradrag | 2026-06-23 |
| `2026-06-23-trygdeavgift-2026.md` | Avgifter til folketrygden 2026 (FOR-2025-12-18-2748) + folketrygdloven § 23-3 (nedre grense / opptrapping) | 2026-06-23 |

Statutory text is quoted verbatim (åndsverkloven § 14 — law is not copyright-protected). The Skatteetaten
satser pages are copyrighted and used only to cross-confirm figures, never reproduced.
