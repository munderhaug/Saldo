# Runbook — disaster recovery + document retention

> "A restore you have never tested is not a backup."

How to recover the Saldo system of record after data loss, and how document retention is enforced
without violating ledger immutability. Decision + rationale: **ADR 0038** (DR + retention); the database
is **Neon EU** (ADR 0013), documents live in **Cloudflare R2** (ADR 0015), and the integrity layer is
**SQL** (ADR 0011/0012). Source-grounded captures: `db/reference/neon/` and `db/reference/r2/`.

> ⚠️ **Live controls are not wired into the agent environment.** The Neon control plane and a live R2
> bucket are absent here (`docs/STATUS.md`). The procedures below are documented and the *restore
> mechanics* are tested against a local Postgres (`tools/restore-drill.sh`); the live-only steps are
> collected under [Needs live verification](#needs-live-verification).

## Recovery objectives

| Objective | Target | Mechanism |
|---|---|---|
| **RPO** (max data loss) | ≤ 1 day | Neon instant restore (PITR); the history window is the ceiling |
| **RTO** (max downtime) | ≤ 1 hour | In-place PITR (no dump/reload); app re-points at the restored branch |
| **Document durability** | 5-year statutory hold | R2 bucket lock (WORM) over the document prefix |

The Neon **history-retention window IS the backup policy** — there is no separate backup job. Set it to
the plan maximum in use (Launch 7 days / Scale 30 days) under **Settings → Instant restore** in the Neon
console. Anything older than the window is unrecoverable by PITR alone — hence the optional logical-dump
belt-and-braces in [§4](#4-belt-and-braces-logical-dumps-optional).

## 1. Database recovery — Neon point-in-time restore (PITR)

Neon **instant restore** reverts a **root branch** to an earlier state, addressed by an RFC 3339
timestamp or an LSN, within the history window. It is **in-place** and **preserves the pre-restore
state** in an automatically-created backup branch (`{branch}_old_{timestamp}`, or a chosen name via
`--preserve-under-name`) — so a mistaken restore is itself reversible. Grounded in
`db/reference/neon/2026-06-25-pitr-instant-restore.md`.

### Restore procedure (production incident)

1. **Stop the bleed.** Pause the app (scale to zero / maintenance mode) so no further writes land on the
   branch about to be restored.
2. **Pick the target time.** The last-known-good instant — just before the corrupting deploy, bad
   migration, or accidental bulk write.
3. **Restore the branch** (CLI shown; the API is in the capture):
   ```bash
   neon branches restore production '^self@2026-06-25T08:00:00Z' \
     --preserve-under-name production_pre_restore
   ```
4. **Verify before reopening** — run the post-restore assertion ([§3](#3-verify-a-restore-the-contract))
   against the restored branch. Do **not** reopen the app until it passes.
5. **Reconnect + resume.** Confirm the app's `saldo_app` connection string still targets the restored
   branch (the name is unchanged after an in-place restore); resume traffic.
6. **Record** the incident, the target timestamp, the data-loss interval, and the verifier output.

Constraints (from the capture): PITR applies to **root branches** and to **all databases** on the
branch at once; child branches and snapshot-restored branches cannot be PITR-restored.

### Non-destructive drill against production data

To rehearse without touching the live branch, restore into a **separate restore branch** at a past
timestamp and run the verifier there:
```bash
neon branches restore drill-restore production@2026-06-25T08:00:00Z   # a throwaway target branch
psql "$DRILL_BRANCH_URL" -v ON_ERROR_STOP=1 -v expect_data=1 -f db/dr/verify-restore.sql
```

## 2. The restore drill — `tools/restore-drill.sh`

The local, self-contained rehearsal of the **whole** chain on any Postgres cluster — the thing that
makes the live procedure trustworthy before it is ever needed for real:

```bash
pnpm dr:drill                                            # uses the local dev cluster
ADMIN_URL='postgresql://root:rootpw@localhost:5432/postgres' pnpm dr:drill
```

It builds a source DB from `db/migrations`, seeds a canary (an org + a **posted, balanced** voucher + an
allocated gapless invoice number), `pg_dump`s it, restores the dump into a fresh scratch DB, runs the
verifier with `expect_data=1`, and then proves the **append-only trigger still bites** by attempting to
mutate a posted voucher (which must be rejected). It cleans up both scratch databases and exits non-zero
on any failure. This rehearses the dump/restore path that a Neon branch restore takes through the same
SQL integrity layer.

## 3. Verify a restore — the contract

`db/dr/verify-restore.sql` is the single source of "is this restore healthy?". It is **read-only** (safe
on a restored production branch) and raises a single exception listing every failure, so it exits
non-zero iff the restore is unhealthy:

```bash
psql "$RESTORED_URL" -v ON_ERROR_STOP=1 -f db/dr/verify-restore.sql                  # structural + data sweep
psql "$RESTORED_URL" -v ON_ERROR_STOP=1 -v expect_data=1 -f db/dr/verify-restore.sql # also require non-empty
```

It asserts the integrity layer survived the restore: required tables; every required integrity
trigger (the explicit `required_triggers` list in `db/dr/verify-restore.sql` is the source of truth —
append-only incl. the posting INSERT guard, balance, period-lock, posted-completeness, document
immutability); FORCE RLS + a policy on every tenant table;
the `allocate_invoice_number` counter function **and the absence of any invoice SEQUENCE** (gaplessness
is a counter row, never a sequence — ADR 0007); the `saldo_app` role; and a data sweep that every posted
voucher balances. The behavioural cross-tenant RLS proof is the committed `rls-tenancy` suite, pointed
at the restored branch (`SALDO_TEST_PG_URI=<restored-branch-url>`).

The verifier is kept honest by `apps/web/test/integrity/restore-verify.integration.test.ts`, which runs
it against a freshly-migrated schema in CI so it cannot drift from `db/migrations`.

## 4. Belt-and-braces logical dumps (optional)

PITR cannot recover beyond the history window. For an archival floor (and provider independence), a
periodic `pg_dump --format=custom` to the R2 document store is the same path the drill exercises:
```bash
pg_dump "$OWNER_URL" --format=custom --file="saldo-$(date +%F).dump"
# upload to R2 under a locked prefix (see §5); restore-test it with tools/restore-drill.sh's verify step
```
This is **not** the primary mechanism (worse RPO, more ops than continuous PITR) — it is an
independent, restore-tested archive.

> **Residency:** a logical dump is the full ledger including personal/financial data, so it must never
> leave the EU/EEA (`.claude/rules/data-handling.md`). Produce it only on EU-resident infrastructure
> (the EU PaaS host or an EU CI runner — never a developer laptop outside the EU) and stream it straight
> to the EU R2 bucket; do not retain the intermediate file off-region.

## 5. Document retention vs. ledger immutability — R2

Documents (receipts, generated invoice PDFs, SAF-T exports) live in R2 (ADR 0015). Norwegian statute
(bokføringsloven) requires a **5-year** retention of vouchers and documentation, counted from the end
of the financial year; posted vouchers and issued invoices are **immutable**. R2 has two mechanisms —
combined here — grounded in `db/reference/r2/2026-06-25-lifecycle-bucket-locks.md`:

> **Not yet built.** The document-write paths that would place objects under these prefixes do not
> exist yet — receipt/document storage in R2 is later work (`docs/STATUS.md`). The procedure below is
> the *intended* configuration; the held/non-held prefix split becomes a real guarantee only once the
> application actually writes held documents under `documents/` and non-held data under `tmp/`.

- **Bucket locks (WORM)** enforce retention: they prevent deletion/overwrite for a duration, until a
  date, or indefinitely, by prefix. **Locks take precedence over lifecycle rules** (the strictest/
  longest retention wins; a bucket cannot be emptied while locks exist).
- **Lifecycle rules** delete/expire and transition storage class — used only for *non-held* data.

### The retention procedure

1. **Lock the held-document prefix for ≥ 5 years** (the statutory floor). Use 6 years for headroom
   against the "5 years after the financial year-end" reading:
   ```bash
   npx wrangler r2 bucket lock add saldo-docs --name statutory-5yr --prefix documents/ --retention-days 2200
   npx wrangler r2 bucket lock list saldo-docs
   ```
   Because the lock outranks lifecycle, no lifecycle rule can expire a held voucher document early — the
   storage-layer twin of the ledger's append-only triggers.
2. **Lifecycle-expire only non-held data** — transient uploads, unposted-draft attachments, incomplete
   multipart uploads — under a *different* prefix the lock does not cover:
   ```bash
   npx wrangler r2 bucket lifecycle add saldo-docs --prefix tmp/ --expire-days 7
   ```
3. **GDPR erasure stays reconciled** (`.claude/rules/data-handling.md`): an erasure request **cannot**
   delete data under the 5-year hold (lawful basis: legal obligation); erasure/anonymisation applies
   only to non-held data. The lock makes the held/non-held boundary mechanical, not advisory — a
   compromised app credential or an application bug cannot delete a held document.

## 6. Failure-scenario quick reference

| Scenario | Action |
|---|---|
| Bad migration / corrupting deploy | PITR to just before the deploy ([§1](#1-database-recovery--neon-point-in-time-restore-pitr)); verify; resume |
| Accidental bulk delete/update | PITR to just before the write; verify; resume |
| App credential compromised, data tampered | Rotate `saldo_app` secret (`docs/runbooks/neon-provisioning.md`); PITR; verify |
| Neon project/region loss | Re-provision (`neon-provisioning.md`), restore from the latest logical dump ([§4](#4-belt-and-braces-logical-dumps-optional)), verify |
| R2 object deleted/overwritten | A held object under a bucket lock cannot be — confirm the lock; non-held loss → restore from dump archive |
| Ransomware / mass deletion attempt | Bucket locks block deletion of held documents; PITR recovers the database |

## Needs live verification

Not exercisable in this environment (no Neon control plane, no live R2 bucket — `docs/STATUS.md`):

- [ ] Set the Neon **history-retention window** to the plan maximum on the real project.
- [ ] Run the **first real restore drill** against Neon (the [§1](#non-destructive-drill-against-production-data) non-destructive path) and record RTO.
- [ ] Create the **R2 bucket lock** (`statutory-5yr`) on the real bucket and the `tmp/` lifecycle rule.
- [ ] Confirm the EU region + signed Cloudflare/Neon **DPA + SCCs** before production data lands.
- [ ] Schedule the **quarterly** restore drill (ADR 0038) as a recurring operational task.

## Sources

- `db/reference/neon/2026-06-25-pitr-instant-restore.md` — Neon instant restore + history windows (captured 2026-06-25).
- `db/reference/r2/2026-06-25-lifecycle-bucket-locks.md` — R2 lifecycle + bucket locks (captured 2026-06-25).
- `.claude/rules/data-handling.md` — residency, retention-vs-immutability, GDPR erasure exception.

verify-by: 2026-12-31
