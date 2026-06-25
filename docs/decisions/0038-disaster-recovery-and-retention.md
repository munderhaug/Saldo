# ADR 0038 — Disaster recovery + document retention: Neon PITR, a tested restore drill, R2 WORM lock

- **Status:** Accepted
- **Date:** 2026-06-25

## Context

Saldo is a decade-horizon **system of record** for Norwegian accounting. Two operational guarantees
have been asserted across the architecture but never made concrete or testable:

1. **Recoverability.** ADR 0013 says Neon gives "managed backups / PITR" — but a backup that has never
   been restored is not a backup. There was no stated RPO/RTO, no restore procedure, and nothing that
   proves a restored database still carries the integrity layer the ledger depends on (the append-only
   triggers, FORCE RLS, the gapless invoice counter — ADR 0012/0007).
2. **Document retention vs. immutability.** `.claude/rules/data-handling.md` states the core tension:
   posted vouchers and issued invoices are **immutable**, statutory retention is **5 years**, and GDPR
   erasure cannot touch held data. Documents live in **R2** (ADR 0015) — but no procedure pinned down
   how R2 enforces the 5-year hold while still permitting lifecycle cleanup of non-held data.

This environment cannot exercise the live controls: the Neon control plane is not wired here and there
is no live R2 bucket (`docs/STATUS.md`). So the decision is documented and the *mechanics* are tested
against a local Postgres, with the live-only steps explicitly flagged for verification.

## Decision

**1. Recovery targets.** Adopt **RPO ≤ 1 day** and **RTO ≤ 1 hour** as the initial targets, met by
Neon's instant restore (PITR). The Neon **history-retention window IS the backup policy** — set it to
the plan maximum in use (7 days on Launch, 30 on Scale); the window length is the RPO ceiling.

**2. A restore is only a backup once verified.** Recovery is a two-step contract: *restore*, then
*verify*. The verification is `db/dr/verify-restore.sql` — a read-only assertion (safe on a restored
production branch) that the integrity layer and ledger data survived: required tables, the six integrity
triggers, FORCE RLS + a policy on every tenant table, the `allocate_invoice_number` counter function
(and **no** invoice SEQUENCE), the `saldo_app` role, and a data sweep that every posted voucher
balances. `tools/restore-drill.sh` is the mechanical rehearsal — build → seed a canary → `pg_dump` →
restore into a scratch DB → run the verifier → prove the append-only trigger still **bites** — runnable
locally now and the template for the live Neon drill. The drill is a **scheduled operational ritual**
(quarterly), documented in `docs/runbooks/disaster-recovery.md`.

**3. R2 retention is a bucket lock, not a hope.** The 5-year statutory hold on accounting documents is
enforced by an **R2 bucket lock** (write-once-read-many) with a retention ≥ 5 years on the
document prefix. Bucket locks **take precedence over lifecycle rules** (the strictest/longest retention
wins; a locked object cannot be deleted or overwritten, and a bucket cannot be emptied while locks
exist) — so a lifecycle rule may safely clean up *non-held* objects (drafts, transient uploads,
incomplete multipart uploads) without any risk of expiring a held voucher document early. This is the
storage-layer twin of the ledger's append-only triggers: immutability enforced by the platform, not by
application discipline.

**4. Retention vs. erasure stays reconciled.** A GDPR erasure request cannot delete data under the
5-year hold (lawful basis: legal obligation); erasure/anonymisation applies only to non-held data, and
the lock makes the held/non-held boundary mechanical rather than advisory **once the document-write
paths place held vs. non-held objects under the locked vs. lifecycle prefixes** (those paths are later
work — `docs/STATUS.md`). Consistent with `.claude/rules/data-handling.md`, no change to that rule.

## Consequences

- A concrete, **tested** recovery path: the dump→restore→verify chain is proven locally and CI-guarded
  (`apps/web/test/integrity/restore-verify.integration.test.ts` keeps the verifier from drifting from
  `db/migrations`). The verifier doubles as the post-restore health check for the live Neon drill.
- The integrity layer is confirmed **portable through a logical restore** — it lives in SQL (ADR 0011),
  so a `pg_dump`/`pg_restore` (and, by the same token, a Neon branch restore) round-trips it intact.
- Statutory retention becomes a platform guarantee (R2 lock) rather than an application convention; the
  cost is that locked objects genuinely cannot be deleted before their retention elapses (the point).
- **Live-only, flagged for verification** (cannot be exercised in this environment): set the Neon
  history window on the real project; run the first restore drill against Neon; create the R2 bucket
  lock on the real bucket; confirm the EU region/DPA. Tracked in the runbook's "needs live verification".

## Alternatives considered

- **Trust Neon's managed backups without a drill** — rejected; an unverified restore is the exact
  failure mode this ADR exists to close.
- **Application-enforced document retention** (a "do not delete" flag checked in code) — rejected;
  it repeats the mistake the ledger's SQL triggers avoid (integrity by discipline, not by the platform).
  A bucket lock cannot be bypassed by an application bug or a compromised app credential.
- **Self-managed `pg_dump` backups to R2 as the primary mechanism** — rejected as primary (higher ops,
  worse RPO than continuous PITR); retained as an optional belt-and-braces export, and it is exactly
  what `tools/restore-drill.sh` exercises, so the capability stays warm.
