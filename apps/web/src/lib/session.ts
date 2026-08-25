/**
 * Server-side session helpers.
 *
 * These wrap Auth.js's `auth()` so the rest of the app does not need to know
 * the implementation. They are server-only — never import from a client
 * component.
 */
import 'server-only';
import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { getDb } from '@/db/client';
import { users, type User } from '@/db/schema';

export const ACTIVE_PROJECT_COOKIE = 'etq_active_project';

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  isSuperAdmin: boolean;
};

/**
 * Returns the authenticated user, or null if not signed in.
 * Hydrates the DB row when the JWT only has the id (cold start).
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth();
  if (!session?.user) return null;
  const u = session.user;
  if (u.id && u.email) {
    return {
      id: u.id,
      email: u.email,
      name: u.name ?? u.email,
      isSuperAdmin: !!u.isSuperAdmin,
    };
  }
  // Fallback: hydrate from DB by email.
  const db = getDb();
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.email, u.email ?? ''))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name ?? row.email,
    isSuperAdmin: row.isSuperAdmin,
  };
}

export async function requireUser(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) throw new Error('Not authenticated');
  return u;
}

export async function getActiveProjectId(): Promise<string | null> {
  return cookies().get(ACTIVE_PROJECT_COOKIE)?.value ?? null;
}

// Re-export for back-compat with code that imported the old `User` type.
export type { User };
