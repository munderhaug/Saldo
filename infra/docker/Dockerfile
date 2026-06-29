# Multi-stage build for the RR7 app (persistent Node server). Runs on an EU-region container host
# (ADR 0015); the Hetzner/Kamal self-host is the ADR 0008 sovereignty fallback.
FROM node:22-slim AS base
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

FROM base AS runtime
ENV NODE_ENV=production
# Run as the unprivileged `node` user (uid 1000, shipped by the node image), never root, to limit the
# blast radius of any container escape (review 2026-06-28, H3). `--chown` hands the copied tree to node.
# FOLLOW-UP (needs a Docker build to verify — no image is built in CI today, so it is deliberately not
# bundled here): prune to prod-only deps, e.g. `pnpm --filter @saldo/web deploy --prod /app/out`, and
# copy only that pruned output + the build/, so dev dependencies aren't shipped in the runtime image.
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 3000
CMD ["pnpm", "--filter", "@saldo/web", "start"]
