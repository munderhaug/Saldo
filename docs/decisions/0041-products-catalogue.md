# ADR 0041 — Products & services catalogue data model

- **Status:** Accepted
- **Date:** 2026-06-25

## Context
Build-spec §8.3 calls for a catalogue of goods/services — each with a default account + VAT code +
unit + net price and a goods/service classification — feeding the sales-invoice lines of §8.4. The
catalogue is a convenience/templates layer: sales invoicing (`feat-sales-invoicing`) deliberately does
NOT hard-depend on it (an invoice can ship ad-hoc free-text lines), so the catalogue's job is to let a
line be prefilled from a saved item. The question is what to model now versus defer, how a price stays
on the money invariant, and how the table fits the tenancy + same-org-defaults regime established for
contacts (ADR 0040).

## Decision
- **One `product` table; the item IS the reusable line template.** A catalogue item carries a short
  `name` (the picker label) and an optional longer `description` (the text that lands on an invoice
  line), plus `unit`, net `unit_price_ore`, and the goods/service `kind`. Build-spec §8.3 also lists
  "reusable line templates" as a distinct artefact; rather than a separate multi-line template entity
  (which has no consumer until invoicing exists), a single catalogue item serves as the reusable line.
- **Price is integer øre (`unit_price_ore bigint`, `>= 0`), stored NET (excl. VAT).** The kroner the
  user types are parsed to øre once via the domain `parseKroner` at the Zod/db boundary — never float
  math (`.claude/rules/money.md`). Gross (incl. VAT) is **derived only for display** by a new pure
  helper `grossFromNet(net, rate)` in `@saldo/domain` (`mulRate` once, half away from zero), re-run in
  the browser for an instant incl-VAT preview. Nothing gross is persisted.
- **`kind` is a goods/service CHECK** (`'goods' | 'service'`), the §8.3 classification, relevant to
  place-of-supply / reporting downstream; it is metadata, not a posting driver.
- **Defaults are same-org by construction.** `default_account_id` / `default_vat_code_id` are pinned to
  the item's own org via a composite FK `(default_*, organization_id) → (id, organization_id)`, reusing
  the `UNIQUE (id, organization_id)` targets ADR 0040 added to `account`/`vat_code`. A default can
  never reference another tenant's row even though FK targets are not RLS-constrained. The VAT code is
  source-grounded — one of the org's provisioned SAF-T codes, never a number from memory.
- **Reference data, not the ledger.** Items are mutable: no immutability/append-only triggers. The
  table joins the standard tenancy regime (ENABLE + FORCE RLS, a USING/WITH CHECK policy on
  `app.current_org`, a `saldo_app` grant), proven by a Testcontainers isolation test.
- **No personal data.** A catalogue item describes a good/service, not a natural person, so no field is
  tagged `// personal` (contrast ADR 0040). Routes stay `Cache-Control: private, no-store` for
  consistency, as they expose a tenant's price list.
- **Deferred to their own tasks:** line/document discounts and multi-line document templates. Both feed
  invoice composition (§8.4) and have no consumer until the sales-invoice surface exists; building them
  now would be speculative.

## Consequences
- Sales-invoice lines (§8.4) can later resolve a catalogue item and prefill description/unit/net
  price/account/VAT code from one row; the same-org FK means a prefilled default is always valid for
  the tenant.
- `grossFromNet` lives in the pure core as a presentation helper alongside the net/vat/gross split
  `posting/derive.ts` uses. It must stay out of posting call sites (use the posting machinery there);
  it exists so the catalogue surface need not pull in the posting module.
- The full SAF-T export (`feat-saft-export`) and any anti-lock-in data export should include `product`
  for completeness — tracked with those features, not here (the catalogue holds no personal data, so it
  carries no GDPR-access obligation of its own).

## Alternatives considered
- **A separate multi-line `line_template` entity now** — deferred: no consumer until invoicing; the
  single item already serves as a one-line template. Revisit when §8.4 needs grouped presets.
- **Required (NOT NULL) default account + VAT code** — rejected: an item can be created before the user
  has decided its posting account, and nullable-with-same-org-FK mirrors the contacts precedent; the
  form encourages but does not force the defaults.
- **Storing price as gross, or as kroner/decimal** — rejected: violates the øre invariant and forces
  divergent re-derivation of VAT. Net øre + a single derived gross is the honest model.
- **A `unit` enum** — rejected: units are open-ended across trades (stk, time, kg, m², …); free text
  with a sensible default (`stk`) fits without a brittle enumeration.
