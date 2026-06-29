-- OIDC account keying on the immutable (iss, sub) pair (review H1 follow-up; ADR 0020, RFC 9700).
--
-- The callback used to find-or-create the account by the ID-token `email` claim. Even with
-- `email_verified` now required (shipped in PR #46), email is a re-assignable, broker-fronted
-- attribute: keying identity on it is the "login with unverified/aliased email" account-takeover the
-- OIDC Security BCP (RFC 9700) warns against. The fix is to key on the IdP's immutable subject — the
-- `(iss, sub)` pair — and demote email to a stored attribute.
--
-- This migration adds the identity columns and re-shapes uniqueness:
--   * oidc_iss / oidc_sub: the issuer + subject of an OIDC-linked account (both NULL for a
--     password-only user; CHECK keeps them set-together so a half-populated identity is impossible).
--   * the global email UNIQUE is replaced by a PARTIAL unique index that bites only for password
--     users — so the dev password-login email lookup stays single-row, while two distinct IdP
--     subjects may legitimately assert the same email without colliding.
--   * a partial unique index on (oidc_iss, oidc_sub) makes one IdP identity map to exactly one row.
-- Greenfield: app_user holds no production rows, so every constraint validates instantly and locks
-- nothing.

-- migrate:up

ALTER TABLE app_user ADD COLUMN oidc_iss text;
ALTER TABLE app_user ADD COLUMN oidc_sub text;

-- An OIDC identity is all-or-nothing: either both parts are present (an IdP-linked account) or both
-- are NULL (a password-only account). Never a dangling half. Add NOT VALID then VALIDATE (squawk's
-- safe pattern) so an existing table is never scanned under lock; greenfield here, so it is instant.
ALTER TABLE app_user
  ADD CONSTRAINT app_user_oidc_pair_check CHECK ((oidc_iss IS NULL) = (oidc_sub IS NULL)) NOT VALID;
ALTER TABLE app_user VALIDATE CONSTRAINT app_user_oidc_pair_check;

-- Email is no longer the identity key, so the global UNIQUE is wrong: two different IdP subjects may
-- carry the same email. Keep email unique ONLY for password users (where it IS the login key), via a
-- partial unique index. Drop the old all-rows constraint first.
ALTER TABLE app_user DROP CONSTRAINT app_user_email_key;
CREATE UNIQUE INDEX app_user_email_pw_uniq ON app_user (email) WHERE password_hash IS NOT NULL;

-- The immutable identity key: one account per (issuer, subject). Partial so the many password-only
-- rows (both NULL) are unconstrained.
CREATE UNIQUE INDEX app_user_oidc_identity_uniq
  ON app_user (oidc_iss, oidc_sub) WHERE oidc_iss IS NOT NULL;

-- migrate:down

DROP INDEX IF EXISTS app_user_oidc_identity_uniq;
DROP INDEX IF EXISTS app_user_email_pw_uniq;
ALTER TABLE app_user ADD CONSTRAINT app_user_email_key UNIQUE (email);
ALTER TABLE app_user DROP CONSTRAINT IF EXISTS app_user_oidc_pair_check;
ALTER TABLE app_user DROP COLUMN IF EXISTS oidc_sub;
ALTER TABLE app_user DROP COLUMN IF EXISTS oidc_iss;
