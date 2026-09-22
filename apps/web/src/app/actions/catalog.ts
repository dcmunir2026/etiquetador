'use server';

/**
 * Catalogue mutations: dimensions (including the creation wizard and its
 * skip-logic step), custom scales and taxonomies.
 */

import { revalidatePath } from 'next/cache';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import {
  annotations, auditLog, dimensionDependencies, dimensionValues, dimensions, fragments,
  intensityLevels, intensityScales, projectTaxonomies, taxonomies, taxonomyDimensions,
  type ScaleKind,
} from '@/db/schema';
import { authorize, requireUser } from '@/lib/session';
import { wouldCycle, type CascadeDimension } from '@/lib/cascade';

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

function slugify(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function audit(action: string, targetType: string, targetId: string, metadata?: unknown) {
  const db = getDb();
  const user = await requireUser();
  await db.insert(auditLog).values({
    actorId: user.id, action, targetType, targetId,
    metadata: metadata ? JSON.stringify(metadata) : null,
  });
}

/** Everything the wizard collects across its five steps. */
export type DimensionInput = {
  name: string;
  slug?: string;
  shortDescription?: string;
  longDescription?: string;
  scaleId: string | null;
  kind: 'category' | 'intensity' | 'flag' | 'free-text';
  values: Array<{ label: string; color?: string }>;
  dependency?: { parentId: string; values: string[] } | null;
};

export async function createDimension(input: DimensionInput): Promise<ActionResult> {
  const gate = await authorize('taxonomies');
  if (!gate.ok) return { ok: false, error: gate.error };
  const db = getDb();
  const user = await requireUser();

  const name = input.name?.trim();
  if (!name) return { ok: false, error: 'El nombre es obligatorio.' };

  const slug = slugify(input.slug?.trim() || name);
  const [clash] = await db.select().from(dimensions).where(eq(dimensions.slug, slug)).limit(1);
  if (clash) return { ok: false, error: `Ya existe una dimensión con el slug "${slug}".` };

  const labels = input.values.map((v) => v.label.trim()).filter(Boolean);
  if (input.kind !== 'free-text' && labels.length === 0) {
    return { ok: false, error: 'Al menos un valor debe tener nombre.' };
  }

  const [row] = await db.insert(dimensions).values({
    name, slug,
    shortDescription: input.shortDescription?.trim() || null,
    longDescription: input.longDescription?.trim() || null,
    kind: input.kind,
    scaleId: input.scaleId,
    status: 'active',
    createdBy: user.id,
  }).returning();
  if (!row) return { ok: false, error: 'No se pudo crear la dimensión.' };

  for (const [i, v] of input.values.entries()) {
    const label = v.label.trim();
    if (!label) continue;
    await db.insert(dimensionValues).values({
      dimensionId: row.id, label, value: label, order: i, color: v.color ?? null,
    });
  }

  if (input.dependency?.parentId && input.dependency.values.length > 0) {
    const dep = await saveDependencyInternal(row.id, input.dependency.parentId, input.dependency.values);
    if (!dep.ok) return dep;
  }

  await audit('dimension.create', 'dimension', row.id, { name, slug });
  revalidatePath('/', 'layout');
  return { ok: true, id: row.id };
}

export async function updateDimension(
  id: string,
  patch: { name?: string; shortDescription?: string; longDescription?: string; values?: Array<{ label: string; color?: string }> },
): Promise<ActionResult> {
  const gate = await authorize('taxonomies');
  if (!gate.ok) return { ok: false, error: gate.error };
  const db = getDb();
  const [existing] = await db.select().from(dimensions).where(eq(dimensions.id, id)).limit(1);
  if (!existing) return { ok: false, error: 'Dimensión no encontrada.' };

  await db.update(dimensions).set({
    name: patch.name?.trim() || existing.name,
    shortDescription: patch.shortDescription ?? existing.shortDescription,
    longDescription: patch.longDescription ?? existing.longDescription,
    updatedAt: new Date(),
  }).where(eq(dimensions.id, id));

  // The scale is intentionally immutable: changing it would invalidate
  // every annotation already recorded against this dimension.
  if (patch.values) {
    await db.delete(dimensionValues).where(eq(dimensionValues.dimensionId, id));
    for (const [i, v] of patch.values.entries()) {
      const label = v.label.trim();
      if (!label) continue;
      await db.insert(dimensionValues).values({
        dimensionId: id, label, value: label, order: i, color: v.color ?? null,
      });
    }
  }

  await audit('dimension.update', 'dimension', id, patch);
  revalidatePath('/', 'layout');
  return { ok: true, id };
}

export async function setDimensionStatus(id: string, status: 'active' | 'archived'): Promise<ActionResult> {
  const gate = await authorize('taxonomies');
  if (!gate.ok) return { ok: false, error: gate.error };
  const db = getDb();
  await db.update(dimensions).set({ status, updatedAt: new Date() }).where(eq(dimensions.id, id));
  await audit(`dimension.${status === 'archived' ? 'archive' : 'restore'}`, 'dimension', id);
  revalidatePath('/', 'layout');
  return { ok: true, id };
}

async function saveDependencyInternal(childId: string, parentId: string, values: string[]): Promise<ActionResult> {
  const db = getDb();
  if (childId === parentId) return { ok: false, error: 'Una dimensión no puede depender de sí misma.' };

  // Load the graph to reject cycles before writing.
  const [allDims, allDeps] = await Promise.all([
    db.select({ id: dimensions.id, name: dimensions.name, kind: dimensions.kind }).from(dimensions),
    db.select().from(dimensionDependencies),
  ]);
  const depBy = new Map(allDeps.map((d) => [d.dimensionId, d]));
  const graph: CascadeDimension[] = allDims.map((d) => {
    const dep = depBy.get(d.id);
    return {
      id: d.id, name: d.name, kind: d.kind, values: [],
      dependency: dep
        ? { parentId: dep.dependsOnId, operator: dep.operator, values: JSON.parse(dep.values), label: dep.label }
        : null,
    };
  });
  if (wouldCycle(childId, parentId, graph)) {
    return { ok: false, error: 'Ciclo detectado: no se puede depender de una dimensión que ya depende de esta.' };
  }

  const [parent] = await db.select().from(dimensions).where(eq(dimensions.id, parentId)).limit(1);
  const label = parent ? `${parent.name} = ${values.join(' o ')}` : null;

  await db.delete(dimensionDependencies).where(eq(dimensionDependencies.dimensionId, childId));
  await db.insert(dimensionDependencies).values({
    dimensionId: childId, dependsOnId: parentId, operator: '=',
    values: JSON.stringify(values), behavior: 'skip', label,
  });
  return { ok: true, id: childId };
}

export async function setDimensionDependency(
  childId: string,
  dependency: { parentId: string; values: string[] } | null,
): Promise<ActionResult> {
  const gate = await authorize('taxonomies');
  if (!gate.ok) return { ok: false, error: gate.error };
  const db = getDb();
  if (!dependency) {
    await db.delete(dimensionDependencies).where(eq(dimensionDependencies.dimensionId, childId));
    await audit('dimension.dependency.clear', 'dimension', childId);
    revalidatePath('/', 'layout');
    return { ok: true, id: childId };
  }
  const res = await saveDependencyInternal(childId, dependency.parentId, dependency.values);
  if (res.ok) {
    await audit('dimension.dependency.set', 'dimension', childId, dependency);
    revalidatePath('/', 'layout');
  }
  return res;
}

// ─── Custom scales ───────────────────────────────────────────────────

export async function createScale(input: {
  name: string; kind: ScaleKind; labels: string[]; description?: string;
}): Promise<ActionResult> {
  const gate = await authorize('taxonomies');
  if (!gate.ok) return { ok: false, error: gate.error };
  const db = getDb();
  const user = await requireUser();
  const name = input.name?.trim();
  if (!name) return { ok: false, error: 'El nombre de la escala es obligatorio.' };

  const [clash] = await db.select().from(intensityScales).where(eq(intensityScales.name, name)).limit(1);
  if (clash) return { ok: false, error: `Ya existe una escala llamada "${name}".` };

  const [row] = await db.insert(intensityScales).values({
    name, kind: input.kind, isCustom: true, createdBy: user.id,
  }).returning();
  if (!row) return { ok: false, error: 'No se pudo crear la escala.' };

  for (const [i, label] of input.labels.entries()) {
    if (!label.trim()) continue;
    await db.insert(intensityLevels).values({
      scaleId: row.id, label: label.trim(), value: String(i + 1), order: i,
    });
  }

  await audit('scale.create', 'scale', row.id, { name });
  revalidatePath('/', 'layout');
  return { ok: true, id: row.id };
}

// ─── Taxonomies ──────────────────────────────────────────────────────

export async function createTaxonomy(input: {
  name: string; shortDescription?: string; color?: string; dimensionIds: string[];
}): Promise<ActionResult> {
  const gate = await authorize('taxonomy-groups');
  if (!gate.ok) return { ok: false, error: gate.error };
  const db = getDb();
  const user = await requireUser();
  const name = input.name?.trim();
  if (!name) return { ok: false, error: 'El nombre es obligatorio.' };

  const slug = slugify(name);
  const [clash] = await db.select().from(taxonomies).where(eq(taxonomies.slug, slug)).limit(1);
  if (clash) return { ok: false, error: `Ya existe una taxonomía con el slug "${slug}".` };

  const [row] = await db.insert(taxonomies).values({
    name, slug,
    shortDescription: input.shortDescription?.trim() || null,
    color: input.color ?? 'cyan',
    status: 'active', createdBy: user.id,
  }).returning();
  if (!row) return { ok: false, error: 'No se pudo crear la taxonomía.' };

  for (const [i, dimensionId] of input.dimensionIds.entries()) {
    await db.insert(taxonomyDimensions).values({ taxonomyId: row.id, dimensionId, order: i });
  }

  await audit('taxonomy.create', 'taxonomy', row.id, { name });
  revalidatePath('/', 'layout');
  return { ok: true, id: row.id };
}

export async function setTaxonomyDimensions(taxonomyId: string, dimensionIds: string[]): Promise<ActionResult> {
  const gate = await authorize('taxonomy-groups');
  if (!gate.ok) return { ok: false, error: gate.error };
  const db = getDb();
  await db.delete(taxonomyDimensions).where(eq(taxonomyDimensions.taxonomyId, taxonomyId));
  for (const [i, dimensionId] of dimensionIds.entries()) {
    await db.insert(taxonomyDimensions).values({ taxonomyId, dimensionId, order: i });
  }
  await audit('taxonomy.dimensions.set', 'taxonomy', taxonomyId, { count: dimensionIds.length });
  revalidatePath('/', 'layout');
  return { ok: true, id: taxonomyId };
}

export async function setTaxonomyStatus(id: string, status: 'active' | 'archived'): Promise<ActionResult> {
  const gate = await authorize('taxonomy-groups');
  if (!gate.ok) return { ok: false, error: gate.error };
  const db = getDb();
  await db.update(taxonomies).set({ status, updatedAt: new Date() }).where(eq(taxonomies.id, id));
  await audit(`taxonomy.${status === 'archived' ? 'archive' : 'restore'}`, 'taxonomy', id);
  revalidatePath('/', 'layout');
  return { ok: true, id };
}

// ─── Project ↔ taxonomy assignment ───────────────────────────────────

export async function assignTaxonomyToProject(projectId: string, taxonomyId: string): Promise<ActionResult> {
  const gate = await authorize('dimensions', projectId);
  if (!gate.ok) return { ok: false, error: gate.error };
  const db = getDb();
  const user = await requireUser();
  const [existing] = await db.select().from(projectTaxonomies)
    .where(and(eq(projectTaxonomies.projectId, projectId), eq(projectTaxonomies.taxonomyId, taxonomyId)))
    .limit(1);
  if (existing) return { ok: true, id: taxonomyId };

  await db.insert(projectTaxonomies).values({ projectId, taxonomyId, assignedBy: user.id });
  await audit('project.taxonomy.assign', 'project', projectId, { taxonomyId });
  revalidatePath('/', 'layout');
  return { ok: true, id: taxonomyId };
}

export async function unassignTaxonomyFromProject(projectId: string, taxonomyId: string): Promise<ActionResult> {
  const gate = await authorize('dimensions', projectId);
  if (!gate.ok) return { ok: false, error: gate.error };
  const db = getDb();

  // Refuse to silently orphan work already recorded against this taxonomy.
  const dimIds = (await db.select({ id: taxonomyDimensions.dimensionId })
    .from(taxonomyDimensions).where(eq(taxonomyDimensions.taxonomyId, taxonomyId))).map((r) => r.id);
  if (dimIds.length > 0) {
    const [used] = await db.select({ c: sql<number>`count(*)` })
      .from(annotations)
      .innerJoin(fragments, eq(fragments.id, annotations.fragmentId))
      .where(and(eq(fragments.projectId, projectId), inArray(annotations.dimensionId, dimIds)));
    if (Number(used?.c ?? 0) > 0) {
      return { ok: false, error: 'Esta taxonomía ya tiene anotaciones en el proyecto. Archívala en lugar de desasignarla.' };
    }
  }

  await db.delete(projectTaxonomies)
    .where(and(eq(projectTaxonomies.projectId, projectId), eq(projectTaxonomies.taxonomyId, taxonomyId)));
  await audit('project.taxonomy.unassign', 'project', projectId, { taxonomyId });
  revalidatePath('/', 'layout');
  return { ok: true, id: taxonomyId };
}
