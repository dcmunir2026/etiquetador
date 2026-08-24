import { getDb } from '@/lib/db';
import { projects, projectMembers, users } from '@/lib/db';
import { eq, desc, count, sql } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function ProjectsPage() {
  const user = await getCurrentUser();
  const db = getDb();

  const allProjects = await db.select().from(projects).orderBy(desc(projects.createdAt));

  // Member counts per project
  const memberCounts = await db
    .select({ projectId: projectMembers.projectId, count: count() })
    .from(projectMembers)
    .groupBy(projectMembers.projectId);
  const memberCountByProject = new Map(memberCounts.map(r => [r.projectId, Number(r.count)]));

  return (
    <main>
      <h1>Proyectos</h1>
      <p className="lead">Listado de todos los proyectos. Haz clic en uno para abrirlo.</p>

      <div className="card" style={{ padding: 0 }}>
        <table className="table">
          <thead>
            <tr>
              <th>Proyecto</th>
              <th>Estado</th>
              <th>Miembros</th>
              <th>Creado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {allProjects.map(p => (
              <tr key={p.id}>
                <td>
                  <span className="pname">{p.name}</span>
                  <span className="psub">{p.description || '—'}</span>
                </td>
                <td>
                  <span className={'badge ' + (p.status === 'active' ? 'green' : 'gray')}>{p.status}</span>
                </td>
                <td>{memberCountByProject.get(p.id) ?? 0}</td>
                <td>{p.createdAt ? new Date(p.createdAt).toLocaleDateString('es') : '—'}</td>
                <td>
                  <a href={`/proyecto/taxonomias?projectId=${p.id}`} className="btn sm">Abrir →</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 18, fontSize: 12, color: 'var(--ink-3)' }}>
        Sesión activa: <b>{user?.name || user?.email}</b> ({user?.isSuperAdmin ? 'superadmin' : 'project admin'}).
      </div>
    </main>
  );
}
