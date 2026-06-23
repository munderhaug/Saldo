# CLAUDE.md

@AGENTS.md

**Canonical guidance lives in [`AGENTS.md`](AGENTS.md)** (imported above) — architecture, the hard
invariants, setup/build/test commands, the quality bar, conventions, the harness model, and the
canonical-source map. Read it first. This file adds only Claude-Code-specific notes; keep the shared
guidance in `AGENTS.md` so there is a single source of truth.

## Compaction policy
Preserve: the hard invariants, schema/migration decisions, and the list of modified files. Summarize
exploration briefly. Drop resolved tool output.
