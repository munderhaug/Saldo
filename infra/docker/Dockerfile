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
COPY --from=build /app /app
EXPOSE 3000
CMD ["pnpm", "--filter", "@saldo/web", "start"]
