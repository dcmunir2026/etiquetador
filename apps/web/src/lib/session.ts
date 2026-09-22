/**
 * Server-side session: who is signed in, and what they may do *here*.
 *
 * The role is not a property of the user but of their membership in a
 * project, so it is resolved per request against the active project. A
 * super admin outranks membership everywhere.
 */

import 'server-only';
import { cookies } from 'next/headers';
import { and, eq, inArray } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { getDb } from '@/db/client';
import { projectMembers, projects, users } from '@/db/schema';
import { canWrite, ROLE_LABELS, type Role } from '@/lib/permissions';

export const ACTIVE_PROJECT_COOKIE = 'etq_active_project';
export const ACTIVE_USER_COOKIE = 'etq_active_user';

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  isSuperAdmin: boolean;
  avatarColor: string | null;
};

/** The signed-in user, or null. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;

  // Read the row rather than trusting the JWT: a user may have been
  // promoted, demoted or deleted since the token was issued.
  const db = getDb();
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  const row = rows[0];
  if (!row) return null;

  return {
    id: row.id,
    email: row.email,
    name: row.name ?? row.email,
    isSuperAdmin: row.isSuperAdmin,
    avatarColor: row.avatarColor,
  };
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  return user;
}

export async function getActiveProjectId(): Promise<string | null> {
  return cookies().get(ACTIVE_PROJECT_COOKIE)?.value ?? null;
}

/** The projects this user may open. Super admins see every project. */
export async function getVisibleProjects(user: CurrentUser | null) {
  if (!user) return [];
  const db = getDb();
  if (user.isSuperAdmin) {
    return db.select().from(projects).orderBy(projects.createdAt);
  }
  const memberships = await db.select({ projectId: projectMembers.projectId })
    .from(projectMembers).where(eq(projectMembers.userId, user.id));
  const ids = memberships.map((m) => m.projectId);
  if (ids.length === 0) return [];
  return db.select().from(projects).where(inArray(projects.id, ids)).orderBy(projects.createdAt);
}

/**
 * The user's role in a given project.
 *
 * Returns null when they are not a member, which the caller must treat as
 * "no access to this project" rather than as a weak role.
 */
export async function getRoleInProject(user: CurrentUser | null, projectId: string | null): Promise<Role | null> {
  if (!user) return null;
  if (user.isSuperAdmin) return 'superadmin';
  if (!projectId) return null;

  const db = getDb();
  const rows = await db.select().from(projectMembers)
    .where(and(eq(projectMembers.userId, user.id), eq(projectMembers.projectId, projectId)))
    .limit(1);
  const role = rows[0]?.role;
  if (!role) return null;
  // `superadmin` is a user-level flag; a membership row must not grant it.
  return role === 'superadmin' ? 'projectadmin' : (role as Role);
}

export type SessionContext = {
  user: CurrentUser | null;
  role: Role | null;
  activeProject: typeof projects.$inferSelect | null;
  projects: Array<typeof projects.$inferSelect>;
};

/**
 * Everything a page needs to decide what to render: the user, the projects
 * they can open, the active one and their role in it.
 *
 * If the cookie points at a project they cannot open (revoked access, or a
 * stale cookie), the active project falls back to their first one.
 */
export async function getSessionContext(): Promise<SessionContext> {
  const user = await getCurrentUser();
  if (!user) return { user: null, role: null, activeProject: null, projects: [] };

  const visible = await getVisibleProjects(user);
  const cookieId = await getActiveProjectId();
  const activeProject = visible.find((p) => p.id === cookieId) ?? null;
  const role = await getRoleInProject(user, activeProject?.id ?? null);

  return { user, role, activeProject, projects: visible };
}

export type Authorized = { ok: true; user: CurrentUser; role: Role };
export type Denied = { ok: false; error: string };

/**
 * Gate a server action.
 *
 * This is the authoritative check: hiding a button only stops the honest
 * path, whereas a server action is reachable by anyone who can craft a
 * request. Every mutation goes through here.
 *
 * `projectId` scopes the role; omit it for actions on the global catalogue,
 * where the active project still decides whether you are a super admin.
 */
export async function authorize(view: string, projectId?: string | null): Promise<Authorized | Denied> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Tu sesión ha caducado. Vuelve a entrar.' };

  const scope = projectId ?? (await getActiveProjectId());
  const role = await getRoleInProject(user, scope);
  if (!role) return { ok: false, error: 'No eres miembro de este proyecto.' };

  if (!canWrite(view, role)) {
    return { ok: false, error: `Tu rol (${ROLE_LABELS[role]}) no permite esta acción.` };
  }
  return { ok: true, user, role };
}
