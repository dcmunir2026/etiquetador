import { getDb } from '@/lib/db';
import { projects, projectMembers, dimensions, taxonomies, projectTaxonomies, intensityScales, intensityLevels } from '@/lib/db';
import { sql, eq, count, desc, inArray, and } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const db = getDb();

  // Project metrics
  const [projCount] = await db.select({ count: count() }).from(projects).where(eq(projects.status, 'active'));

  // Total fragments annotated (placeholder for now; will be wired when we have annotations table)
  // For now show dimensions count + taxonomies count as KPI placeholder
  const [dimCount] = await db.select({ count: count() }).from(dimensions).where(eq(dimensions.status, 'active'));
  const [taxCount] = await db.select({ count: count() }).from(taxonomies).where(eq(taxonomies.status, 'active'));

  // Real projects list (superadmin sees all; regular user sees only their memberships)
  const projectList = user?.isSuperAdmin
    ? await db.select().from(projects).orderBy(desc(projects.createdAt))
    : (await db.select({ p: projects })
        .from(projectMembers)
        .innerJoin(projects, eq(projects.id, projectMembers.projectId))
        .where(eq(projectMembers.userId, user!.id))
        .orderBy(desc(projects.createdAt))).map((r) => r.p);

  return (
    <main>
      <h1>Proyectos de etiquetado</h1>
      <p className="lead">
        Vista global del estado de los proyectos activos. Cada proyecto atraviesa cinco etapas: definición, carga, configuración, etiquetado y consolidación.
      </p>

      <div className="grid g-4" style={{ marginBottom: 18 }}>
        <div className="kpi">
          <div className="label">Proyectos activos</div>
          <div className="value">{projCount?.count ?? 0}</div>
          <div className="delta pos">+1 vs. mes anterior</div>
        </div>
        <div className="kpi">
          <div className="label">Fragmentos cargados</div>
          <div className="value">3.662</div>
          <div className="delta">3.074 de Reader T2</div>
        </div>
        <div className="kpi">
          <div className="label">Dimensiones activas</div>
          <div className="value">{dimCount?.count ?? 0}</div>
          <div className="delta">+1 vs. mes anterior</div>
        </div>
        <div className="kpi">
          <div className="label">Kappa global</div>
          <div className="value">0,82</div>
          <div className="delta neg">−0,03 vs. ronda 1</div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Proyectos recientes</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Proyecto</th>
              <th>Estado</th>
              <th>Fragmentos</th>
              <th>Avance</th>
              <th>Equipo</th>
              <th>Creado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {projectList.map((p) => (
              <tr key={p.id}>
                <td>
                  <span className="pname">{p.name}</span>
                  <span className="psub">{p.description || '—'}</span>
                </td>
                <td>
                  <span className="badge green">activo</span>
                </td>
                <td>0 / 0</td>
                <td>
                  <div className="bar" style={{ width: 100 }}>
                    <div style={{ width: '0%' }} />
                  </div>
                </td>
                <td>1 persona</td>
                <td>hoy</td>
                <td>
                  <a href={`/proyecto/taxonomias`} className="btn sm">Abrir →</a>
                </td>
              </tr>
            ))}
            {projectList.length === 0 && (
              <tr>
                <td colSpan={7}>
                  <div className="empty">No hay proyectos todavía. <a href="/proyectos">Crea el primero</a>.</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
