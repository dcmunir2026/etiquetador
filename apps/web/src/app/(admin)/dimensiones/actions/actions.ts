'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, ne } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { dimensions, dimensionValues, auditLog, intensityLevels } from '@/db/schema';
import { getCurrentUser } from '@/lib/session';
import {
  ArchiveDimensionInput,
  CreateDimensionInput,
  UpdateDimensionInput,
  autoSlug,
} from './schemas';

/**
 * Server actions for dimension CRUD. Only superadmins can create, edit
 * or archive dimensions (they are global atoms). Every mutation writes
 * an `audit_log` row.
 */
export type ActionResult = { ok: true; id: string } | { ok: false; error: string };

async function requireSuperAdmin() {
  const user = await getCurrentUser();
  if (!user) throw new Error('No autenticado');
  if (!user.isSuperAdmin) {
    throw new Error('Solo el superadmin puede gestionar dimensiones');
  }
  return user;
}

async function writeAudit(
  actorId: string,
  dimensionId: string,
  action: 'dimension.create' | 'dimension.update' | 'dimension.archive',
  metadata: Record<string, unknown>,
) {
  const db = getDb();
  await db.insert(auditLog).values({
    actorId,
    projectId: null,
    action,
    targetType: 'dimension',
    targetId: dimensionId,
    metadata: JSON.stringify(metadata),
  });
}

/** Resolve a unique slug: base; if taken, -2, -3, … */
async function uniqueSlug(base: string, exceptId?: string): Promise<string> {
  const db = getDb();
  const where = exceptId
    ? and(eq(dimensions.slug, base), ne(dimensions.id, exceptId))
    : eq(dimensions.slug, base);
  const taken = await db
    .select({ id: dimensions.id })
    .from(dimensions)
    .where(where)
    .limit(1);
  if (taken.length === 0) return base;
  let n = 2;
  while (true) {
    const candidate = `${base}-${n}`;
    const w = exceptId
      ? and(eq(dimensions.slug, candidate), ne(dimensions.id, exceptId))
      : eq(dimensions.slug, candidate);
    const rows = await db
      .select({ id: dimensions.id })
      .from(dimensions)
      .where(w)
      .limit(1);
    if (rows.length === 0) return candidate;
    n++;
  }
}

export async function createDimension(input: unknown): Promise<ActionResult> {
  try {
    const user = await requireSuperAdmin();
    const parsed = CreateDimensionInput.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    }
    const {
      name,
      kind,
      scaleId,
      shortDescription,
      longDescription,
      color,
      customValues,
    } = parsed.data;
    const slug = await uniqueSlug(autoSlug(name));

    const db = getDb();

    // If a scaleId was provided, make sure it exists. Nullable so the
    // custom 'Texto libre' path (no scaleId) works.
    let resolvedScaleId: string | null = scaleId ?? null;
    if (resolvedScaleId) {
      const scaleRows = await db
        .select({ id: intensityLevels.scaleId })
        .from(intensityLevels)
        .where(eq(intensityLevels.scaleId, resolvedScaleId))
        .limit(1);
      if (!scaleRows[0]) {
        return { ok: false, error: 'Escala no encontrada' };
      }
    }

    const [row] = await db
      .insert(dimensions)
      .values({
        name,
        slug,
        kind,
        scaleId: resolvedScaleId,
        shortDescription: shortDescription ?? null,
        longDescription: longDescription ?? null,
        status: 'active',
        createdBy: user.id,
      })
      .returning();
    if (!row) return { ok: false, error: 'No se pudo crear la dimensión' };

    // Always use the form's edited values — the wizard's step 3 lets
    // the user tweak them. If the form did not send customValues
    // (shouldn't happen post-#47 but defended) we copy from the scale.
    let valuesToInsert = customValues;
    if (!valuesToInsert || valuesToInsert.length === 0) {
      if (resolvedScaleId) {
        const levels = await db
          .select()
          .from(intensityLevels)
          .where(eq(intensityLevels.scaleId, resolvedScaleId));
        valuesToInsert = levels.map((lv, i) => ({
          label: lv.label,
          value: lv.value,
          color: lv.color ?? '#5a7d8f',
          order: lv.order,
        }));
      } else {
        valuesToInsert = [];
      }
    }
    if (valuesToInsert.length > 0) {
      await db.insert(dimensionValues).values(
        valuesToInsert.map((v) => ({
          dimensionId: row.id,
          label: v.label,
          value: v.value,
          color: v.color,
          order: v.order,
        })),
      );
    }

    await writeAudit(user.id, row.id, 'dimension.create', {
      name,
      slug,
      kind,
      scaleId: resolvedScaleId,
      valueCount: valuesToInsert.length,
    });
    revalidatePath('/dimensiones');
    return { ok: true, id: row.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error desconocido' };
  }
}

export async function updateDimension(input: unknown): Promise<ActionResult> {
  try {
    const user = await requireSuperAdmin();
    const parsed = UpdateDimensionInput.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    }
    const {
      id,
      name,
      kind,
      scaleId,
      shortDescription,
      longDescription,
      color,
      customValues,
    } = parsed.data;

    const db = getDb();
    const existing = await db
      .select()
      .from(dimensions)
      .where(eq(dimensions.id, id))
      .limit(1);
    if (!existing[0]) return { ok: false, error: 'Dimensión no encontrada' };

    let resolvedScaleId: string | null = scaleId ?? null;
    if (resolvedScaleId) {
      const scaleRows = await db
        .select({ id: intensityLevels.scaleId })
        .from(intensityLevels)
        .where(eq(intensityLevels.scaleId, resolvedScaleId))
        .limit(1);
      if (!scaleRows[0]) {
        return { ok: false, error: 'Escala no encontrada' };
      }
    }

    await db
      .update(dimensions)
      .set({
        name,
        kind,
        scaleId: resolvedScaleId,
        shortDescription: shortDescription ?? null,
        longDescription: longDescription ?? null,
        updatedAt: new Date(),
      })
      .where(eq(dimensions.id, id));

    // Replace the dimension_values with the new list from the wizard.
    if (customValues) {
      await db.delete(dimensionValues).where(eq(dimensionValues.dimensionId, id));
      if (customValues.length > 0) {
        await db.insert(dimensionValues).values(
          customValues.map((v) => ({
            dimensionId: id,
            label: v.label,
            value: v.value,
            color: v.color,
            order: v.order,
          })),
        );
      }
    }

    await writeAudit(user.id, id, 'dimension.update', {
      name,
      kind,
      scaleId: resolvedScaleId,
      valueCount: customValues?.length ?? 0,
    });
    revalidatePath('/dimensiones');
    revalidatePath(`/dimensiones/${id}/editar`);
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error desconocido' };
  }
}

export async function archiveDimension(input: unknown): Promise<ActionResult> {
  try {
    const user = await requireSuperAdmin();
    const parsed = ArchiveDimensionInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: 'ID inválido' };
    const { id } = parsed.data;

    const db = getDb();
    const existing = await db
      .select({ id: dimensions.id, status: dimensions.status })
      .from(dimensions)
      .where(eq(dimensions.id, id))
      .limit(1);
    if (!existing[0]) return { ok: false, error: 'Dimensión no encontrada' };
    if (existing[0].status === 'archived') {
      return { ok: false, error: 'La dimensión ya estaba archivada' };
    }
    await db
      .update(dimensions)
      .set({ status: 'archived', updatedAt: new Date() })
      .where(eq(dimensions.id, id));
    await writeAudit(user.id, id, 'dimension.archive', { previousStatus: 'active' });
    revalidatePath('/dimensiones');
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error desconocido' };
  }
}
