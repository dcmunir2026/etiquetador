/**
 * DB client — singleton pattern.
 * Uses postgres.js in dev and prod. Set DATABASE_URL to
 *   postgres://etiquetador:etiquetador_dev@localhost:5433/etiquetador
 *
 * In Next.js, import this ONLY from Server Actions, API routes, or RSC.
 * Do NOT import in client components.
 */

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

let _db: PostgresJsDatabase<typeof schema> | null = null;
let _client: ReturnType<typeof postgres> | null = null;

export function getDb(): PostgresJsDatabase<typeof schema> {
  if (_db) return _db;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL no está definida. Apunta a Postgres en docker-compose.');
  }

  _client = postgres(url, {
    max: 10,
    idle_timeout: 20,
    prepare: false, // pgbouncer / supabase compatibility; flip to true if you're not behind a pooler.
  });
  _db = drizzle(_client, { schema });
  return _db;
}

export function closeDb(): void {
  if (_client) {
    _client.end({ timeout: 5 }).catch(() => undefined);
  }
  _client = null;
  _db = null;
}

export * from './schema';
