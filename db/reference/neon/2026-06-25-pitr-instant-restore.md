# Capture — Neon instant restore (point-in-time restore) + history retention

> Raw reference capture grounding Saldo's disaster-recovery procedure (ops-dr-runbook, ADR 0038;
> hosted Postgres on Neon EU, ADR 0013). Cited by `docs/runbooks/disaster-recovery.md`. Captured
> **2026-06-25**. **verify-by: 2026-12-31.**
>
> Per the source-grounding discipline (`.claude/rules/engineering-discipline.md`), the DR runbook's
> Neon retention windows + restore commands are grounded in this committed, dated copy rather than
> inferred from memory; the live values still need confirmation on the actual Neon project (the
> control plane is not wired into this environment — `docs/STATUS.md`).

## 1. What instant restore is

Neon **instant restore** (point-in-time restore, PITR) reverts a **root branch** to an earlier state,
addressed by an **RFC 3339 timestamp** or an **LSN** (Log Sequence Number), within the project's
**history retention window**. It is the backup mechanism for the ledger: Neon continuously retains the
change history, so there is no separate backup job to run — recovery is "roll the branch back to any
point in time that still falls within the history window."

## 2. History retention window (the recoverable horizon)

Configured in the Neon console under **Settings → Instant restore**. Defaults and maximums by plan:

| Plan   | Default history window | Maximum |
|--------|------------------------|---------|
| Free   | 6 hours                | (limited) |
| Launch | 1 day                  | 7 days  |
| Scale  | 1 day                  | 30 days |

A longer window widens the recoverable horizon but increases storage cost. **This is the RPO ceiling:**
data older than the window cannot be recovered by PITR alone. Setting this window IS the backup policy.

## 3. Restore mechanics — in-place, with an automatic backup branch

Restoring to a point in time is an **in-place** operation that **preserves the pre-restore state** in an
automatically-created backup branch. Internally Neon: (1) creates a point-in-time branch at the chosen
timestamp/LSN, (2) moves the compute onto it, (3) renames it to the original branch name, and (4)
renames the original branch to a backup named `{branch_name}_old_{head_timestamp}` (override the name
with `--preserve-under-name`).

Constraints: only **root branches**; applies to **all databases on the target branch** at once; child
branches and snapshot-restored branches cannot be PITR-restored.

## 4. CLI (`neon branches restore`)

```bash
# General form
neon branches restore <target id|name> <source id|name @ timestamp|lsn>

# Restore a branch to its OWN history at a timestamp, keeping the pre-restore state as a named backup
neon branches restore development ^self@2024-01-01T00:00:00Z --preserve-under-name development_old

# Restore a branch to the LATEST data of its parent
neon branches restore development ^parent

# Restore from another branch's history at an LSN
neon branches restore development production@0/12345
```

## 5. API

```
POST /projects/{project_id}/branches/{branch_id_to_restore}/restore
```

```bash
# Restore to own history at a timestamp, preserving a backup branch
curl --request POST \
  --url https://console.neon.tech/api/v2/projects/{project_id}/branches/{branch_id}/restore \
  --header "Authorization: Bearer $NEON_API_KEY" \
  --data '{
    "source_branch_id": "{branch_id}",
    "source_timestamp": "2024-02-27T00:00:00Z",
    "preserve_under_name": "backup-before-restore"
  }'
```

## 6. Drill note — verifying a restore (the point of the runbook)

A restore that has not been verified is not a backup. After a restore (or, for a non-destructive drill,
after creating a **read-only restore branch** at a past timestamp for analysis), run
`db/dr/verify-restore.sql` against the restored branch to confirm the integrity layer (triggers, FORCE
RLS, the gapless invoice-counter function) and the ledger data survived. The local mechanical rehearsal
of the dump→restore→verify chain is `tools/restore-drill.sh`.

## Sources

- Neon — *Point-in-time restore (overview)*: https://neon.com/docs/introduction/point-in-time-restore — captured 2026-06-25.
- Neon — *Branch restore / instant restore (guide)*: https://neon.com/docs/guides/branch-restore — captured 2026-06-25.

verify-by: 2026-12-31
