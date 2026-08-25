'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, ne, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { taxonomies, taxonomyDimensions, dimensions, auditLog } from '@/db/schema';
import { getCurrentUser } from '@/lib/session';
import {
  AddDimensionToTaxonomyInput,
  ArchiveTaxonomyInput,
  CreateTaxonomyInput,
  RemoveDimensionFromTaxonomyInput,
  UpdateTaxonomyInput,
  autoSlug,
} from './schemas';

/**
 * Server actions for taxonomy CRUD + dimension assignment. Only
 * superadmins can create, edit or archive taxonomies (they are global
 * groups). Every mutation writes an `audit_log` row.
 */
export type ActionResult = { ok: true; id: string } | { ok: false; error: string };

async function requireSuperAdmin() {
  const user = await getCurrentUser();
  if (!user) throw new Error('No autenticado');
  if (!user.isSuperAdmin) {
    throw new Error('Solo el superadmin puede gestionar taxonomías');
  }
  return user;
}

async function writeAudit(
  actorId: string,
  taxonomyId: string,
  action: 'taxonomy.create' | 'taxonomy.update' | 'taxonomy.archive' | 'taxonomy.add_dimension' | 'taxonomy.remove_dimension',
  metadata: Record<string, unknown>,
) {
  const db = getDb();
  await db.insert(auditLog).values({
    actorId,
    projectId: null,
    action,
    targetType: 'taxonomy',
    targetId: taxonomyId,
    metadata: JSON.stringify(metadata),
  });
}

/** Resolve a unique slug: base; if taken, -2, -3, … */
async function uniqueSlug(base: string, exceptId?: string): Promise<string> {
  const db = getDb();
  const where = exceptId
    ? and(eq(taxonomies.slug, base), ne(taxonomies.id, exceptId))
    : eq(taxonomies.slug, base);
  const taken = await db
    .select({ id: taxonomies.id })
    .from(taxonomies)
    .where(where)
    .limit(1);
  if (taken.length === 0) return base;
  let n = 2;
  while (true) {
    const candidate = `${base}-${n}`;
    const w = exceptId
      ? and(eq(taxonomies.slug, candidate), ne(taxonomies.id, exceptId))
      : eq(taxonomies.slug, candidate);
    const rows = await db
      .select({ id: taxonomies.id })
      .from(taxonomies)
      .where(w)
      .limit(1);
    if (rows.length === 0) return candidate;
    n++;
  }
}

export async function createTaxonomy(input: unknown): Promise<ActionResult> {
  try {
    const user = await requireSuperAdmin();
    const parsed = CreateTaxonomyInput.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    }
    const { name, shortDescription, longDescription, color } = parsed.data;
    const slug = await uniqueSlug(autoSlug(name));
    const db = getDb();
    const [row] = await db
      .insert(taxonomies)
      .values({
        name,
        slug,
        shortDescription: shortDescription ?? null,
        longDescription: longDescription ?? null,
        color,
        status: 'active',
        createdBy: user.id,
      })
      .returning();
    if (!row) return { ok: false, error: 'No se pudo crear la taxonomía' };
    await writeAudit(user.id, row.id, 'taxonomy.create', { name, slug, color });
    revalidatePath('/taxonomias');
    return { ok: true, id: row.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error desconocido' };
  }
}

export async function updateTaxonomy(input: unknown): Promise<ActionResult> {
  try {
    const user = await requireSuperAdmin();
    const parsed = UpdateTaxonomyInput.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    }
    const { id, name, shortDescription, longDescription, color } = parsed.data;
    const db = getDb();
    const existing = await db
      .select()
      .from(taxonomies)
      .where(eq(taxonomies.id, id))
      .limit(1);
    if (!existing[0]) return { ok: false, error: 'Taxonomía no encontrada' };
    await db
      .update(taxonomies)
      .set({
        name,
        shortDescription: shortDescription ?? null,
        longDescription: longDescription ?? null,
        color,
        updatedAt: new Date(),
      })
      .where(eq(taxonomies.id, id));
    await writeAudit(user.id, id, 'taxonomy.update', { name, color });
    revalidatePath('/taxonomias');
    revalidatePath(`/taxonomias/${id}`);
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error desconocido' };
  }
}

export async function archiveTaxonomy(input: unknown): Promise<ActionResult> {
  try {
    const user = await requireSuperAdmin();
    const parsed = ArchiveTaxonomyInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: 'ID inválido' };
    const { id } = parsed.data;
    const db = getDb();
    const existing = await db
      .select({ id: taxonomies.id, status: taxonomies.status, name: taxonomies.name })
      .from(taxonomies)
      .where(eq(taxonomies.id, id))
      .limit(1);
    if (!existing[0]) return { ok: false, error: 'Taxonomía no encontrada' };
    if (existing[0].status === 'archived') {
      return { ok: false, error: 'La taxonomía ya estaba archivada' };
    }
    await db
      .update(taxonomies)
      .set({ status: 'archived', updatedAt: new Date() })
      .where(eq(taxonomies.id, id));
    await writeAudit(user.id, id, 'taxonomy.archive', {
      name: existing[0].name,
      previousStatus: 'active',
    });
    revalidatePath('/taxonomias');
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error desconocido' };
  }
}

export async function addDimensionToTaxonomy(input: unknown): Promise<ActionResult> {
  try {
    const user = await requireSuperAdmin();
    const parsed = AddDimensionToTaxonomyInput.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    }
    const { taxonomyId, dimensionId } = parsed.data;
    const db = getDb();
    // Validate both rows exist.
    const tx = await db
      .select({ id: taxonomies.id })
      .from(taxonomies)
      .where(eq(taxonomies.id, taxonomyId))
      .limit(1);
    if (!tx[0]) return { ok: false, error: 'Taxonomía no encontrada' };
    const dim = await db
      .select({ id: dimensions.id })
      .from(dimensions)
      .where(eq(dimensions.id, dimensionId))
      .limit(1);
    if (!dim[0]) return { ok: false, error: 'Dimensión no encontrada' };
    // Idempotent: check if the link already exists.
    const existing = await db
      .select({ tx: taxonomyDimensions.taxonomyId })
      .from(taxonomyDimensions)
      .where(
        and(
          eq(taxonomyDimensions.taxonomyId, taxonomyId),
          eq(taxonomyDimensions.dimensionId, dimensionId),
        ),
      )
      .limit(1);
    if (existing[0]) {
      return { ok: true, id: taxonomyId }; // already linked, no-op
    }
    // Find next `order` for this taxonomy.
    const [max] = await db
      .select({ m: sql<number>`COALESCE(MAX(${taxonomyDimensions.order}), -1)` })
      .from(taxonomyDimensions)
      .where(eq(taxonomyDimensions.taxonomyId, taxonomyId));
    const nextOrder = (max?.m ?? -1) + 1;
    await db.insert(taxonomyDimensions).values({
      taxonomyId,
      dimensionId,
      order: nextOrder,
    });
    await writeAudit(user.id, taxonomyId, 'taxonomy.add_dimension', { dimensionId, order: nextOrder });
    revalidatePath('/taxonomias');
    revalidatePath(`/taxonomias/${taxonomyId}`);
    return { ok: true, id: taxonomyId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error desconocido' };
  }
}

export async function removeDimensionFromTaxonomy(input: unknown): Promise<ActionResult> {
  try {
    const user = await requireSuperAdmin();
    const parsed = RemoveDimensionFromTaxonomyInput.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    }
    const { taxonomyId, dimensionId } = parsed.data;
    const db = getDb();
    await db
      .delete(taxonomyDimensions)
      .where(
        and(
          eq(taxonomyDimensions.taxonomyId, taxonomyId),
          eq(taxonomyDimensions.dimensionId, dimensionId),
        ),
      );
    await writeAudit(user.id, taxonomyId, 'taxonomy.remove_dimension', { dimensionId });
    revalidatePath('/taxonomias');
    revalidatePath(`/taxonomias/${taxonomyId}`);
    return { ok: true, id: taxonomyId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error desconocido' };
  }
}
