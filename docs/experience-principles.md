# Experience & Design Principles — Saldo
### How the product feels, behaves, and speaks

This document defines the product's tone, interaction design, and the rules that govern them. It is the source of truth for how Saldo behaves and how it talks to the people who use it. When a design choice is unclear, apply the Feeling Test (§9).

> **Where this sits:** the **experiential** source of truth — tone, interaction design, and the safety-framing that govern how Saldo *feels, behaves, and speaks*. It complements `saldo-build-specification.md` (functional scope — *what* to build) and the hard invariants in `../AGENTS.md`; on feel, voice, and interaction, this document governs. The operational distillation that loads while building UI lives in `.claude/rules/experience-voice.md`.

---

## 1. The spine

**Playful, simple, safe** — in that relationship:

- **Playful** is the product's distinguishing quality — warmth and personality where other tools in this space are stiff.
- **Simple** and **safe** are what make playfulness appropriate on legally serious work. They are not competing goals; they are what license the playfulness.

The formula: **safe makes playful acceptable** — the user can be spoken to warmly because they genuinely cannot break anything — and **simple keeps playful from becoming clutter** — delight lives in how effortless the product feels, never in decoration layered onto complexity.

Confidence is playful; anxiety is stiff. The product is warm because the risk has been engineered out of it.

---

## 2. Core principles

**2.1 Calm in behavior, warm in voice.**
The product is calm and ambient in *what it does* — rare contact, runs itself, asks almost nothing of the user's attention — and playful and warm in *how it feels and speaks* when contact does happen. Calm is not cold.

**2.2 Playful means personality and delight, not games.**
Playfulness here is voice, warmth, and well-placed delight. It is not points, badges, levels, mascots, streaks, leaderboards, or manufactured urgency. The product serves people doing serious work in short, infrequent sessions; the warmth has to land in seconds and must never feel like a game.

**2.3 Simplicity and safety license the playfulness.**
Playfulness reads as unserious only when the user fears they can break something. Because mistakes are structurally impossible (§3), a relaxed tone becomes reassuring rather than risky — it signals that everything is handled.

**2.4 Playful in the ordinary, sober in the consequential.**
Warm and light in the roughly 95% of moments that are easy and low-stakes; plain, clear, and serious in the roughly 5% that carry real consequence (§5.5). A product that is playful everywhere reads as unserious. A product that is playful and visibly knows when to stop reads as confident. This contrast is mandatory.

---

## 3. Safe — the structural foundation

Safety is enforced in the data model, not promised in copy.

1. **Nothing is ever destroyed.** The ledger is append-only. Corrections are made by posting reversing entries underneath; the user only ever sees the current, correct state, presented as "Fixed it," never as a destructive edit.
2. **Nothing is filed until the user says so.** Drafts, proposals, and pre-computed figures stay fully reversible right up to the explicit moment of submission.
3. **Undo and grace windows on every consequential action.** Money-leaving and filing actions carry a built-in delay and a prominent, calm undo, so a hurried user is never one tap from an unrecoverable mistake.
4. **The system owns all uncertainty and fault.** When something is ambiguous or wrong, the doubt sits with the software: "I couldn't match this one yet — mind taking a look?" Never "Invalid entry," never anything that places fault on the person. This holds in every surface, including the playful ones.
5. **Say it out loud.** Because the user can't break anything, the product tells them so, early and often: "Nothing's filed until you say so. Everything's fixable. You can't break this." Safety only reduces anxiety when the user knows it is there.

---

## 4. Simple — the substance

1. **Speak events, not entries.** The primary input is "what happened?" in the user's own words — a photo, a forwarded email, a sentence, an auto-imported bank line. The user never translates reality into debits, credits, or VAT codes.
2. **Accounting is an output, never an input.** The double-entry books exist as plumbing: generated automatically, handed to the tax authority, available to the curious and to an auditor — but never required and never the default view. A person can run the business and file taxes without ever seeing the word *konto*.
3. **Categories live in the user's world.** "Gear," "materials," "travel" — learned from how the user actually talks — mapped silently to the formal chart of accounts underneath.
4. **Zero-config, smart defaults.** The product works correctly out of the box for a small sole proprietorship. Defaults are pre-chosen for this exact user; configuration is optional depth, not a gate.
5. **Progressive disclosure.** The home surface shows one thing. Depth — the ledger, the breakdown, the reasoning — is always one tap away and never front-loaded. Controls that don't apply to a given user (for example, VAT controls for a user who isn't VAT-registered) are hidden.
6. **Ninety percent done on arrival.** Everything possible is prefilled from the bank feed, captured receipts, and the authorities' own data. The user's job is to review and confirm, never to enter from scratch.
7. **One ambient status.** The resting state of the whole product is a single glanceable signal — ideally "You're caught up."

---

## 5. Playful — the texture, and where it stops

Playfulness is expressed in four places. None of them appear at the consequential moments in §5.5.

**5.1 Voice is the highest-impact lever.**
The product talks like a sharp, funny, genuinely competent friend. Warm, brief, plain-spoken, occasionally cheeky. Full guide in §7.

**5.2 Delight is earned and placed after the work.**
A small, genuinely satisfying flourish at the moments that matter — an invoice marked paid, a filing completed — never in the way of the task. People remember an experience by its most intense moment and its ending, so the rare peak moments are made to land.

**5.3 The honest-number reveal is joyful, not anxious.**
The "what's actually yours" view (§6) is framed as permission and relief, not as a tax warning: "This is really yours. Spend it guilt-free." Turning the most anxiety-laden number in the domain into a moment of lightness is the product's signature emotional move.

**5.4 Effortlessness is experienced as fun.**
The play is in the feel of the interactions — snapping a receipt and watching it settle into place, a payment locking onto its invoice — the satisfaction of a well-made object, not a layer of mechanics. These micro-interactions are where the fun lives, and they work without requiring the user to show up regularly.

**5.5 Where playfulness stops — go calm, clear, sober:**
- When money leaves the user (paying a bill, sending funds).
- When something is filed to the authorities (the act of submission itself).
- When there is a genuine ambiguity the user must resolve (a real judgment call about their money or obligations).

At these moments: plain language, no jokes, no flourish, maximum clarity. Warmth may return immediately afterward — "Filed. You're square with Skatteetaten 'til June — go do literally anything else." — but the consequential instant itself is sober.

---

## 6. The centerpiece: "What's actually yours"

The emotional heart of the product.

- **Mechanic:** the moment income lands, the money that *isn't* the user's is visually fenced off — VAT being held for the tax authority, estimated tax — so the headline number is only the safe-to-spend remainder. "Of the 200k you've taken in, ~40k is VAT you're holding and ~25k is estimated tax. Your spendable: ~135k."
- **Emotional frame:** not a warning, a relief. Fencing the money prevents the most common and most painful sole-proprietor mistake — spending the tax authority's money — and the remaining number is delivered as permission: "This part's truly yours."
- **Why it matters:** it conveys the single most useful financial truth in the domain without a word of jargon, and it makes a dreaded subject feel light.

---

## 7. Disengagement behavior

The product is built for a low-frequency, low-attention user — someone for whom this is a side activity, touched occasionally and easily forgotten for weeks. These rules govern how it behaves; §5 and §7's voice guide govern how it feels when behavior surfaces.

1. **Earn irrelevance.** Success is the user rarely needing to open the product at all. Optimize for the user forgetting it exists until they truly need it; measure success by the *absence* of necessary use, not by frequency of use.
2. **Ambient, not a destination.** Closer to a thermostat than an app. It runs in the background; the user glances occasionally; it taps them only when a human is genuinely required.
3. **Act, then report — don't ask.** High-confidence routine items — a regular client, a recurring charge seen many times — are handled automatically, recorded, and reported for review: "Here's what I did — untap anything that's wrong." Only genuinely ambiguous items are surfaced. Explicit confirmation is required only for the consequential actions in §5.5.
4. **A queue of things worth a glance, never an error list.** Everything routine is filed silently; the small queue of ambiguous items is clearable in under two minutes, calm rather than alarming, framed as "worth a look before your VAT report," never as mistakes.
5. **The deadline is the spine.** The product is organized around the real statutory filing dates — VAT terms, the annual tax return, advance-tax installments. The core promise is "you'll never miss one, and there's nothing to do until I tell you," with the work already largely done when the date arrives. Reminders are proactive and impossible to miss, but calm in tone and arriving pre-solved.
6. **Re-onboard a returning user every time.** People come back having forgotten how everything works — competent, but out of practice. Every return is self-explanatory within seconds and, ideally, opens on "You're caught up." Assume no retained memory and no learning curve on every visit.
7. **Notify rarely and meaningfully.** Roughly one reassuring "all handled" signal a month, one "your VAT return is ready" a quarter. Positive in framing, peripheral in delivery (a calm badge, not an alarming buzz). Never notify in order to drive engagement.

---

## 8. Voice & tone guide

The production voice ships in **Norwegian first** — a warm, direct register that Norwegian financial products have shown users trust. The English below is reference; the personality must survive translation, and the Norwegian copy should be written as original work, not as a translation pass.

**Personality:** a sharp, funny, genuinely competent friend. Warm, brief, plain-spoken, occasionally cheeky. Never corporate, never condescending, never a mascot, never trying too hard.

**Register shifts by moment** (this table is the operational core):

| Situation | Voice | Example (reference EN) | Never |
|---|---|---|---|
| Routine success | Warm, light | "Nice — that's invoiced. Money's on its way." | "Invoice #1042 created successfully." |
| Caught up / resting state | Reassuring, a little playful | "All clear. Nothing needs you right now." | "0 pending items." |
| Something auto-handled | Transparent + warm | "Sorted the Adobe charge for you — untap if that's off." | Silent, or "Transaction categorized." |
| An item worth a glance | Calm, system owns it, no blame | "I wasn't sure how to file this one — mind a quick look?" | "Error: uncategorized transaction." |
| Approaching the VAT threshold | Helpful heads-up, not alarm | "Heads up — you're getting close to the VAT threshold. Nothing to do yet; I'll walk you through it when it's time." | "WARNING: VAT registration required." |
| Deadline approaching | Calm, pre-solved, reassuring | "VAT's due in two weeks. Good news: it's basically done. Two minutes when you're ready." | "URGENT: deadline in 14 days!" |
| **Money leaving (§5.5)** | **Sober, clear** | "Pay 12 400 kr to Statens vegvesen. This sends real money." | Any joke or flourish. |
| **Filing to the authorities (§5.5)** | **Sober, clear** | "Submit your VAT return to Skatteetaten for Mar–Apr." | Any joke or flourish. |
| Just after filing (peak) | Warm relief, earned delight | "Done. Filed. You're square with Skatteetaten 'til June — go do literally anything else." | "Submission complete." |
| The honest-number reveal | Permission, relief | "This part's genuinely yours. Spend it guilt-free." | "Net disposable income after liabilities." |
| Falling behind | Forgiving, zero guilt | "A few things piled up — no stress, here's the quick version." | "You have 12 overdue items." / any guilt or alarm. |

**Global voice rules:**
- One idea per sentence. Short over complete.
- No jargon the user didn't choose. If a formal accounting term must appear, it is tappable to explain itself in the user's own numbers — offered on demand, never pushed; no glossary.
- Never say "sorry" in routine validation; never use humor at the §5.5 consequential moments.
- The system is "I" and the user is "you" — a warm, direct relationship.
- Encouragement is positive only, and never about a streak or a running count.

---

## 9. The Feeling Test

Apply to every design decision:

> **Does this make the user feel more competent, in control, and at ease — or does it make them feel managed, stupid, or anxious?**

Mastery, closure, honest numbers, warmth, "I'm ahead of this," "I can't break it" → ship it.
Points, badges, levels, mascots, confetti on everything, punishing streaks, public ranking, urgency countdowns, blame-shaped errors, jargon walls, anything that drives engagement for its own sake → do not ship it, however appealing it looks in isolation.

Second test, for tone specifically: **is this one of the three consequential moments (§5.5)?** If yes, drop all playfulness and be sober and clear. If no, be warm.

---

## 10. Anti-patterns — what the product does not ship

- No points, badges, XP, levels, mascots, or avatars.
- No confetti or celebration on routine actions (reserved for genuine peaks, and even then restrained).
- No streaks that reset or guilt the user for a lapse.
- No public or competitive ranking of income or profit.
- No manufactured urgency, countdown pressure, or notifications designed to drive engagement.
- No error states that frame the user as wrong; nothing that makes the user feel stupid.
- No jargon walls, no mandatory accounting vocabulary, no pushed explainers.
- No playfulness at the §5.5 consequential moments.
- No cold or impersonal copy — the product is calm in behavior but never cold in voice.
- No engagement metrics as a measure of success — success is the user not needing to show up.

---

## 11. The underlying intent (so the rules aren't refactored away)

Each rule serves a specific purpose; understanding the purpose prevents well-meant changes that quietly break it.

- **Fencing money that isn't the user's** (§6) works because money that looks separate is less likely to be spent. Keep it visually and conceptually separate.
- **Landing the peaks** (§5.2, and the post-filing moment) works because people judge an experience by its most intense point and its ending. Those rare moments carry the whole impression.
- **Forgiveness everywhere** (§3.3, §7.4) exists because the thing this domain fears most is an irreversible mistake. That fear is engineered out and then reframed as safety. No streaks to lose, no guilt, no alarm.
- **Acting by default for routine work** (§7.3) exists to spend the user's scarce attention only where it is genuinely required.
- **Calm, peripheral, minimal communication** (§7) keeps the product in the background — but always with a warm voice, never a cold one.
- **Reaching empty / reaching done** (the glance queue, the deadline) provides genuine closure, used gently and never to manufacture anxiety.

---

## 12. One-sentence summary

**Playful, simple, safe: the product respects that bookkeeping is the least important thing in the user's week and works hard to stay that way — running itself quietly, making mistakes structurally impossible, and rewarding the rare moments of contact with genuine warmth and delight, while going dead-serious the instant real money or a real filing is on the line.**
