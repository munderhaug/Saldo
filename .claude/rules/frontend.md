---
paths: ["apps/web/app/routes/**", "apps/web/app/components/**", "apps/web/app/root.tsx"]
---
# Frontend rules

- **Semantic-HTML substrate, server-authoritative.** Real `<Form>`, loaders/actions are the
  client↔server boundary. The page must work without JS; native polish is enhancement on top.
- **shadcn/ui** (Radix + Tailwind v4). Component source lives in `app/components/ui` — read and
  edit it directly. No second component system.
- Forms: **React Hook Form + Zod resolver**, reusing schemas from `app/contracts`.
- Tables: **TanStack Table** + shadcn styling. Any figure column uses `font-variant-numeric:
  tabular-nums`.
- Optimistic UX re-runs `@saldo/domain` in the browser for instant VAT/total feedback. The client
  is authoritative for NOTHING.
- Money/dates: render via domain helpers; never format money with raw `toFixed`.
- Charts: Recharts (default) or visx (bespoke); keep to that family.
- **React Hook Form, @hookform/resolvers and TanStack Table are installed and in use.** Recharts,
  Motion and Vaul are chosen but **still deferred** (not dependencies) — `pnpm add` one in the same
  PR as the first feature that needs it (the choice is fixed here + in `docs/tech-stack.md`; only
  the install is deferred). Never re-add a deferred lib speculatively, ahead of a consuming feature.
