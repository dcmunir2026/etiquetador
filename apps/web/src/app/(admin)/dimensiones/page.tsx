import { getDb } from '@/lib/db';
import { dimensions, dimensionValues, intensityScales, intensityLevels, taxonomies, taxonomyDimensions, users, projectTaxonomies } from '@/lib/db';
import { eq, count, asc } from 'drizzle-orm';
import DimensionsCatalog from './_components/DimensionsCatalog';
import type { DimensionCard, Scale } from './_components/types';
import type { DimensionKind } from '@/lib/dimension-kinds';

export const dynamic = 'force-dynamic';

export default async function DimensionsCatalogPage() {
  const db = getDb();

  const dimRows = await db
    .select({ d: dimensions, creator: users })
    .from(dimensions)
    .leftJoin(users, eq(users.id, dimensions.createdBy))
    .orderBy(asc(dimensions.name));

  const allValues = await db
    .select()
    .from(dimensionValues)
    .orderBy(asc(dimensionValues.dimensionId), asc(dimensionValues.order));
  const valuesByDim = new Map<string, string[]>();
  for (const v of allValues) {
    const arr = valuesByDim.get(v.dimensionId) ?? (valuesByDim.set(v.dimensionId, []).get(v.dimensionId)!);
    arr.push(v.label);
  }

  // Per-dimension count of taxonomies that contain it.
  const txCounts = await db
    .select({ dimensionId: taxonomyDimensions.dimensionId, count: count() })
    .from(taxonomyDimensions)
    .groupBy(taxonomyDimensions.dimensionId);
  const txCountByDim = new Map(txCounts.map((r) => [r.dimensionId, Number(r.count)]));

  // Per-dimension count of projects that include it (via taxonomy assignment).
  const projCounts = await db
    .select({
      dimensionId: taxonomyDimensions.dimensionId,
      projectId: projectTaxonomies.projectId,
    })
    .from(taxonomyDimensions)
    .innerJoin(
      projectTaxonomies,
      eq(projectTaxonomies.taxonomyId, taxonomyDimensions.taxonomyId),
    );
  const projCountByDim = new Map<string, Set<string>>();
  for (const r of projCounts) {
    const set = projCountByDim.get(r.dimensionId) ?? projCountByDim.set(r.dimensionId, new Set()).get(r.dimensionId)!;
    set.add(r.projectId);
  }

  const scaleRows = await db
    .select()
    .from(intensityScales)
    .orderBy(asc(intensityScales.name));
  const levelRows = await db
    .select()
    .from(intensityLevels)
    .orderBy(asc(intensityLevels.scaleId), asc(intensityLevels.order));
  const scales: Scale[] = scaleRows.map((s) => ({
    id: s.id,
    name: s.name,
    kind: s.kind,
    levels: levelRows
      .filter((lv) => lv.scaleId === s.id)
      .map((lv) => ({ label: lv.label, value: lv.value, order: lv.order })),
  }));

  const cards: DimensionCard[] = dimRows.map((r) => ({
    id: r.d.id,
    name: r.d.name,
    slug: r.d.slug,
    kind: r.d.kind as DimensionKind,
    status: r.d.status === 'archived' ? 'archived' : 'active',
    shortDescription: r.d.shortDescription,
    creatorName: r.creator?.name ?? null,
    creatorEmail: r.creator?.email ?? null,
    values: valuesByDim.get(r.d.id) ?? [],
    taxonomyCount: txCountByDim.get(r.d.id) ?? 0,
    projectCount: projCountByDim.get(r.d.id)?.size ?? 0,
  }));

  const [activeRows] = await db.select({ c: count() }).from(dimensions).where(eq(dimensions.status, 'active'));
  const [archivedRows] = await db.select({ c: count() }).from(dimensions).where(eq(dimensions.status, 'archived'));
  const [totalAss] = await db.select({ c: count() }).from(taxonomyDimensions);

  return (
    <main>
      <h1>Dimensiones</h1>
      <p className="lead">
        Listado global de dimensiones disponibles. Cada dimensión es un atributo anotable que
        se carga en los proyectos al anotar. Agrupa varias dimensiones en una{' '}
        <a href="/taxonomias">taxonomía</a> para asignarlas como conjunto. Solo el super admin
        puede crear, editar o archivar.
      </p>

      <div className="grid g-2" style={{ marginBottom: 18 }}>
        <div className="kpi">
          <div className="label">Dimensiones activas</div>
          <div className="value">{activeRows?.c ?? 0}</div>
          <div className="delta">{archivedRows?.c ?? 0} archivada(s)</div>
        </div>
        <div className="kpi">
          <div className="label">Asignaciones totales</div>
          <div className="value">{totalAss?.c ?? 0}</div>
          <div className="delta">dimensión × taxonomía</div>
        </div>
      </div>

      <DimensionsCatalog cards={cards} scales={scales} />
    </main>
  );
}
