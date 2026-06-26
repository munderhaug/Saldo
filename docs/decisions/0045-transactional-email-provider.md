# ADR 0045 — Transactional email provider: Postmark (EU region)

- **Status:** Accepted
- **Date:** 2026-06-26

## Context
Invoice delivery (build-spec §8.4) and later reminders/purring (`feat-recurring-invoices-reminders`)
need a transactional email sender. This was the last open Phase-3 integration decision (STATUS → Open
decisions; roadmap Part 6) and the explicit blocker on `feat-invoice-pdf-email`.

Two things narrow the choice:
- **The interface is already fixed** as `nodemailer` behind a provider-agnostic SMTP abstraction
  (`docs/tech-stack.md`, `docs/integrations/README.md`). So this is a *provider* choice, not an
  architecture one — swapping later is a credentials/config change, not a rewrite.
- **EU/EEA data residency is a hard invariant** (`.claude/rules/data-handling.md`, build-spec §11):
  an invoice email carries personal + financial data, so the provider must process and store in the
  EU/EEA under a GDPR DPA. This eliminates any default US-region endpoint.

Candidates considered: Postmark (EU region), AWS SES (`eu-*`), Scaleway TEM, Mailgun (EU region),
MailMojo (Norwegian).

## Decision
Use **Postmark in its EU region** as the transactional email provider, wired through the existing
`nodemailer` SMTP interface. Chosen for transactional-grade deliverability + DX (templating, bounce/
delivery webhooks, message streams that keep transactional reputation separate from any future
marketing mail) with an explicit EU data-residency option and DPA. "For now": because the interface
is swappable, this is revisitable without code churn if cost-at-scale or vendor consolidation later
argues for SES `eu-*`.

Operational guardrails (carried into the implementing task):
- Pin the **EU region/server** explicitly — the US region would violate the residency invariant.
- Credentials come from the **server env only** (`env.ts` Zod contract), never committed; never log
  email bodies/recipients as personal data (pino redaction, `data-handling.md`).
- Sign with SPF/DKIM/DMARC for the sending domain (deliverability, anti-spoofing).

## Consequences
- `feat-invoice-pdf-email` is **unblocked** (the provider decision is settled); it can render the
  issued-invoice PDF and send via the Postmark EU SMTP/API behind the nodemailer interface.
- A go-live prerequisite is added: a Postmark account in the EU region, a signed DPA, a verified
  sending domain with SPF/DKIM/DMARC, and the API key in the deploy environment. Like the Neon/R2
  EU-DPA items, this is a live-integration step the local environment does not exercise.
- Choosing a single provider keeps the integration surface small; the swappable interface keeps the
  exit cost low.

## Alternatives considered
- **AWS SES (`eu-*`).** Cheapest at volume and EU regions exist, but weaker DX and more deliverability
  setup (warmup, separate reputation tooling). Kept as the documented fallback if cost dominates.
- **Scaleway TEM.** EU-native (French) and simple, but a smaller deliverability track record and
  ecosystem than Postmark. Acceptable on residency; not the deliverability leader.
- **Mailgun (EU region).** A mature peer to Postmark, but US-headquartered processor (Sinch parent)
  even in the EU region — a weaker residency/trust story for a privacy-first Norwegian product.
- **MailMojo (Norwegian).** The strongest residency + local-trust story (data in Norway, NO-language
  support), but a **marketing/newsletter-first** platform; its transactional SMTP/API maturity,
  per-message templating and delivery SLAs are unproven for invoice-grade transactional mail. Rejected
  for now on reliability risk; revisitable (swappable interface) if its transactional offering proves out.
- **Cloudflare Email Workers.** Fits the edge stack but is routing/sending-lite, not a full
  transactional product. Rejected for invoice delivery.
