# db/reference/r2

Destination for committed raw captures of **Cloudflare R2** behaviour Saldo's operations depend on —
cited by `docs/runbooks/disaster-recovery.md` (ADR 0038; R2 document storage, ADR 0015). Captures land
here dated, with a `verify-by`, so the document-retention procedure (lifecycle rules, bucket-lock WORM,
the lock-over-lifecycle precedence) is grounded in a committed source rather than memory. Re-capture via
the `regulatory-update` skill when a `verify-by` date passes or a live R2 bucket is available to confirm.
