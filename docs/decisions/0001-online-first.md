# ADR 0001 — Online-first, not offline-first

- **Status:** Accepted
- **Date:** 2026-06-22

## Context
A financial system of record needs an authoritative source of truth. Offline-edited ledger postings
create reconciliation conflicts that are unacceptable for compliance data.

## Decision
The server is the single source of truth. The ledger is online-only. Receipt *capture* may queue
offline (it's a photo upload) via a Dexie/IndexedDB outbox; postings always happen online.

## Consequences
- Simpler correctness; no CRDT/merge problems on financial data.
- The mobile PWA must degrade gracefully when offline (capture works, posting waits).

## Alternatives considered
Offline-first with sync — rejected: conflict resolution on immutable financial records is a trap.
