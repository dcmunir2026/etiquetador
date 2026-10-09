'use server';

/**
 * Project mutations: the create-project path the Topbar hooks into.
 *
 * Creation is gated to super admins (matches `Shell.tsx`'s `canCreateProject`
 * prop). The action also auto-installs the creator as a `projectadmin`
 * member so they can configure the project right after landing there, and
 * activates it as the current project — same cookie the project switcher
 * writes — so the redirect to /dimensiones lands inside the new project.
 */

import { cookies } from 'next/headers';
import { eq, like, or } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { getDb } from '@/db/client';
import { auditLog, projectMembers, projects } from '@/db/schema';
import { ACTIVE_PROJECT_COOKIE, requireUser } from '@/lib/session';

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Pick the first free slug in the `base`, `base-2`, `base-3`, … series.
 *
 * The unique index on `projects.slug` would surface the collision as a
 * constraint violation; cheap to read first and friendlier than a 500 if
 * someone tries to create "Demo" a second time.
 */
async function uniqueSlug(base: string): Promise<string> {
  const db = getDb();
  const seed = base || 'proyecto';
  // Anything `seed` or `seed-N` is reserved. One round-trip via `or(eq, like)`
  // keeps it simple and respects parameter binding instead of fudging a regex.
  const taken = await db
    .select({ slug: projects.slug })
    .from(projects)
    .where(or(eq(projects.slug, seed), like(projects.slug, `${seed}-%`)));
  const used = new Set(taken.map((r) => r.slug));
  if (!used.has(seed)) return seed;
  for (let n = 2; n < 10_000; n++) {
    const candidate = `${seed}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
  // Astronomically unlikely; bail with a recognisable slug rather than loop.
  return `${seed}-${Date.now().toString(36)}`;
}

export async function createProject(input: {
  name: string;
  description?: string;
}): Promise<ActionResult> {
  const user = await requireUser();
  if (!user.isSuperAdmin) {
    return { ok: false, error: 'Solo los superadministradores pueden crear proyectos.' };
  }

  const db = getDb();
  const name = input.name?.trim();
  if (!name) return { ok: false, error: 'El proyecto necesita un nombre.' };
  if (name.length > 120) return { ok: false, error: 'El nombre es demasiado largo (máx. 120 caracteres).' };

  const slug = await uniqueSlug(slugify(name));
  const [project] = await db.insert(projects).values({
    name,
    slug,
    description: input.description?.trim() || null,
    status: 'active',
    createdBy: user.id,
  }).returning();
  if (!project) return { ok: false, error: 'No se pudo crear el proyecto.' };

  // The creator is implicitly a projectadmin so they don't get locked out
  // by the membership check in `authorize()` on the very next request.
  await db.insert(projectMembers).values({
    projectId: project.id,
    userId: user.id,
    role: 'projectadmin',
  });

  await db.insert(auditLog).values({
    actorId: user.id,
    projectId: project.id,
    action: 'project.create',
    targetType: 'project',
    targetId: project.id,
    metadata: JSON.stringify({ name, slug }),
  });

  // Auto-activate the new project so the redirect to /dimensiones lands
  // inside it. The user can switch away from the switcher any time.
  cookies().set(ACTIVE_PROJECT_COOKIE, project.id, {
    path: '/', httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 30,
  });

  revalidatePath('/', 'layout');
  return { ok: true, id: project.id };
}

/**
 * Hard-delete a project and everything that hangs off it.
 *
 * Every child table that references `projects.id` declares
 * `onDelete: 'cascade'`, so a single DELETE removes memberships,
 * fragments, annotations, validations, teams, packages, and the rest
 * in one shot. The one exception is `audit_log`: the FK there uses
 * `onDelete: 'set null'`, so the row stays (with `project_id` nulled)
 * to preserve the trail of who-did-what-when, which is the whole point
 * of an audit log surviving a deletion.
 *
 * Gated to super admins: only they can create projects, and only they
 * can destroy one. The name the caller types is re-validated against
 * the row server-side — the client check is a UX nicety, the server
 * check is the only one that matters.
 *
 * If the deleted project was the user's active one, the cookie is
 * cleared so they don't land on a 404 the next request.
 */
export async function deleteProject(
  projectId: string,
  confirmName: string,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!user.isSuperAdmin) {
    return { ok: false, error: 'Solo los superadministradores pueden eliminar proyectos.' };
  }

  if (!projectId) return { ok: false, error: 'Falta el proyecto a eliminar.' };

  const db = getDb();
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) return { ok: false, error: 'El proyecto ya no existe.' };

  // The dialog already trims and exact-matches, but the server never
  // trusts the client. Re-check the trimmed string against the row so
  // a stray whitespace or different casing in the request body fails
  // closed instead of nuking the wrong project.
  const typed = (confirmName ?? '').trim();
  if (typed !== project.name) {
    return { ok: false, error: 'El nombre escrito no coincide con el del proyecto.' };
  }

  await db.delete(projects).where(eq(projects.id, projectId));

  await db.insert(auditLog).values({
    actorId: user.id,
    // projectId is set-null on the schema, so this is a tombstone in
    // the audit trail pointing at nothing — which is exactly what we
    // want for a "I deleted this" event.
    projectId: null,
    action: 'project.delete',
    targetType: 'project',
    targetId: projectId,
    metadata: JSON.stringify({ name: project.name, slug: project.slug }),
  });

  // If the deleted project was the active one, drop the cookie so the
  // next render of any project-scoped page falls through to the
  // picker instead of crashing on a phantom id.
  const cookieStore = cookies();
  const activeId = cookieStore.get(ACTIVE_PROJECT_COOKIE)?.value;
  if (activeId === projectId) {
    cookieStore.delete(ACTIVE_PROJECT_COOKIE);
  }

  revalidatePath('/', 'layout');
  return { ok: true, id: projectId };
}
