import { defineConfig } from 'drizzle-kit';

// Introspection-only: the database (built by SQL migrations) is the source of truth (ADR 0011).
// `pnpm db:introspect` regenerates app/db/schema.ts from the live schema.
export default defineConfig({
  dialect: 'postgresql',
  schema: './app/db/schema.ts',
  out: './app/db',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://saldo:saldo@localhost:5432/saldo',
  },
});
