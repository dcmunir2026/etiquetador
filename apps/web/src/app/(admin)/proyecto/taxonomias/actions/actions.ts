'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { projectMembers, projectTaxonomies, taxonomies, auditLog } from '@/db/schema';
import { getCurrentUser } from '@/lib/session';
import {
  AddProjectTaxonomyInput,
  RemoveProjectTaxonomyInput,
  SetProjectTaxonomiesInput,
} from './schemas';

/**
 * Server actions for per-project taxonomy assignment. Only superadmins
 * or projectadmins of the target project can assign/unassign
 * taxonomies. Every mutation writes an `audit_log` row.
 */
export type ActionResult = { ok: true; id: string } | { ok: false; error: string };

/** Same shape as proyecto/roles/actions.ts:_internal.requireProjectManager.
 *  Local copy to avoid cross-feature private imports. */
async function requireProjectManager(projectId: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error('No autenticado');
  if (user.isSuperAdmin) return user;
  const db = getDb();
  const m = await db
    .select({ role: projectMembers.role })
    .from(projectMembers)
    .where(
      and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, user.id)),
    )
    .limit(1);
  if (!m[0] || m[0].role !== 'projectadmin') {
    throw new Error('Solo el superadmin o un projectadmin de este proyecto puede asignar taxonomías');
  }
  return user;
}

async function writeAudit(
  actorId: string,
  projectId: string,
  action: 'project.taxonomy.add' | 'project.taxonomy.remove' | 'project.taxonomy.set',
  metadata: Record<string, unknown>,
) {
  const db = getDb();
  await db.insert(auditLog).values({
    actorId,
    projectId,
    action,
    targetType: 'project_taxonomy',
    targetId: projectId,
    metadata: JSON.stringify(metadata),
  });
}

export async function addProjectTaxonomy(input: unknown): Promise<ActionResult> {
  try {
    const parsed = AddProjectTaxonomyInput.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    }
    const { projectId, taxonomyId } = parsed.data;
    const actor = await requireProjectManager(projectId);
    const db = getDb();
    // Validate taxonomy exists.
    const tx = await db
      .select({ id: taxonomies.id, name: taxonomies.name })
      .from(taxonomies)
      .where(eq(taxonomies.id, taxonomyId))
      .limit(1);
    if (!tx[0]) return { ok: false, error: 'Taxonomía no encontrada' };
    // Idempotent: no-op if already assigned.
    const existing = await db
      .select({ pid: projectTaxonomies.projectId })
      .from(projectTaxonomies)
      .where(
        and(
          eq(projectTaxonomies.projectId, projectId),
          eq(projectTaxonomies.taxonomyId, taxonomyId),
        ),
      )
      .limit(1);
    if (existing[0]) {
      return { ok: true, id: projectId }; // already linked
    }
    await db.insert(projectTaxonomies).values({
      projectId,
      taxonomyId,
      assignedBy: actor.id,
    });
    await writeAudit(actor.id, projectId, 'project.taxonomy.add', {
      taxonomyId,
      taxonomyName: tx[0].name,
    });
    revalidatePath(`/proyecto/taxonomias?projectId=${projectId}`);
    revalidatePath('/taxonomias');
    return { ok: true, id: projectId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error desconocido' };
  }
}

export async function removeProjectTaxonomy(input: unknown): Promise<ActionResult> {
  try {
    const parsed = RemoveProjectTaxonomyInput.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    }
    const { projectId, taxonomyId } = parsed.data;
    const actor = await requireProjectManager(projectId);
    const db = getDb();
    await db
      .delete(projectTaxonomies)
      .where(
        and(
          eq(projectTaxonomies.projectId, projectId),
          eq(projectTaxonomies.taxonomyId, taxonomyId),
        ),
      );
    await writeAudit(actor.id, projectId, 'project.taxonomy.remove', { taxonomyId });
    revalidatePath(`/proyecto/taxonomias?projectId=${projectId}`);
    revalidatePath('/taxonomias');
    return { ok: true, id: projectId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error desconocido' };
  }
}

/** Replace the project's full set of taxonomies in one call. Used by the
 *  modal "Asignar a proyecto" from the global catalog. */
export async function setProjectTaxonomies(input: unknown): Promise<ActionResult> {
  try {
    const parsed = SetProjectTaxonomiesInput.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    }
    const { projectId, taxonomyIds } = parsed.data;
    const actor = await requireProjectManager(projectId);
    const db = getDb();
    // Wipe + re-insert. Cheaper than diffing for small N.
    await db.delete(projectTaxonomies).where(eq(projectTaxonomies.projectId, projectId));
    if (taxonomyIds.length > 0) {
      await db.insert(projectTaxonomies).values(
        taxonomyIds.map((taxonomyId) => ({
          projectId,
          taxonomyId,
          assignedBy: actor.id,
        })),
      );
    }
    await writeAudit(actor.id, projectId, 'project.taxonomy.set', {
      count: taxonomyIds.length,
      taxonomyIds,
    });
    revalidatePath(`/proyecto/taxonomias?projectId=${projectId}`);
    revalidatePath('/taxonomias');
    return { ok: true, id: projectId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error desconocido' };
  }
}
