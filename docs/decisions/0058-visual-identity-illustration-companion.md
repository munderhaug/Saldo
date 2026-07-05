# ADR 0058 — Visual identity: the "papirklipp" illustration grammar + the round companion (working name Øre)

- **Status:** Accepted
- **Date:** 2026-07-05

## Context
ADR 0025 fixed the *direction and the in/out line* for a playful, guided experience — a friendly
companion and a distinctive-but-legible visual identity — and explicitly left the concrete character
and illustration design to a spike. The two token layers it depends on have since landed: the carnival
OKLCH scales (ADR 0025, `app.css`) and the Fraunces/IBM Plex Sans type system (ADR 0026). The
`design-visual-spike` task closes the gap: choose an illustration style and the companion's look, on
those tokens, without violating the design rules (no gradients, tokens only, money always neutral ink
on cold white, §5.5 sobriety) or the generic-AI-look ban. The exploration and visual reference is the
committed spike artifact: [`docs/design/visual-identity-spike.html`](../design/visual-identity-spike.html).

## Decision
1. **Illustration style: the flat "papirklipp" (cut-paper) grammar.** Illustrations are composed from
   a fixed shape vocabulary — circles, half-/quarter-circles, rounded bars, soft triangles, a zigzag —
   as layered **flat** fills: no outlines, no gradients, no shadows, no photo-realism. Fine detail
   (faces, receipt lines) is drawn as **neutral-12 "ink" micro-details** borrowed from the ink-line
   direction, so small sizes stay crisp. The discipline of the fixed vocabulary is what keeps the style
   ownable rather than generic-geometric.
2. **Colour recipe, tokens only** (never raw values, enforced by the existing saldo ESLint rules):
   large fields = the soft register **sky/lilac/mint steps 4–6**; focal accents = the brand solids
   **electric/grape/candy step 9**, at most two per scene (candy-9 is never a text surface — its
   lightness fails AA with white); ink = **neutral-12**; documents/props are paper-white/neutral-1.
   The semantic state hues (**green/red/amber**) are never used decoratively — an illustration must not
   fake a paid/overdue/heads-up signal.
3. **Placement:** illustration lives in empty states, onboarding, tap-to-explain explainers, and the
   earned peak moments — **never inside money/table surfaces** (figures stay neutral-12 on cold white)
   and **never at the §5.5 consequential moments**, where the absence of all playfulness *is* the
   sobriety signal.
4. **The companion: a round "balance ball", working name Øre.** Saldo means balance; the companion is
   the simplest thing that balances — a circle, body **electric-9**, features paper-white. The name
   plays on øre the smallest coin (and the domain money type `Øre`) and *øre* the ear — it listens to
   "what happened" (speak events, not entries). Its size ladder degrades honestly: 96/64 px full
   expression → 32/20 px eyes only → **12 px = the plain ambient status dot** (the companion at rest
   *is* the "you're caught up" signal). The expression set is attentive · pleased · thinking ·
   curious-uncertain (the system owning its own doubt) · resting · absent (§5.5) — there is deliberately
   **no angry, disappointed, or alarmed variant**: the system owns all fault (prime directive, ADR 0025).
   The companion is dismissible, never blocks a flow, never nags or counts; when it speaks LLM-generated
   text the utterance is AI-labelled with logged provenance (ADR 0022/0036); it never scores or profiles
   a person (Annex III §5(b)).
5. **The Torpedo is a sibling character in the same grammar** — a grape-9 dart with the same white ink
   eye, sharper silhouette, always pointing outward (at the late payer, never at the user), shown only
   in the late-payment flow under propose→confirm (ADR 0025 §6).
6. **Gate before final commitment:** the character's *surface* (name, face) is validated with real
   users before it is considered final, per ADR 0025's accepted risk — tracked as the
   `companion-user-validation` backlog task. The grammar, colour recipe, placement rules, and behaviour
   rules above stand regardless of that outcome; they are what future UI work builds against now.
   Assets are built per feature as surfaces land, never speculatively.

## Consequences
- `.claude/rules/design-system.md` gains an illustration/companion section distilling rules 1–5, so
  every UI session inherits them mechanically alongside the token/type rules.
- The spike artifact is committed at `docs/design/visual-identity-spike.html` as the visual reference
  (self-contained, uses the real token values, light/dark) — the ADR is the record of the *decision*,
  the artifact of the *look*.
- `design-visual-spike` is done; `companion-user-validation` is added to the backlog as the explicit
  user-validation gate.
- Accepted cost: a fixed shape grammar constrains illustrators (that constraint is the brand); the
  companion-as-status-dot degradation must be watched in validation for "why does the dot have eyes
  sometimes" confusion (an open question in the spike).

## Alternatives considered
- **Ink-line ("blekk + én farge") as the primary style.** Warm and editorial, but line weight is hard
  to keep consistent across contributors/generators and dies below ~24 px. Rejected as primary; its
  neutral-12 ink detailing is deliberately kept inside the papirklipp grammar.
- **Quiet single-colour glyphs as the identity.** Safe and cheap, but it is exactly the interchangeable
  fintech look — it fails ADR 0025's "untraditional" brief and cannot carry a companion. Retained only
  as the plain icon register (the icon set), not as illustration.
- **A coin-stack character.** Reads as finance clip-art, and "money with a face" risks making the
  trust-critical money surfaces feel flippant. Rejected.
- **An animal mascot (bird).** Warm but sits squarely in the Duolingo engagement-mascot genre ADR 0025
  rejects, drags species/gender expectations, and is more complex flat at small sizes. Rejected for now;
  revisit only if user validation sinks the abstract character.
