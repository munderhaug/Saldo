# Capture — Cloudflare R2 object lifecycle rules + bucket locks (retention/WORM)

> Raw reference capture grounding Saldo's document-retention procedure (ops-dr-runbook, ADR 0038; R2
> for document storage, ADR 0015). Cited by `docs/runbooks/disaster-recovery.md`. Captured
> **2026-06-25**. **verify-by: 2026-12-31.**
>
> Per the source-grounding discipline (`.claude/rules/engineering-discipline.md`), the retention
> commands + the lock-vs-lifecycle precedence below are grounded in this committed copy rather than
> inferred from memory. R2 is not wired into this environment (no live bucket), so the exact flags
> still need confirmation against a real bucket before go-live.

## 1. Two distinct mechanisms

R2 has **two** object-management mechanisms that the retention procedure combines:

- **Lifecycle rules** — automated *deletion* and storage transitions. They can expire (delete) objects
  after a duration or on a date, transition Standard → Infrequent Access, and abort incomplete
  multipart uploads. This is a *cost/cleanup* tool — it removes data.
- **Bucket locks** — *retention* / write-once-read-many (WORM). They **prevent deletion and overwrite**
  of objects (whole bucket or by prefix) for a duration, until a date, or indefinitely. This is the
  *compliance* tool — it protects data. (Shipped 2025-03-06.)

## 2. The precedence rule (the crux for statutory retention)

**Bucket locks take precedence over lifecycle rules.** If a lifecycle rule would delete an object at 30
days but a lock requires 90 days, the object is **not** deleted until the 90-day requirement is met.
When multiple lock rules cover the same object, **the strictest (longest) retention wins**. A bucket
**cannot be emptied** while any lock rules are configured (all rules must be removed first).

This is exactly the reconciliation Saldo needs: a lock enforcing the **5-year statutory hold** overrides
any lifecycle expiration, so accounting documents under statutory retention cannot be deleted early —
by Saldo, by an operator error, or by a malicious actor — even if a lifecycle rule names them.

## 3. Bucket locks — wrangler

```bash
# Retain ALL objects in a bucket for at least 180 days
npx wrangler r2 bucket lock add <bucket> --name 180-days-all --retention-days 180

# Retain a prefix indefinitely (until the lock is explicitly removed)
npx wrangler r2 bucket lock add <bucket> --name indefinite-logs --prefix logs/ --retention-indefinite

# (Also supported: retain until a fixed date, e.g. 2030-01-01.)
npx wrangler r2 bucket lock list <bucket>
npx wrangler r2 bucket lock remove <bucket> --id <RULE_ID>
npx wrangler r2 bucket lock set <bucket> --file <FILE_PATH>   # multiple rules via JSON
```

A bucket can hold up to **1,000** lock rules; each names the objects it covers (by prefix) and the
retention requirement.

## 4. Lifecycle rules — wrangler / S3 API

```bash
npx wrangler r2 bucket lifecycle add <bucket> [OPTIONS]       # e.g. expire after N days, transition class
npx wrangler r2 bucket lifecycle set <bucket> --file <FILE>   # full config via JSON
npx wrangler r2 bucket lifecycle list <bucket>
npx wrangler r2 bucket lifecycle remove <bucket> --id <RULE_ID>
```

S3-compatible API: `putBucketLifecycleConfiguration()` / `getBucketLifecycleConfiguration()`.

Behaviour notes: removals occur within ~24 h; when a transition and an expiration fall within the same
24 h window, the expiration takes precedence; transitioning storage classes is billed as a Class A
operation.

## Sources

- Cloudflare — *R2 bucket locks*: https://developers.cloudflare.com/r2/buckets/bucket-locks/ — captured 2026-06-25.
- Cloudflare — *R2 object lifecycles*: https://developers.cloudflare.com/r2/buckets/object-lifecycles/ — captured 2026-06-25.
- Cloudflare changelog — *Set retention policies for your R2 bucket with bucket locks* (2025-03-06): https://developers.cloudflare.com/changelog/post/2025-03-06-r2-bucket-locks/ — captured 2026-06-25.

verify-by: 2026-12-31
