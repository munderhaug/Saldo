# Integrations

One file per external system. The full table (purpose, auth, access status, phase, cautions) is in
`docs/saldo-build-specification.md` §9. Implementation lives in `apps/web/app/integrations/`, with
durable work in `apps/web/app/jobs/` (graphile-worker). Rules: `.claude/rules/integrations.md`.

| System | Purpose | Phase | Doc |
|---|---|---|---|
| Enhetsregisteret | Org lookup + VAT-register status | 1 | `enhetsregisteret.md` |
| SAF-T reference data | kontoplan + VAT codes + XSD | 1 | (committed under `db/reference/saf-t`) |
| BankID via Criipto/Signicat | App login (eID, OIDC) | 1 | `bankid-criipto.md` |
| GoCardless (PSD2 AIS) | Bank transaction import | 2 | (captured under `db/reference/banking`; ADR 0047) |
| LLM extraction | Receipt → structured proposal | 2 | `llm-extraction.md` |
| EHF/PEPPOL (VEFA + access point) | E-invoice validate/send | 2/4 | (planned — spec §9) |
| Skatteetaten MVA-melding | VAT-return validate + submit | 3 | (planned — spec §9) |
| Altinn 3 / ID-porten | Filing transport | 3 | (planned — spec §9) |
| Vipps MobilePay | Payments + Vipps Login | 4 | (TBD) |
| Email (SMTP) | Invoice delivery + purring | 3 | (nodemailer; EU provider) |
