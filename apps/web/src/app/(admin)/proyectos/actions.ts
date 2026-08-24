'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { and, eq, ne } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { projects, auditLog, projectMembers } from '@/db/schema';
import { getCurrentUser } from '@/lib/session';
import { generateProjectSlug, isSlugTaken } from '@/lib/projects';

/**
 * Errors thrown by these actions are returned to the form via `useFormState`
 * (or a try/catch in the client component). We keep them simple strings.
 */
export type ActionResult = { ok: true; id: string } | { ok: false; error: string };

const CreateInput = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(80, 'El nombre no puede superar 80 caracteres'),
  description: z
    .preprocess(
      (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
      z.string().trim().max(500, 'La descripción no puede superar 500 caracteres').optional(),
    ),
});

const UpdateInput = z.object({
  id: z.string().min(1),
  name: z
    .string()
    .trim()
    .min(2)
    .max(80),
  description: z
    .preprocess(
      (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
      z.string().trim().max(500).optional(),
    ),
});

const IdInput = z.object({ id: z.string().min(1) });

/** Only super-admins may create / update / archive projects. */
async function requireSuperAdmin() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('No autenticado');
  }
  if (!user.isSuperAdmin) {
    throw new Error('Solo el superadmin puede gestionar proyectos');
  }
  return user;
}

async function writeAudit(
  actorId: string,
  projectId: string,
  action: 'project.create' | 'project.update' | 'project.archive',
  metadata: Record<string, unknown>,
) {
  const db = getDb();
  await db.insert(auditLog).values({
    actorId,
    projectId,
    action,
    targetType: 'project',
    targetId: projectId,
    metadata: JSON.stringify(metadata),
  });
}

export async function createProject(input: unknown): Promise<ActionResult> {
  try {
    const user = await requireSuperAdmin();
    const parsed = CreateInput.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    }
    const { name, description } = parsed.data;
    const slug = await generateProjectSlug(name);
    const db = getDb();
    const [row] = await db
      .insert(projects)
      .values({
        name,
        slug,
        description: description ?? null,
        status: 'active',
        createdBy: user.id,
      })
      .returning();
    if (!row) {
      return { ok: false, error: 'No se pudo crear el proyecto' };
    }
    // Auto-add the creator as a project admin so they can use it.
    await db.insert(projectMembers).values({
      projectId: row.id,
      userId: user.id,
      role: 'projectadmin',
    });
    await writeAudit(user.id, row.id, 'project.create', { name, slug });
    revalidatePath('/proyectos');
    return { ok: true, id: row.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error desconocido' };
  }
}

export async function updateProject(input: unknown): Promise<ActionResult> {
  try {
    const user = await requireSuperAdmin();
    const parsed = UpdateInput.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    }
    const { id, name, description } = parsed.data;
    const db = getDb();
    const existing = await db
      .select()
      .from(projects)
      .where(eq(projects.id, id))
      .limit(1);
    const proj = existing[0];
    if (!proj) return { ok: false, error: 'Proyecto no encontrado' };

    // Slug: only regenerate if name changed. If conflict, append suffix.
    let nextSlug = proj.slug;
    if (name !== proj.name) {
      const base = await generateProjectSlug(name);
      if (await isSlugTaken(base, id)) {
        // fallback: keep current slug (better than breaking the URL)
        nextSlug = proj.slug;
      } else {
        nextSlug = base;
      }
    }

    await db
      .update(projects)
      .set({
        name,
        slug: nextSlug,
        description: description ?? null,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, id));
    await writeAudit(user.id, id, 'project.update', { name, description, slug: nextSlug });
    revalidatePath('/proyectos');
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error desconocido' };
  }
}

export async function archiveProject(input: unknown): Promise<ActionResult> {
  try {
    const user = await requireSuperAdmin();
    const parsed = IdInput.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: 'ID inválido' };
    }
    const { id } = parsed.data;
    const db = getDb();
    const existing = await db
      .select({ id: projects.id, status: projects.status })
      .from(projects)
      .where(eq(projects.id, id))
      .limit(1);
    if (!existing[0]) return { ok: false, error: 'Proyecto no encontrado' };
    if (existing[0].status === 'archived') {
      return { ok: false, error: 'El proyecto ya estaba archivado' };
    }
    await db
      .update(projects)
      .set({ status: 'archived', updatedAt: new Date() })
      .where(eq(projects.id, id));
    await writeAudit(user.id, id, 'project.archive', { previousStatus: 'active' });
    revalidatePath('/proyectos');
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error desconocido' };
  }
}

/** Helper for tests and other server code. */
export const _internal = { CreateInput, UpdateInput, IdInput, requireSuperAdmin };
