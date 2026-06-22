# Engineering discipline (always on)

Distilled from Karpathy's agentic-engineering principles. These apply to every change — they are the
behavioral half of `docs/quality-bar.md`.

- **Think before coding.** State your assumptions; if a request is ambiguous, present the interpretations
  and pick one (or ask) — don't guess silently. Push back on an approach that's wrong or over-broad.
- **Simplicity first.** Write the minimum that solves the stated problem. No speculative features, no
  single-use abstractions, no error handling for cases that can't occur. If 200 lines could be 50, write 50.
- **Surgical changes.** Touch only what the task requires. No drive-by refactoring; match the surrounding
  style. Every changed line should trace to the requirement.
- **Goal-driven.** Turn the task into verifiable success criteria (a test, a check, an observable outcome)
  and loop until they pass. "It runs" is not "it's correct."
- **Source-grounded, not memory-grounded.** For anything regulatory, financial, or API-shaped, work from
  committed primary sources (SAF-T lists, `db/reference/`, cited docs) — never from model memory.

When these conflict with speed, these win. We are building a world-class system of record, not an MVP.
