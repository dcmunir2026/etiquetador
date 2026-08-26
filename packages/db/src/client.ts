/**
 * DB client — singleton pattern, PostgreSQL.
 *
 * Uses `postgres` (postgres-js) + `drizzle-orm/postgres-js`.
 * Dev: docker compose up -d (Postgres on :5432, creds in docker-compose.yml).
 * Prod: real DATABASE_URL.
 *
 * In Next.js, import this ONLY from Server Actions, API routes, or RSC.
 * Do NOT import in client components.
 */

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { drizzle } from 'drizzle-orm/postgres-js';
import { createRequire } from 'node:module';
import * as schema from './index';

let _db: PostgresJsDatabase<typeof schema> | null = null;

const DEFAULT_URL = 'postgres://etiquetador:etiquetador_dev@localhost:5432/etiquetador';

function getDatabaseUrl(): string {
  return process.env.DATABASE_URL || DEFAULT_URL;
}

export function getDb(): PostgresJsDatabase<typeof schema> {
  if (_db) return _db;

  // Dynamic require so the `postgres` driver is loaded lazily. Same
  // pattern we used for better-sqlite3 — keeps the import out of any
  // edge/runtime that might not handle the ESM-only `postgres` package.
  const nodeRequire = createRequire(import.meta.url);

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const postgres = nodeRequire('postgres');

  const url = getDatabaseUrl();
  const client = postgres(url, { max: 10 });
  _db = drizzle(client, { schema });
  return _db!;
}

export function closeDb(): void {
  if (_db) {
    // The PostgresJsDatabase does not expose a public close(); the
    // underlying `postgres` client has `end()`. Reach for it through
    // the driver like we did for better-sqlite3.
    const driver = (_db as unknown as { _: { driver: { client: { end?: () => void } } } })._?.driver?.client;
    if (driver && typeof driver.end === 'function') driver.end();
    _db = null;
  }
}

export * from './index';
