-- Seller payee bank account for EHF/PEPPOL (review §5). EHF BIS Billing 3.0 requires
-- cac:PayeeFinancialAccount/cbc:ID for a credit-transfer (PaymentMeansCode 30) invoice — the account
-- the customer pays into. Saldo had no source for it: `organization` carried no bank account, and the
-- `bank_account` table is the import/reconciliation side (0..N, no payee role). Add an explicit
-- org-level payout account (the single account an ENK gets paid into).
--
-- Nullable: existing orgs (and any without one set yet) simply emit no PayeeFinancialAccount — the same
-- output as before, no regression. The org-settings UI to populate it is the follow-up; the read/emit
-- path is wired here. organization is already FORCE-RLS'd with its org_isolation policy, and these are
-- plain nullable columns on it, so no policy/grant change is needed.

-- migrate:up

ALTER TABLE organization ADD COLUMN invoice_payment_account text; -- BBAN or IBAN (free-text, as entered)
ALTER TABLE organization ADD COLUMN invoice_payment_account_name text; -- optional account holder name

-- migrate:down

ALTER TABLE organization DROP COLUMN IF EXISTS invoice_payment_account_name;
ALTER TABLE organization DROP COLUMN IF EXISTS invoice_payment_account;
