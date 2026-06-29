# Multi-stage build for the RR7 app (persistent Node server). Runs on an EU-region container host
# (ADR 0015); the Hetzner/Kamal self-host is the ADR 0008 sovereignty fallback.
# Base image pinned by digest (review 2026-06-28) for reproducible builds; the tag is kept so
# Dependabot `docker` bumps tag+digest together. Digest = the multi-arch index for `node:22-slim`.
FROM node:26-slim@sha256:a1d9d671994fc2d26e297ac56b4b1522a8bc7fa71c43b14cd1b1fe6c5116f7dc AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY packages/domain/package.json packages/domain/
COPY tools/eslint-plugin-saldo/package.json tools/eslint-plugin-saldo/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm --filter @saldo/web build
# Produce a self-contained, PROD-ONLY deployment of @saldo/web (review 2026-06-28, H3): prod
# `node_modules` (no vite/vitest/drizzle-kit/tailwind/testcontainers/tsx) + the freshly built tree.
# `@saldo/domain` is BUNDLED into build/server/index.js by Vite (verified: the server bundle has no
# external `@saldo/domain` require), so the raw-TS workspace package never loads at runtime and the
# pruned image needs nothing from it. Deploy outside the workspace dir to avoid an in-tree target.
RUN pnpm --filter @saldo/web deploy --prod /prod

FROM base AS runtime
ENV NODE_ENV=production
# Copy ONLY the runtime essentials: prod node_modules, the build output, and package.json (for the
# `start` script). No source, tests, dev dependencies, or tooling reach the production image (H3).
COPY --from=build --chown=node:node /prod/node_modules ./node_modules
COPY --from=build --chown=node:node /prod/build ./build
COPY --from=build --chown=node:node /prod/package.json ./package.json
# Run as the unprivileged `node` user (uid 1000, shipped by the node image), never root, to limit the
# blast radius of any container escape (H3).
USER node
EXPOSE 3000
# Invoke the server entry directly with node — NOT `pnpm start`: pnpm would run a deps-status check and
# try to (re)install at boot, and the generated .bin shims bake absolute NODE_PATHs from the build-time
# deploy dir. `node` resolves deps through pnpm's relative node_modules symlinks regardless of path.
CMD ["node", "node_modules/@react-router/serve/bin.js", "./build/server/index.js"]
