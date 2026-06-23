---
paths: ["apps/web/public/manifest.webmanifest"]
---
# Native-feel PWA rules

> Scope note: `app/pwa/` and `components/mobile/` don't exist yet — add them to this rule's `paths:`
> when `feat-mobile-companion` creates them (a path-scoped rule shouldn't glob absent code).

- The native feel is layered enhancement — never break the semantic-HTML/SSR baseline.
- Transitions: View Transitions API (RR7) for page-level; **Motion** for interaction-level
  spring/gesture animation. **Vaul** for bottom sheets/drawers.
- Mobile chrome that actually sells "native": `env(safe-area-inset-*)`, `100dvh`,
  `overscroll-behavior`, momentum scroll, disabled tap-highlight/double-tap-zoom, ≥44px tap
  targets, skeletons over spinners, a real bottom tab bar.
- Offline: receipt capture queues to a **Dexie** (IndexedDB) outbox; Background Sync flushes it.
  Postings NEVER go offline (online-first, ADR 0001).
- Service worker via **vite-plugin-pwa** (Workbox); manifest is `display: standalone`.
- iOS caveats are real (push needs installed PWA; storage eviction). If they bite, the escalation
  is **Capacitor** wrapping the same app — do not fork the codebase.
