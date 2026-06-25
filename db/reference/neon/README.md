# db/reference/neon

Destination for committed raw captures of **Neon** behaviour Saldo's operations depend on — cited by
`docs/runbooks/disaster-recovery.md` (ADR 0038) and `docs/runbooks/neon-provisioning.md` (ADR 0013).
Captures land here dated, with a `verify-by`, so the DR procedure (PITR history windows, restore
commands) is grounded in a committed source rather than memory. Re-capture via the `regulatory-update`
skill when a `verify-by` date passes or the Neon control plane is wired live for confirmation.
