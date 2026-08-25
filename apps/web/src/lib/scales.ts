'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { intensityScales, intensityLevels, auditLog } from '@/db/schema';
import { SCALE_KINDS } from '@/db/schema';
import { getCurrentUser } from '@/lib/session';

/**
 * Server action: create a custom intensity scale + its levels.
 * Only superadmins may create custom scales (they are global, shared
 * across all projects and dimensions).
 *
 * Input shape:
 *   {
 *     name: string,                          // 2-80 chars, unique
 *     kind: ScaleKind,                        // 'category' | 'numerical' | …
 *     levels: Array<{ label, value }>,        // ≥ 1, ≤ 20 entries, order derived
 *   }
 *
 * Returns { ok, scale? , error? }.
 */
export type CreateScaleResult =
  | {
      ok: true;
      scale: {
        id: string;
        name: string;
        kind: string;
        levels: { label: string; value: string; order: number }[];
      };
    }
  | { ok: false; error: string };

type LevelInput = { label?: unknown; value?: unknown };

function cleanLevel(input: LevelInput): { label: string; value: string } | null {
  const label = String(input.label ?? '').trim();
  const value = String(input.value ?? '').trim();
  if (!label || !value) return null;
  return { label, value };
}

function defaultValueFromLabel(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

export async function createIntensityScale(
  input: unknown,
): Promise<CreateScaleResult> {
  try {
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: 'No autenticado' };
    if (!user.isSuperAdmin) {
      return { ok: false, error: 'Solo el superadmin puede crear escalas' };
    }

    if (!input || typeof input !== 'object') {
      return { ok: false, error: 'Datos inválidos' };
    }
    const raw = input as Record<string, unknown>;

    const name = String(raw.name ?? '').trim();
    if (name.length < 2 || name.length > 80) {
      return { ok: false, error: 'El nombre debe tener entre 2 y 80 caracteres' };
    }
    const kind = String(raw.kind ?? '');
    if (!(SCALE_KINDS as readonly string[]).includes(kind)) {
      return { ok: false, error: 'Tipo de escala no válido' };
    }
    if (!Array.isArray(raw.levels)) {
      return { ok: false, error: 'La escala debe tener al menos un valor' };
    }
    if (raw.levels.length === 0) {
      return { ok: false, error: 'La escala debe tener al menos un valor' };
    }
    if (raw.levels.length > 20) {
      return { ok: false, error: 'La escala no puede tener más de 20 valores' };
    }

    // Build, de-dup and clean levels.
    const seenLabels = new Set<string>();
    const seenValues = new Set<string>();
    const levels: { label: string; value: string }[] = [];
    for (const rawLevel of raw.levels as LevelInput[]) {
      const cleaned = cleanLevel(rawLevel);
      if (!cleaned) continue;
      const lkey = cleaned.label.toLowerCase();
      const vkey = cleaned.value.toLowerCase();
      if (seenLabels.has(lkey)) {
        return { ok: false, error: `Etiqueta duplicada: "${cleaned.label}"` };
      }
      if (seenValues.has(vkey)) {
        return { ok: false, error: `Valor interno duplicado: "${cleaned.value}"` };
      }
      seenLabels.add(lkey);
      seenValues.add(vkey);
      levels.push(cleaned);
    }
    if (levels.length === 0) {
      return { ok: false, error: 'La escala debe tener al menos un valor válido' };
    }

    const db = getDb();

    // Uniqueness check on scale name.
    const existing = await db
      .select({ id: intensityScales.id })
      .from(intensityScales)
      .where(eq(intensityScales.name, name))
      .limit(1);
    if (existing[0]) {
      return { ok: false, error: 'Ya existe una escala con ese nombre' };
    }

    const [scale] = await db
      .insert(intensityScales)
      .values({
        name,
        kind: kind as typeof intensityScales.$inferInsert.kind,
        isCustom: true,
        createdBy: user.id,
      })
      .returning();
    if (!scale) {
      return { ok: false, error: 'No se pudo crear la escala' };
    }

    const createdLevels = levels.map((lv, i) => ({
      scaleId: scale.id,
      label: lv.label,
      value: lv.value || defaultValueFromLabel(lv.label),
      order: i,
    }));
    await db.insert(intensityLevels).values(createdLevels);

    await db.insert(auditLog).values({
      actorId: user.id,
      projectId: null,
      action: 'scale.create',
      targetType: 'intensity_scale',
      targetId: scale.id,
      metadata: JSON.stringify({ name, kind, levelCount: createdLevels.length }),
    });

    revalidatePath('/dimensiones');

    return {
      ok: true,
      scale: {
        id: scale.id,
        name: scale.name,
        kind: scale.kind,
        levels: createdLevels.map((lv) => ({
          label: lv.label,
          value: lv.value,
          order: lv.order,
        })),
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error desconocido' };
  }
}
