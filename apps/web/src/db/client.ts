/**
 * DB client — singleton pattern.
 * Uses better-sqlite3 in dev. Production target: PostgreSQL.
 *
 * The native binding is loaded via createRequire so webpack doesn't
 * try to bundle it.
 */

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { join } from 'node:path';
import * as schema from './schema';

let _db: BetterSQLite3Database<typeof schema> | null = null;

function getSqlitePath(): string {
  if (process.env.DATABASE_URL) {
    const u = process.env.DATABASE_URL;
    if (u.startsWith('file:')) return u.slice(5);
    if (u.startsWith('file://')) return u.slice(7);
    return u;
  }
  // Default: project root
  return join(process.cwd(), 'etiquetador.db');
}

export function getDb(): BetterSQLite3Database<typeof schema> {
  if (_db) return _db;

  // Dynamic require via createRequire to dodge webpack bundling of native modules.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createRequire } = require('node:module');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const nodeRequire = createRequire(__filename);

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Database = nodeRequire('better-sqlite3');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { drizzle } = nodeRequire('drizzle-orm/better-sqlite3');

  const path = getSqlitePath();
  const sqlite = new Database(path);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  _db = drizzle(sqlite, { schema });
  return _db!;
}

export function closeDb(): void {
  _db = null;
}

export * from './schema';
