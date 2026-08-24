import { getDb } from '@/lib/db';
import { taxonomies, dimensions, taxonomyDimensions, users } from '@/lib/db';
import { sql, eq, count, desc, asc } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

const COLORS: Record<string, string> = {
  rose: 'linear-gradient(135deg,#7a1a1c,#b04143)',
  amber: 'linear-gradient(135deg,#5a4400,#8a6300)',
  cyan: 'linear-gradient(135deg,#0d4a5a,#1a7088)',
  violet: 'linear-gradient(135deg,#3d2a4d,#5a4080)',
};

const TK_COLOR: Record<string, string> = {
  'tk-odio':'#d97757','tk-emot':'#a85a35','tk-tend':'#7d6c4f','tk-semi':'#3d8268',
  'tk-gen':'#5b8fb8','tk-race':'#8b6db5','tk-rel':'#c79d3c','tk-demo':'#9c5b8b',
  'tk-stat':'#5a7d8f','tk-toxic':'#7a1a1c','tk-fact':'#1c6e3a',
};

export default async function TaxonomiesGroupsPage() {
  const db = getDb();

  const rows = await db
    .select({ t: taxonomies, creator: users })
    .from(taxonomies)
    .leftJoin(users, eq(users.id, taxonomies.createdBy))
    .where(eq(taxonomies.status, 'active'))
    .orderBy(asc(taxonomies.name));

  // For each taxonomy, fetch its dimensions
  const txDims = await db
    .select({ txId: taxonomyDimensions.taxonomyId, d: dimensions })
    .from(taxonomyDimensions)
    .innerJoin(dimensions, eq(dimensions.id, taxonomyDimensions.dimensionId))
    .orderBy(asc(taxonomyDimensions.order), asc(dimensions.name));
  const dimsByTx: Record<string, Array<{ id: string; name: string; kind: string | null }>> = {};
  for (const r of txDims) {
    const bucket = dimsByTx[r.txId] ?? (dimsByTx[r.txId] = []);
    bucket.push({ id: r.d.id, name: r.d.name, kind: r.d.kind });
  }

  // Counts
  const [activeCount] = await db.select({ c: count() }).from(taxonomies).where(eq(taxonomies.status, 'active'));
  const [totalAss] = await db.select({ c: count() }).from(taxonomyDimensions);

  return (
    <main>
      <h1>Taxonomías</h1>
      <p className="lead">
        Agrupa dimensiones en paquetes conceptuales y asígnalas como conjunto a los proyectos. Una dimensión puede vivir en varias taxonomías.
      </p>

      <div className="grid g-2" style={{ marginBottom: 18 }}>
        <div className="kpi">
          <div className="label">Taxonomías activas</div>
          <div className="value">{activeCount?.c ?? 0}</div>
          <div className="delta">0 archivadas</div>
        </div>
        <div className="kpi">
          <div className="label">Asignaciones totales</div>
          <div className="value">{totalAss?.c ?? 0}</div>
          <div className="delta">dimensión × taxonomía</div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px' }}>
          <input type="search" placeholder="Buscar taxonomía..." style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 13, background: 'var(--surface-2)' }} />
          <button className="btn primary" style={{ marginLeft: 'auto' }}>+ Nueva taxonomía</button>
        </div>
      </div>

      <div>
        {rows.map((r) => {
          const dims = dimsByTx[r.t.id] || [];
          const initial = r.t.name.charAt(0).toUpperCase();
          return (
            <div key={r.t.id} style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 11, marginBottom: 14, overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, borderBottom: '1px solid var(--line-soft)' }}>
                <div className="av-lg" style={{ background: COLORS[r.t.color || 'cyan'] || COLORS.cyan }}>
                  {initial}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--ink-1)' }}>{r.t.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{r.t.shortDescription}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: 'var(--ink-3)' }}><b style={{ color: 'var(--ink-1)', fontSize: 18, display: 'block' }}>{dims.length}</b>dimensiones</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: 'var(--ink-3)' }}><b style={{ color: 'var(--ink-1)', fontSize: 18, display: 'block' }}>0</b>proyectos</div>
                </div>
                <button className="btn sm">Archivar</button>
                <button className="btn primary sm">Asignar a proyecto</button>
              </div>
              <div style={{ padding: '12px 18px', background: 'var(--surface-2)', display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {dims.map((d) => (
                  <span key={d.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: '#fff', border: '1px solid var(--line)', borderRadius: 14, fontSize: 11.5, color: 'var(--ink-1)', fontWeight: 500 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: TK_COLOR[d.kind || ''] || '#7d6c4f' }} />
                    {d.name}
                  </span>
                ))}
                {dims.length === 0 && <span style={{ fontSize: 11.5, color: 'var(--ink-4)', fontStyle: 'italic' }}>Sin dimensiones todavía. Añade alguna.</span>}
              </div>
            </div>
          );
        })}
        {rows.length === 0 && (
          <div className="empty">No hay taxonomías. Crea la primera con el botón "+ Nueva taxonomía".</div>
        )}
      </div>
    </main>
  );
}
