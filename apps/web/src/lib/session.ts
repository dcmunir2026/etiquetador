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
import {
  canWriteForRoles, pickPrimaryRole, ROLE_LABELS, type Role,
} from '@/lib/permissions';

export const ACTIVE_PROJECT_COOKIE = 'etq_active_project';
export const ACTIVE_USER_COOKIE = 'etq_active_user';

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  isSuperAdmin: boolean;
  avatarColor: string | null;
  /** Mirrors users.must_change_password. The auth middleware also reads
   *  this from the JWT (Edge can't reach the DB), but here we always
   *  return the freshest value from the row. */
  mustChangePassword: boolean;
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
    mustChangePassword: row.mustChangePassword,
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
 * Every role this user has in the project. A person can wear several hats
 * (e.g. annotator + validador_cualitativo) — the UI and the gate use this
 * list, and per-view access picks the most permissive entry.
 *
 * Returns an empty array when they are not a member; callers must treat
 * that as "no access" rather than as a weak role. Super admins outrank
 * everything and the function short-circuits to `['superadmin']` for them.
 */
export async function getRolesInProject(user: CurrentUser | null, projectId: string | null): Promise<Role[]> {
  if (!user) return [];
  if (user.isSuperAdmin) return ['superadmin'];
  if (!projectId) return [];

  const db = getDb();
  const rows = await db.select({ role: projectMembers.role })
    .from(projectMembers)
    .where(and(eq(projectMembers.userId, user.id), eq(projectMembers.projectId, projectId)));

  // Set dedupes; 'superadmin' would never be written here (see
  // setMemberRoles in app/actions/workflow.ts) but the filter is defense
  // in depth — a stray row would otherwise lift the user to platform
  // admin on the strength of a misplaced migration.
  const out = new Set<Role>();
  for (const r of rows) {
    if (r.role === 'superadmin') continue;
    out.add(r.role as Role);
  }
  return [...out];
}

/**
 * Single-role wrapper for callers that just want a label (display chips,
 * landing). Backed by `getRolesInProject` and `pickPrimaryRole`.
 */
export async function getRoleInProject(user: CurrentUser | null, projectId: string | null): Promise<Role | null> {
  const roles = await getRolesInProject(user, projectId);
  return pickPrimaryRole(roles);
}

export type SessionContext = {
  user: CurrentUser | null;
  /** The role we surface for landing / display — best privilege wins when
   *  the person wears several hats. Use `roles` for permission checks. */
  role: Role | null;
  /** Every role the user carries in the active project. Empty when they
   *  are not a member; `['superadmin']` for platform superadmins. */
  roles: Role[];
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
  if (!user) {
    return { user: null, role: null, roles: [], activeProject: null, projects: [] };
  }

  const visible = await getVisibleProjects(user);
  const cookieId = await getActiveProjectId();
  const activeProject = visible.find((p) => p.id === cookieId) ?? null;
  const roles = await getRolesInProject(user, activeProject?.id ?? null);

  return {
    user,
    role: pickPrimaryRole(roles),
    roles,
    activeProject,
    projects: visible,
  };
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
  const roles = await getRolesInProject(user, scope);
  if (roles.length === 0) return { ok: false, error: 'No eres miembro de este proyecto.' };

  if (!canWriteForRoles(view, roles)) {
    const label = roles.map((r) => ROLE_LABELS[r]).join(', ');
    return { ok: false, error: `Tus roles en este proyecto (${label}) no permiten esta acción.` };
  }
  return { ok: true, user, role: pickPrimaryRole(roles) ?? 'viewer' };
}
