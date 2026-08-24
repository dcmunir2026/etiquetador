/**
 * Auth stub — temporary.
 *
 * Reads the current user from a cookie set by `/api/dev/login`.
 * In Sprint 1 issue #3, replace with Auth.js v5 (NextAuth v5) with
 * Credentials + Email provider.
 */

import { cookies } from 'next/headers';
import { getDb } from '@/db/client';
import { users, type User } from '@/db/schema';
import { eq } from 'drizzle-orm';

const ACTIVE_USER_COOKIE = 'etq_active_user';
const ACTIVE_PROJECT_COOKIE = 'etq_active_project';

export async function getCurrentUser(): Promise<User | null> {
  const userId = cookies().get(ACTIVE_USER_COOKIE)?.value;
  const db = getDb();
  if (!userId) {
    const rows = await db.select().from(users).where(eq(users.isSuperAdmin, true)).limit(1);
    return rows[0] ?? null;
  }
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return rows[0] ?? null;
}

export async function getActiveProjectId(): Promise<string | null> {
  return cookies().get(ACTIVE_PROJECT_COOKIE)?.value ?? null;
}

export async function requireUser(): Promise<User> {
  const u = await getCurrentUser();
  if (!u) throw new Error('Not authenticated');
  return u;
}

export { ACTIVE_USER_COOKIE, ACTIVE_PROJECT_COOKIE };
