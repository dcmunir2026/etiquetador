/**
 * DB client — singleton pattern.
 * Uses better-sqlite3 in dev. Production target: PostgreSQL.
 *
 * The native binding is loaded via a dynamic require to avoid
 * Next.js's webpack trying to bundle it (which fails because
 * better-sqlite3 has a .node binary).
 *
 * In Next.js, import this ONLY from Server Actions, API routes, or RSC.
 * Do NOT import in client components.
 */

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import * as schema from './index';

let _db: BetterSQLite3Database<typeof schema> | null = null;

function getSqlitePath(): string {
  if (process.env.DATABASE_URL) {
    const u = process.env.DATABASE_URL;
    if (u.startsWith('file:')) return u.slice(5);
    if (u.startsWith('file://')) return u.slice(7);
    return u;
  }
  return join(process.cwd(), 'etiquetador.db');
}

export function getDb(): BetterSQLite3Database<typeof schema> {
  if (_db) return _db;

  // Dynamic require so webpack doesn't try to bundle the native module.
  // We use createRequire so we can call require from an ESM context.
  const nodeRequire = createRequire(import.meta.url);

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = nodeRequire('better-sqlite3');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { drizzle } = nodeRequire('drizzle-orm/better-sqlite3');

  const path = getSqlitePath();
  const sqlite = new Database(path);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  _db = drizzle(sqlite, { schema });
  return _db;
}

export function closeDb(): void {
  if (_db) {
    const nodeRequire = createRequire(import.meta.url);
    const db = (_db as { _: { driver: { connection: { close?: () => void } } } })._?.driver?.connection;
    if (db && typeof db.close === 'function') db.close();
    _db = null;
  }
}

export * from './index';
