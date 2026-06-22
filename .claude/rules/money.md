---
paths: ["packages/domain/**", "apps/web/app/contracts/**", "apps/web/app/**/*money*"]
---
# Money rules (hard invariant)

- Money is `Øre` — a branded integer (`number & { __brand: 'øre' }`). Construct via `øre()`,
  never raw numbers, never floats.
- Combine with `addØre` / `subØre` / `mulRate`. NEVER use `+ - * /` directly on money — the
  `saldo/no-money-arithmetic` ESLint rule will flag it.
- Norwegian øre rounding is **round half away from zero**, applied ONLY at presentation/
  settlement boundaries via `roundØre()`, never mid-calculation.
- VAT amount = `roundØre(net × rate)`, computed once and stored; never re-derive divergently.
- No `decimal.js`. Rate math is integer-safe through `mulRate`.
