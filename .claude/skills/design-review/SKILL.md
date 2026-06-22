---
name: design-review
description: Run a visual/design-system consistency pass over changed UI and emit a reviewable HTML report (tokens, spacing, semantic state colors, tabular numerals, density, native-feel chrome). Use before merging UI work or when checking a screen against the design system.
---
# Design review

Check changed UI against `.claude/rules/design-system.md` and produce a spatial artifact a human can
scan — per the HTML-effectiveness practice.

## Steps
1. Collect the changed routes/components.
2. Verify against the design system:
   - tokens only (no hardcoded hex / arbitrary spacing)
   - semantic state colors paired with text/icon
   - figures use the `tabular` utility; money right-aligned; formatted via domain helpers
   - components composed from `components/ui`; native-shell pieces in `components/mobile`
   - responsive density (dense desktop tables / touch-first mobile)
3. Emit `reports/design-review-<date>.html` via the `html-report` skill: a side-by-side checklist
   with pass/fail per screen and inline notes. Tabular-nums for any figures shown.

## Notes
- This is a consistency pass, not an a11y audit — pair with the `a11y-reviewer` subagent for WCAG.
- Keep it advisory: report findings, let the parent apply fixes.
