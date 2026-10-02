#!/usr/bin/env node
/**
 * One-shot Drizzle migrator for the production container.
 *
 * Invoked by the `migrate` service in docker-compose.prod.yml. Runs Drizzle's
 * `migrate` against `DATABASE_URL` using the SQL files committed under
 * `apps/web/migrations/`. Exits 0 on success, 1 on failure.
 *
 * Why a CommonJS .cjs and not a .ts (and not a .js):
 *   The runner stage of Dockerfile.web only ships the Next.js standalone
 *   bundle plus the standalone-traced node_modules — it does NOT have a
 *   TypeScript runner. Node 22 executes this file directly without a build
 *   step.
 *
 *   We use `.cjs` (not `.js`) because Next's standalone output ships a
 *   `/app/package.json` with `"type": "module"`, which makes Node treat
 *   any `.js` as ESM — `require()` would then throw "ReferenceError:
 *   require is not defined". The `.cjs` extension forces CommonJS regardless
 *   of the surrounding package.json.
 *   step.
 *
 * Why we re-implement the client instead of importing the bundled one:
 *   The Next standalone tree imports `apps/web/src/db/client.ts` via webpack
 *   — the file ends up inside server.js and is not loadable from a plain
 *   Node process. We open our own postgres connection here.
 *
 * Why migrations live at apps/web/migrations/:
 *   The Dockerfile builds the image from the repo root and copies the
 *   entire `apps/web/` tree into the runner stage (via the standalone
 *   output + a manual `COPY public/`). When migrations are generated via
 *   `pnpm db:generate` they land in `packages/db/migrations/`. To avoid
 *   coupling the runner to packages/db, the README instructs operators
 *   to symlink or copy them into apps/web/migrations/ as part of the
 *   release. If the folder is missing, this script prints a clear error
 *   and exits 1.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const postgres = require('postgres');
const { drizzle } = require('drizzle-orm/postgres-js');
const { migrate } = require('drizzle-orm/postgres-js/migrator');

const MIGRATIONS_FOLDER = path.join(__dirname, '..', 'migrations');

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('[migrate] DATABASE_URL is not set');
    process.exit(1);
  }

  if (!fs.existsSync(MIGRATIONS_FOLDER)) {
    console.error(`[migrate] Migrations folder not found at ${MIGRATIONS_FOLDER}.`);
    console.error('[migrate] Generate it locally with: pnpm --filter @etiquetador/db db:generate');
    console.error('[migrate] Then copy or symlink packages/db/migrations/* into apps/web/migrations/');
    process.exit(1);
  }

  const files = fs.readdirSync(MIGRATIONS_FOLDER).filter((f) => f.endsWith('.sql'));
  if (files.length === 0) {
    console.error(`[migrate] No .sql files in ${MIGRATIONS_FOLDER}.`);
    console.error('[migrate] Generate migrations with: pnpm --filter @etiquetador/db db:generate');
    process.exit(1);
  }

  console.log(`[migrate] DATABASE_URL=${redact(url)}`);
  console.log(`[migrate] Using migrations folder: ${MIGRATIONS_FOLDER}`);
  console.log(`[migrate] Found ${files.length} migration file(s)`);

  const client = postgres(url, { max: 1 });
  const db = drizzle(client);

  try {
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    console.log('[migrate] Migrations applied successfully.');
  } catch (err) {
    console.error('[migrate] Migration failed:', err && err.message ? err.message : err);
    process.exit(1);
  } finally {
    await client.end({ timeout: 5 }).catch(() => undefined);
  }
}

function redact(url) {
  try {
    const u = new URL(url);
    if (u.password) u.password = '***';
    return u.toString();
  } catch {
    return '<unparsable>';
  }
}

main().catch((err) => {
  console.error('[migrate] Unexpected error:', err);
  process.exit(1);
});