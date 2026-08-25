import { getDb } from '@/lib/db';
import { dimensions, dimensionValues, intensityScales, intensityLevels, taxonomies, taxonomyDimensions, users, projectTaxonomies } from '@/lib/db';
import { eq, count, asc, and } from 'drizzle-orm';
import { DIMENSION_KIND_LABELS, type DimensionKind } from '@/lib/dimension-kinds';
import ArchiveButton from './ArchiveButton';

export const dynamic = 'force-dynamic';

/**
 * Maps a dimension slug to one of the 11 mockup colors. The schema
 * does not yet persist a `color` column (tracked as tech debt in
 * STATUS.md), so we pick a stable color from the slug. Editable in
 * the dimension form once the column is added.
 */
const SLUG_TO_TK: Array<[RegExp, string]> = [
  [/odio|toxic/i, 'tk-odio'],
  [/emot/i, 'tk-emot'],
  [/tend/i, 'tk-tend'],
  [/semi/i, 'tk-semi'],
  [/g[eé]nero|gen\b/i, 'tk-gen'],
  [/raza|rac/i, 'tk-race'],
  [/religion|relig/i, 'tk-rel'],
  [/demogr/i, 'tk-demo'],
  [/estad[ií]stic|stat/i, 'tk-stat'],
  [/fact|incoheren/i, 'tk-fact'],
];

function pickColor(slug: string): string {
  for (const [re, tk] of SLUG_TO_TK) {
    if (re.test(slug)) return tk;
  }
  return 'tk-default';
}

export default async function DimensionsCatalogPage() {
  const db = getDb();

  const rows = await db
    .select({
      d: dimensions,
      creator: users,
    })
    .from(dimensions)
    .leftJoin(users, eq(users.id, dimensions.createdBy))
    .orderBy(asc(dimensions.name));

  // Per-dimension values (labels only — the mockup shows the first 3 joined).
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
  // A project includes a dimension if it has at least one taxonomy that
  // contains it. Compute via project_taxonomies + taxonomy_dimensions.
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

  // Counters for the KPIs.
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

      <div className="card" style={{ padding: 0 }}>
        <div className="tax-toolbar" style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)', margin: 0 }}>
          <input type="search" placeholder="Buscar dimensión..." />
          <select>
            <option>Todas las escalas</option>
            <option>3 niveles</option>
            <option>5 niveles</option>
            <option>Likert</option>
            <option>Binario</option>
          </select>
          <select>
            <option>Estado: activas</option>
            <option>Estado: archivadas</option>
            <option>Estado: todas</option>
          </select>
          <a href="/dimensiones/nueva" className="btn primary" style={{ marginLeft: 'auto' }}>
            + Nueva dimensión
          </a>
        </div>

        <div className="tax-grid" style={{ padding: 16 }}>
          {rows.map((r) => {
            const values = valuesByDim.get(r.d.id) ?? [];
            const tCount = txCountByDim.get(r.d.id) ?? 0;
            const pCount = projCountByDim.get(r.d.id)?.size ?? 0;
            const isArchived = r.d.status === 'archived';
            const valuesPreview = values.slice(0, 3).join(' · ');
            const valuesOverflow = values.length > 3 ? `+${values.length - 3}` : '';
            const tk = pickColor(r.d.slug);
            return (
              <div
                key={r.d.id}
                className={`tax-card ${isArchived ? 'is-archived' : ''}`}
              >
                <div className="tax-card-head">
                  <div className={`tax-color ${tk}`}>{r.d.name.charAt(0).toUpperCase()}</div>
                  <div>
                    <h4>{r.d.name}</h4>
                    <p>{r.d.shortDescription || 'Sin descripción breve.'}</p>
                  </div>
                </div>
                <div className="tax-card-meta">
                  <span className="scale-pill">
                    {r.d.kind && DIMENSION_KIND_LABELS[r.d.kind as DimensionKind]
                      ? r.d.kind === 'category'
                        ? 'Categoría'
                        : r.d.kind === 'intensity'
                          ? 'Intensidad'
                          : r.d.kind === 'flag'
                            ? 'Flag'
                            : 'Texto libre'
                      : '—'}
                  </span>
                  {valuesPreview ? (
                    <span className="scale-pill values">{valuesPreview}{valuesOverflow}</span>
                  ) : null}
                  {pCount > 0 ? (
                    <span className="tax-used-pill">
                      {pCount} {pCount === 1 ? 'proyecto' : 'proyectos'}
                    </span>
                  ) : null}
                </div>
                <div className="tax-card-foot">
                  <small>
                    Creada por{' '}
                    <b style={{ color: 'var(--ink-2)' }}>
                      {r.creator?.name || r.creator?.email || '—'}
                    </b>
                  </small>
                  <div className="actions-mini">
                    <a href={`/dimensiones/${r.d.id}`} className="btn-mini">
                      Ver usos
                    </a>
                    <a href={`/dimensiones/${r.d.id}/editar`} className="btn-mini">
                      Editar
                    </a>
                    {!isArchived ? (
                      <ArchiveButton
                        dimensionId={r.d.id}
                        dimensionName={r.d.name}
                        variant="mini"
                      />
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
          {rows.length === 0 && (
            <div className="empty" style={{ gridColumn: '1 / -1' }}>
              No hay dimensiones. Crea la primera con el botón "+ Nueva dimensión".
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
