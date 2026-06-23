# MVA on artistic & cultural services (mval § 3-7) — who is *unntatt*, and how far it reaches

The cultural-sector *enkeltpersonforetak* (musician, performer, and their crew) is a target Saldo user,
and this is the rule they get wrong most — not from carelessness, but because **there is no settled trade
convention**: people apply what they believe is right with no cited ground, and a common belief is that
*"if the event is exempt, the whole supply chain is exempt."* **That belief is not what the law says.**
This page states the rule from the primary sources so Saldo can show *why*, not just *what*.

Raw capture: `db/reference/mva/2026-06-23-mval-3-7-kunst-kultur.md`.

## The rule

**Artistic performance of a copyright work is *unntatt* — outside the VAT Act** (mval § 3-7 annet ledd:
*"kunstnerisk framføring av åndsverk er unntatt fra loven"*). *Unntatt*, not *fritatt*: there is **no
output VAT and no input-VAT deduction** on that activity (contrast `docs/regulatory/mva-rates.md`; the
unntatt/fritatt distinction is in the spec glossary).

The exemption was widened to also cover **"tjenester som er en integrert og nødvendig del av
framføringen"** — services that are an *integrated and necessary part of the performance*. The test is the
**nature of each service relative to the performance**, assessed **service by service** — **not** the event
as a whole, and **not** a blanket pass-through down a supply chain.

### What is inside vs. outside the exemption

Per Skatteetaten's håndbok M-3-7.4 (concrete examples):

| Inside § 3-7(2) — *unntatt* (no MVA) | Outside — VAT-liable at 25% even at the same event |
|---|---|
| The artistic performance itself (the act/band performing) | **Vakthold** (security/guards) |
| **Lys og lyd** (light & sound) bought for that specific arrangement | **Servering** (catering) |
| **Scenerigg** — building/rigging a stage for that specific concert | **Garderobe** (cloakroom) |
| Technical services for **digital streaming** of the performance | **Reklame** (advertising) for the arrangement |

So a sound engineer or stage crew hired *for the specific show* is inside the exemption; the same event's
security firm or caterer is **not**. Adjacent ledd of § 3-7 also make *unntatt*: **adgang** to concerts/
theatre/etc. aimed at children & youth (1st ledd), **omvisning** (3rd), the **opphaver's** sale of their
own artwork/copyright and sale through a named intermediary (4th), and **formidling** of an artwork for
the opphaver (5th).

### Why the "whole supply chain is exempt" belief is wrong

The exemption attaches to **the performance and what is integral and necessary to performing it**, judged
per service — it does **not** convert every supplier to the event into an exempt one. Security, catering,
cloakroom, and advertising stay taxable. The deciding question is *"is this service an integrated and
necessary part of the artistic performance?"* — not *"did this happen at an exempt event?"*

## Why it matters in Saldo (and the open architectural question)

A single cultural-sector ENK very often has **both** unntatt activity (performing) **and** taxable activity
(e.g. teaching, session/sound work sold to others, merch, licensing). That is **delt virksomhet**, which
triggers **forholdsmessig fradrag** (input VAT deductible only for the taxable share). Today Saldo models
MVA status as **one enum on the organization** (`packages/domain/src/vat/status.ts`), and the build
specification currently lists delt-virksomhet apportionment as out of scope
(`docs/saldo-build-specification.md`). That single-status model **cannot represent "exempt on this project,
taxable on that one,"** which is day-one reality for this user. Whether to lift VAT treatment to the
**line/project** level (the SAF-T tax codes already support per-line codes) is an open decision — see
**ADR 0027** and the backlog (`mva-kunst-sectoral-doc`, `vat-mixed-activity`, `vat-line-level-model`).

This page is regulatory fact only; it does **not** assert that Saldo implements apportionment today.

## Sources
- Lov om merverdiavgift § 3-7 "Kunst og kultur mv." (verbatim). Lovdata,
  https://lovdata.no/lov/2009-06-19-58/§3-7. Raw: `db/reference/mva/2026-06-23-mval-3-7-kunst-kultur.md`.
  verify-by: 2026-12-31
- Skatteetaten, Merverdiavgiftshåndboken M-3-7 / M-3-7.4 (§ 3-7 annet ledd — integrert og nødvendig del;
  examples of included/excluded services). https://www.skatteetaten.no/en/rettskilder/type/handboker/merverdiavgiftshandboken/gjeldende/M-3/M-3-7/M-3-7.4/
  — retrieved 2026-06-23. Copyrighted; summarised, not reproduced. verify-by: 2026-12-31
- Skatteetaten prinsipputtalelse, "Strømming av kunstnerisk framføring over internett — mval. § 3-7 første
  og andre ledd" (streaming technical services inside the exemption). verify-by: 2026-12-31
- Sectoral edge cases (subcontractor chains, mixed bookings, formidling/agent specifics) are **not yet
  fully captured**; capture binding rulings (BFU) / klagenemnda decisions before encoding them in a rules
  engine (`vat-mixed-activity`). verify-by: 2026-12-31
