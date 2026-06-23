# ADR 0025 — A guided, playful experience: a friendly companion + characterful agents (revising the no-mascot line)

- **Status:** Accepted
- **Date:** 2026-06-23

## Context
Saldo's spine is **playful, simple, safe** (`docs/experience-principles.md`). The committed principles
deliberately banned **mascots / avatars / characters** (§2.2, §8, §9, §10) out of a specific fear: that
game-like mechanics would make legally serious work feel unserious, or manufacture engagement for a user
who should be left alone.

Product-owner direction (this ADR) sharpens the goal: the experience should be **untraditional** for
accounting software — low-hassle, fun, and above all **understandable and doable by anyone regardless of
financial literacy**, under an ironclad prime directive that **no user ever feels stupid**. Everyone can
do the jobs-to-be-done and trust the result is lawful — *that trust is the system's main job*. To get
there, a **friendly guide/companion**, **trade-specific analogies**, and **characterful agents** (a
"Torpedo" that chases late payments) are wanted.

This both *extends* the spine (more personality, an embodiment) and *conflicts* with the specific
no-mascot anti-pattern. The conflict must be resolved deliberately and recorded, because
`.claude/rules/experience-voice.md` and design-lint enforce the old line on every UI PR. The key
realisation that resolves it: the original ban targeted **gamification** (points/streaks/engagement
loops), not **warmth or guidance**. A comprehension guide is the *opposite* of an engagement mechanic —
it is the existing warm "I" given a face.

## Decision
1. **Prime directive, above every other rule: no user ever feels stupid** — whatever their education or
   financial literacy. This becomes the headline of the Feeling Test (§9). The fault and the doubt always
   sit with the software, never the person.
2. **Adopt a friendly guide/companion as a first-class part of the experience** — an embodiment of the
   warm "I". Its job is **comprehension and confidence**: it explains in the user's own world, does jobs
   for them, and makes the product approachable. It is **not** a gamification device, it is dismissible,
   and it never blocks the competent user who just wants to get the job done (progressive disclosure,
   §4.5, still holds).
3. **The line — warmth/guidance/delight YES, engagement mechanics NO.**
   - **In:** a friendly guide/character with personality; characterful agents that *do a job* (the
     Torpedo); trade-specific analogies; tactile delight; illustration/embodiment; a distinctive visual
     identity.
   - **Out (still rejected):** points, badges, XP, levels, streaks, leaderboards, public/competitive
     ranking, manufactured urgency, engagement-driving notifications, and confetti on routine actions.
     The companion must never become a Duolingo-style engagement loop — the user does serious work in
     short, infrequent sessions, and **"earn irrelevance"** (§7.1) still governs success.
4. **The §5.5 sobriety rule is unchanged and sacrosanct.** The companion and all playfulness step back at
   the three consequential moments — **money leaving, filing to the authorities, a genuine ambiguity**.
   That boundary is exactly what licenses being bolder everywhere else.
5. **The companion never gains authority it shouldn't have.** It proposes and explains; the rules engine
   validates; the human confirms consequential actions (ADR 0002). It never writes the ledger. If the
   companion or an agent uses an LLM to generate an explanation or draft text, that output is an **AI
   system** under the EU AI Act — disclosed and labelled **AI-assisted** with logged provenance (ADR
   0022). It must never score or profile the user (Annex III §5(b)).
6. **The "Torpedo" agent** — a characterful late-payment helper aimed **outward** at the late-paying
   customer and **wielded by the user via propose→confirm**. It maps onto committed scope (§8.4: purring →
   forsinkelsesrenter → structured inkasso hand-off; *full in-app debt collection stays out of scope*,
   spec §2). The fun is in the user *deploying* it; the messages it actually sends stay professional and
   within **god inkassoskikk**. The user is never the one who feels chased.
7. **Trade-specific analogies** — financial concepts are explained in terms drawn from the user's line of
   work (extending §4.3 "categories in the user's world"). Formal terms remain tap-to-explain in the
   user's own numbers, offered on demand, never pushed.
8. **Visual identity: distinctive but legible** — an ownable, characterful design system with tactile,
   playful delight, layered on a legible, **tabular-numeral, WCAG-2.2-AA** substrate so money always reads
   as trustworthy. The generic-AI look and decorative gradients remain banned (`design-system.md`);
   distinctiveness is intentional, never at the cost of the "this is correct" signal.

## Consequences
- `docs/experience-principles.md` (§1, §2.2, §5, §8, §9, §10, §11) and `.claude/rules/experience-voice.md`
  are updated to this line: the blanket "no mascots/avatars" becomes "no **gamification** mechanics," with
  the friendly companion explicitly allowed under the rules above, and "no user ever feels stupid" raised
  to the prime directive.
- Every future UI surface inherits the companion + trade-analogy + distinctive-visual treatment; the
  **§5.5 sobriety** and **never-feel-stupid** tests gate each one.
- New backlog work (built per feature, never speculatively): a companion/guide system, the Torpedo agent,
  a trade-analogy comprehension layer, and a visual-identity spike.
- The detailed character + visual design is **left to a spike** — this ADR fixes the *direction and the
  in/out line*, not the specific character.
- **Risk accepted:** a character on serious financial work can misfire into condescension or anxiety.
  Mitigated by the prime directive, the §5.5 stop rule, dismissibility, and "earn irrelevance" — and
  validated with real users before committing to a specific companion.

## Alternatives considered
- **Keep the no-mascot ban; personality in voice + motion only.** Rejected — it does not reach
  "understandable and doable by anyone"; the embodiment is what makes the product approachable for the
  financially unconfident, which is the whole point.
- **Full Duolingo-style gamification (streaks, points, levels).** Rejected — it manufactures engagement
  and unseriousness for people doing short, high-stakes sessions; it contradicts "earn irrelevance"
  (§7.1) and the Feeling Test. Logged as `R-0009` in `rejected.md`.
- **A bold retro/gaming visual skin as the core look.** Rejected for now — risks undercutting "feel safe
  it's lawful"; chose distinctive-but-legible. Revisit via a spike if the legible substrate is preserved.
