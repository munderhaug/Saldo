-- Identity & sessions (ADR 0020). The missing FIRST lock: RLS (ADR 0012) is a strong second lock, but
-- nothing authenticated a user or linked them to an org. Three tables:
--   app_user      — a person (email + optional argon2id hash; null hash = OIDC-only).
--   user_session  — server-side sessions, Lucia pattern: the cookie holds an opaque 32-byte token; we
--                   store ONLY its SHA-256 (so a DB leak doesn't yield usable session tokens).
--   membership    — the user -> org authz link (which orgs a user may act for, and as what role).
--
-- These are AUTH/system tables, NOT tenant tables: they are looked up BEFORE any org context exists
-- (by token hash / user id), so they are deliberately NOT org-RLS'd — there is no app.current_org yet,
-- and the session token hash is itself the unguessable key. They are protected by (a) only saldo_app
-- holding the needed DML, and (b) always being queried by their secret key. The RLS-coverage test
-- carries them on an explicit allowlist so a *future* table that is neither tenant-RLS'd nor on the
-- allowlist still fails CI.

-- migrate:up

CREATE TABLE app_user (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE CHECK (email = lower(email) AND email <> ''),
  -- argon2id PHC string; NULL for an OIDC-only user (matched by verified email at login).
  password_hash text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_session (
  -- The session id IS the SHA-256 (hex) of the opaque cookie token — never the token itself.
  id          text PRIMARY KEY CHECK (id ~ '^[0-9a-f]{64}$'),
  user_id     uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);
CREATE INDEX user_session_user_idx ON user_session (user_id);
CREATE INDEX user_session_expires_idx ON user_session (expires_at);

CREATE TABLE membership (
  user_id         uuid NOT NULL REFERENCES app_user(id)     ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  role            text NOT NULL CHECK (role IN ('owner','member')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, organization_id)
);
CREATE INDEX membership_org_idx ON membership (organization_id);

-- Least-privilege grants for the app role. No RLS (see header): these are queried by secret key
-- before any tenant context exists. The app role connects and reads/writes them directly.
GRANT SELECT, INSERT, UPDATE         ON app_user     TO saldo_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_session TO saldo_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON membership   TO saldo_app;

-- migrate:down

DROP TABLE IF EXISTS membership;
DROP TABLE IF EXISTS user_session;
DROP TABLE IF EXISTS app_user;
