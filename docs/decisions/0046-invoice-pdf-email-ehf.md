# ADR 0046 — Invoice PDF, email delivery (Postmark EU), and EHF/PEPPOL local generation

- **Status:** Accepted
- **Date:** 2026-06-26

## Context
Sales invoicing (ADR 0042) issues immutable, gapless documents and posts the AR voucher (ADR 0043),
but a customer can't yet receive the invoice. Build-spec §8.4 needs a **PDF** of an issued document and
**email delivery**; §9 wants the **EHF/PEPPOL** e-invoice generated + validated locally ("start now")
ahead of a commercial access point. The transactional-email provider was settled as **Postmark EU**
(ADR 0045) behind the already-fixed `nodemailer` SMTP interface.

Constraints that shape this: money is integer **øre** and the issued figures are **frozen** — a renderer
must never recompute them; the send is a **§5.5 consequential act** (explicit confirm, sober voice);
invoice emails carry **personal + financial data** that must stay **EU-resident** and never be logged;
identifiers/VAT-category/unit mappings for EHF must come from a **committed source**, not memory.

## Decision
1. **PDF** — render the issued invoice / credit note with **`@react-pdf/renderer`** (tech-stack, ADR
   0015 Node host; no headless browser), as a `.pdf` resource route. The renderer is pure presentation
   over a resolved view-model: the per-rate **MVA-grunnlag** is summed from the FROZEN line amounts via
   the new pure `frozenVatBreakdown` (`@saldo/domain`), money formatted through `formatKr` —
   **never recomputed**.
2. **Email** — send the PDF via the provider-agnostic **nodemailer SMTP** interface. A fail-closed
   config gate (`emailConfig`) requires an explicit **`EMAIL_REGION=eu`** assertion + full SMTP
   credentials (server env only, `env.ts` Zod contract) or the feature stays off; the transport
   `requireTLS`. The app code names no provider (Postmark is just the configured host) — no lock-in.
   Recipients/bodies are never logged (pino redaction backstop). The send is gated behind an explicit
   confirm and, on success, advances the lifecycle issued → **sent** and records the attempt.
3. **EHF/PEPPOL** — a pure UBL 2.1 builder + a grounded **BIS Billing 3.0** business-rule validator in
   `@saldo/domain/peppol`, exposed as an `.ehf.xml` resource route and a `pnpm ehf:validate` CI gate.
   It enforces the documented **subset** (mandatory presence, the four VAT categories Saldo issues,
   document money ties) + XML well-formedness — grounded in `db/reference/peppol/bis-billing-3.0.md`.
4. **Provenance** — a tenant-scoped, **append-only** `invoice_email` log (RLS + composite same-org FK;
   `saldo_app` gets SELECT/INSERT only) records each send attempt + the provider message id, for audit
   and future bounce/delivery-webhook correlation.

## Consequences
- A customer can receive an issued invoice as a PDF, and the org can generate a locally-validated EHF
  XML ahead of the access point. The frozen-amount rule keeps the rendered document and the e-invoice
  tied to the ledger.
- **Go-live steps (not exercised locally):** a Postmark EU account + signed DPA + a verified sending
  domain with SPF/DKIM/DMARC + the API key in the deploy env; **verify the configured SMTP host IS the
  provider's EU region** (the `EMAIL_REGION` flag is an operator assertion, not a host geolocation).
- **Known limitations (deferred):** the send orchestration runs inline in the request (render → send →
  record); a crash between a successful provider send and the record commit is an at-most-once gap —
  moving it to a graphile-worker job with idempotency is deferred to when the jobs surface lands
  (`feat-recurring-invoices-reminders`). EHF validation is the **subset + well-formedness**, NOT the
  full VEFA Schematron, and structured buyer postal address (city/postal code) + a real buyer
  EndpointID are not captured yet — both land with **`feat-peppol-send`** (Phase 9). Per-document
  English output is out of scope (single runtime locale, ADR 0024).

## Alternatives considered
- **HTML-to-PDF via a headless browser (Puppeteer/Playwright).** Heavier runtime + a browser dependency
  on the Node host; `@react-pdf/renderer` keeps PDF generation in React/TS with no browser (tech-stack).
- **Mechanical EU-host allow-list in the email gate.** Rejected as the primary guard: the SMTP interface
  is provider-agnostic, so the code cannot reliably geolocate an arbitrary host, and hardcoding a
  provider's EU hostnames from memory would violate the source-grounded rule. The explicit region flag +
  a go-live host verification is the honest gate; `requireTLS` covers in-transit encryption.
- **Vendoring the full UBL XSD + PEPPOL Schematron now.** A large vendored schema tree + a native XSD
  validator + an XSLT Schematron processor — disproportionate ahead of the access point. The grounded
  rule-subset + well-formedness is the build-spec §9 "start now" posture; the full VEFA pass is
  `feat-peppol-send`.
- **Duplicating the customer email onto the log vs. referencing the invoice only.** The log stores the
  recipient at send time (frozen audit of where it actually went) rather than re-reading the mutable-ish
  snapshot — stronger provenance for a §5.5 act.
