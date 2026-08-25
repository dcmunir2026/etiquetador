'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { projectMembers, projects, users, auditLog } from '@/db/schema';
import { USER_ROLES } from '@/db/schema';
import { getCurrentUser } from '@/lib/session';
import { ChangeRoleInput, InviteUserInput, RemoveMemberInput } from './schemas';

/**
 * Server actions for inviting users to a project and managing their
 * role. Only superadmins and project-admins of the target project can
 * act. Every mutation writes an `audit_log` row.
 *
 * Validation lives in `./schemas` so it can be unit-tested without
 * pulling in next-auth / better-sqlite3.
 */
export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

/**
 * Check that the current user can manage members of the given project.
 * - superadmin: always.
 * - projectadmin of the same project: yes.
 * - anyone else: no.
 */
async function requireProjectManager(projectId: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error('No autenticado');
  if (user.isSuperAdmin) return user;

  const db = getDb();
  const rows = await db
    .select({ role: projectMembers.role })
    .from(projectMembers)
    .where(
      and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, user.id)),
    )
    .limit(1);
  const membership = rows[0];
  if (!membership || membership.role !== 'projectadmin') {
    throw new Error('No tienes permiso para gestionar miembros de este proyecto');
  }
  return user;
}

async function writeAudit(
  actorId: string,
  projectId: string,
  action:
    | 'project.member.invite'
    | 'project.member.change_role'
    | 'project.member.remove',
  metadata: Record<string, unknown>,
) {
  const db = getDb();
  await db.insert(auditLog).values({
    actorId,
    projectId,
    action,
    targetType: 'project_member',
    targetId: projectId, // we don't have a member id PK; project+user is the key
    metadata: JSON.stringify(metadata),
  });
}

export async function inviteUserToProject(input: unknown): Promise<ActionResult> {
  try {
    const parsed = InviteUserInput.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    }
    const { projectId, email, role } = parsed.data;
    const actor = await requireProjectManager(projectId);

    // Make sure the project exists.
    const db = getDb();
    const projRows = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    if (!projRows[0]) return { ok: false, error: 'Proyecto no encontrado' };

    // Find or create the user. If we create, we set a placeholder password
    // hash so the row is valid; the user will reset on first login.
    const userRows = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    let user = userRows[0];
    const wasNewUser = !user;
    if (!user) {
      const insertedRows = await db
        .insert(users)
        .values({
          email,
          name: email.split('@')[0]?.replace(/[._-]+/g, ' ') ?? null,
          // Placeholder hash of a random 32-byte hex string — user will need
          // to use "forgot password" once email is wired up. Until then, they
          // can't sign in with a password.
          passwordHash: 'pending:' + crypto.randomUUID(),
          isSuperAdmin: false,
        })
        .returning();
      const inserted = insertedRows[0];
      if (!inserted) return { ok: false, error: 'No se pudo crear el usuario' };
      user = inserted;
    }

    // If already a member, no-op (idempotent).
    const existingMember = await db
      .select()
      .from(projectMembers)
      .where(
        and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, user.id)),
      )
      .limit(1);
    if (existingMember[0]) {
      return { ok: false, error: 'Esa persona ya es miembro del proyecto' };
    }

    await db.insert(projectMembers).values({
      projectId,
      userId: user.id,
      role,
    });
    await writeAudit(actor.id, projectId, 'project.member.invite', {
      email,
      userId: user.id,
      role,
      wasNewUser,
    });
    revalidatePath(`/proyecto/roles?projectId=${projectId}`);
    return { ok: true, id: user.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error desconocido' };
  }
}

export async function changeUserRole(input: unknown): Promise<ActionResult> {
  try {
    const parsed = ChangeRoleInput.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    }
    const { projectId, userId, role } = parsed.data;
    const actor = await requireProjectManager(projectId);

    const db = getDb();
    const existing = await db
      .select()
      .from(projectMembers)
      .where(
        and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)),
      )
      .limit(1);
    if (!existing[0]) return { ok: false, error: 'Membresía no encontrada' };
    if (existing[0].role === role) {
      return { ok: false, error: 'El rol ya es ese' };
    }

    await db
      .update(projectMembers)
      .set({ role })
      .where(
        and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)),
      );
    await writeAudit(actor.id, projectId, 'project.member.change_role', {
      userId,
      from: existing[0].role,
      to: role,
    });
    revalidatePath(`/proyecto/roles?projectId=${projectId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error desconocido' };
  }
}

export async function removeUserFromProject(input: unknown): Promise<ActionResult> {
  try {
    const parsed = RemoveMemberInput.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: 'Datos inválidos' };
    }
    const { projectId, userId } = parsed.data;
    const actor = await requireProjectManager(projectId);

    // A project must always have at least one projectadmin. Refuse if
    // removing the only one.
    const db = getDb();
    const existing = await db
      .select()
      .from(projectMembers)
      .where(
        and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)),
      )
      .limit(1);
    if (!existing[0]) return { ok: false, error: 'Membresía no encontrada' };
    if (existing[0].role === 'projectadmin') {
      const otherAdmins = await db
        .select({ id: projectMembers.id })
        .from(projectMembers)
        .where(
          and(
            eq(projectMembers.projectId, projectId),
            eq(projectMembers.role, 'projectadmin'),
          ),
        );
      if (otherAdmins.length <= 1) {
        return {
          ok: false,
          error: 'No puedes eliminar al último projectadmin del proyecto',
        };
      }
    }

    await db
      .delete(projectMembers)
      .where(
        and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)),
      );
    await writeAudit(actor.id, projectId, 'project.member.remove', {
      userId,
      role: existing[0].role,
    });
    revalidatePath(`/proyecto/roles?projectId=${projectId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error desconocido' };
  }
}

export const _internal = {
  requireProjectManager,
  USER_ROLES,
};
