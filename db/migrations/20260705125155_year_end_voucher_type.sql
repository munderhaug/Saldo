-- The year-end closing voucher type (ADR 0064, feat-year-end-close, build-spec §8.6/§8.10).
--
-- Årsavslutning posts ONE voucher that empties every result-side account (kontoklasse 3–8) into
-- equity — the carry-forward. The type is load-bearing for reporting: the closed year's resultat
-- EXCLUDES `year_end` vouchers (the P&L stays readable after the close), and the balanse stops
-- injecting a derived årsresultat once it is posted. ADR 0061 deferred a dedicated type for opening
-- balances because nothing behaved differently; here the reports do, so the type earns its place.
--
-- The CHECK is re-created with NOT VALID + VALIDATE so a populated voucher table takes only a brief
-- metadata lock; existing rows all satisfy the wider set by construction (it is a superset).

-- migrate:up

ALTER TABLE voucher DROP CONSTRAINT voucher_type_check;
ALTER TABLE voucher ADD CONSTRAINT voucher_type_check
  CHECK (type IN ('sales', 'purchase', 'manual', 'bank', 'reversal', 'year_end')) NOT VALID;
ALTER TABLE voucher VALIDATE CONSTRAINT voucher_type_check;

-- migrate:down

ALTER TABLE voucher DROP CONSTRAINT voucher_type_check;
-- Down restores the original set; squawk's NOT VALID advice is waived like the greenfield originals.
-- squawk-ignore constraint-missing-not-valid
ALTER TABLE voucher ADD CONSTRAINT voucher_type_check
  CHECK (type IN ('sales', 'purchase', 'manual', 'bank', 'reversal'));
