import { getDb } from '@/lib/db';
import { dimensions, dimensionValues, intensityScales, intensityLevels, taxonomies, taxonomyDimensions, users } from '@/lib/db';
import { sql, eq, count, desc, asc } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

const TK_COLOR: Record<string, string> = {
  'tk-odio':'#d97757','tk-emot':'#a85a35','tk-tend':'#7d6c4f','tk-semi':'#3d8268',
  'tk-gen':'#5b8fb8','tk-race':'#8b6db5','tk-rel':'#c79d3c','tk-demo':'#9c5b8b',
  'tk-stat':'#5a7d8f','tk-toxic':'#7a1a1c','tk-fact':'#1c6e3a',
};

function tkToHex(tk: string | null | undefined): string {
  if (!tk) return '#7d6c4f';
  return TK_COLOR[tk] || '#7d6c4f';
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
    .where(eq(dimensions.status, 'active'))
    .orderBy(asc(dimensions.name));

  // Count taxonomies that contain each dimension
  const txCounts = await db
    .select({
      dimensionId: taxonomyDimensions.dimensionId,
      count: count(),
    })
    .from(taxonomyDimensions)
    .groupBy(taxonomyDimensions.dimensionId);
  const txCountByDim = new Map(txCounts.map(r => [r.dimensionId, Number(r.count)]));

  // Counts
  const [totalActive] = await db.select({ c: count() }).from(dimensions).where(eq(dimensions.status, 'active'));
  const [totalArchived] = await db.select({ c: count() }).from(dimensions).where(eq(dimensions.status, 'archived'));
  const [totalAss] = await db.select({ c: count() }).from(taxonomyDimensions);

  return (
    <main>
      <h1>Dimensiones</h1>
      <p className="lead">
        Listado global de dimensiones disponibles. Cada dimensión es un atributo anotable. Agrúpala en una <a href="/taxonomias">taxonomía</a> y asígnala a los proyectos. Solo el super admin puede crear, editar o archivar.
      </p>

      <div className="grid g-2" style={{ marginBottom: 18 }}>
        <div className="kpi">
          <div className="label">Dimensiones activas</div>
          <div className="value">{totalActive?.c ?? 0}</div>
          <div className="delta">{totalArchived?.c ?? 0} archivada(s)</div>
        </div>
        <div className="kpi">
          <div className="label">Asignaciones totales</div>
          <div className="value">{totalAss?.c ?? 0}</div>
          <div className="delta">a taxonomías</div>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--line)' }}>
          <input type="search" placeholder="Buscar dimensión..." style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 13, background: 'var(--surface-2)' }} />
          <select style={{ padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 13, background: 'var(--surface-2)' }}>
            <option>Todas las escalas</option>
            <option>3 niveles</option>
            <option>5 niveles</option>
            <option>Likert</option>
            <option>Binario</option>
          </select>
          <select style={{ padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 13, background: 'var(--surface-2)' }}>
            <option>Estado: activas</option>
            <option>Estado: archivadas</option>
            <option>Todas</option>
          </select>
          <a href="/dimensiones/nueva" className="btn primary" style={{ marginLeft: 'auto' }}>+ Nueva dimensión</a>
        </div>

        <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
          {rows.map((r) => {
            const tCount = txCountByDim.get(r.d.id) ?? 0;
            const initial = r.d.name.charAt(0).toUpperCase();
            return (
              <div key={r.d.id} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 16, background: 'var(--surface)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <div className="av-lg" style={{ background: tkToHex(r.d.kind) }}>
                    {initial}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink-1)' }}>{r.d.name}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>3 niveles · 3 valores</div>
                  </div>
                </div>
                <p style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5, margin: '0 0 10px' }}>
                  {r.d.shortDescription || 'Sin descripción breve.'}
                </p>
                <div style={{ display: 'flex', gap: 5, marginBottom: 10, flexWrap: 'wrap' }}>
                  <span className="badge gray">3 niveles</span>
                  <span className="badge gray">3 valores</span>
                  <span className="badge blue">{tCount} {tCount === 1 ? 'taxonomía' : 'taxonomías'}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink-4)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>Creada por <b style={{ color: 'var(--ink-2)' }}>{r.creator?.name || r.creator?.email || '—'}</b></span>
                  <span>· hace 12 días</span>
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
                  <a href={`/dimensiones/${r.d.id}`} className="btn sm">Ver usos</a>
                  <a href={`/dimensiones/${r.d.id}/editar`} className="btn sm" style={{ marginLeft: 'auto' }}>Editar</a>
                </div>
              </div>
            );
          })}
          {rows.length === 0 && (
            <div className="empty" style={{ gridColumn: '1 / -1' }}>
              No hay dimensiones activas. Crea la primera con el botón "+ Nueva dimensión".
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
