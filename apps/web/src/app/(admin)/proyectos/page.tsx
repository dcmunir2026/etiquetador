import { getDb } from '@/lib/db';
import { projects, projectMembers } from '@/lib/db';
import { desc, count } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/session';
import NewProjectForm from './NewProjectForm';
import ArchiveButton from './ArchiveButton';

export const dynamic = 'force-dynamic';

export default async function ProjectsPage() {
  const user = await getCurrentUser();
  const db = getDb();

  const allProjects = await db
    .select()
    .from(projects)
    .orderBy(desc(projects.createdAt));

  // Member counts per project.
  const memberCounts = await db
    .select({ projectId: projectMembers.projectId, count: count() })
    .from(projectMembers)
    .groupBy(projectMembers.projectId);
  const memberCountByProject = new Map(memberCounts.map((r) => [r.projectId, Number(r.count)]));

  const canCreate = !!user?.isSuperAdmin;
  const active = allProjects.filter((p) => p.status === 'active');
  const archived = allProjects.filter((p) => p.status === 'archived');

  return (
    <main>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <h1 style={{ margin: 0 }}>Proyectos</h1>
        <NewProjectForm canCreate={canCreate} />
      </div>
      <p className="lead">Listado de todos los proyectos. Haz clic en uno para abrirlo.</p>

      <div className="card" style={{ padding: 0 }}>
        <table className="table">
          <thead>
            <tr>
              <th>Proyecto</th>
              <th>Estado</th>
              <th>Miembros</th>
              <th>Slug</th>
              <th>Creado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {active.map((p) => (
              <tr key={p.id}>
                <td>
                  <span className="pname">{p.name}</span>
                  <span className="psub">{p.description || '—'}</span>
                </td>
                <td>
                  <span className="badge green">activo</span>
                </td>
                <td>{memberCountByProject.get(p.id) ?? 0}</td>
                <td>
                  <code style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{p.slug}</code>
                </td>
                <td>{p.createdAt ? new Date(p.createdAt).toLocaleDateString('es') : '—'}</td>
                <td style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <a href={`/proyecto/taxonomias?projectId=${p.id}`} className="btn sm">Abrir →</a>
                  {canCreate ? <ArchiveButton projectId={p.id} projectName={p.name} /> : null}
                </td>
              </tr>
            ))}
            {active.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', color: 'var(--ink-3)', padding: 30 }}>
                  No hay proyectos activos. Crea uno con el botón de arriba.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {archived.length > 0 ? (
        <details style={{ marginTop: 24 }}>
          <summary style={{ cursor: 'pointer', color: 'var(--ink-3)', fontSize: 13, marginBottom: 8 }}>
            Archivados ({archived.length})
          </summary>
          <div className="card" style={{ padding: 0 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Proyecto</th>
                  <th>Archivado</th>
                </tr>
              </thead>
              <tbody>
                {archived.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <span className="pname">{p.name}</span>
                      <span className="psub">{p.description || '—'}</span>
                    </td>
                    <td>{p.updatedAt ? new Date(p.updatedAt).toLocaleDateString('es') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}

      <div style={{ marginTop: 18, fontSize: 12, color: 'var(--ink-3)' }}>
        Sesión activa: <b>{user?.name || user?.email}</b> ({user?.isSuperAdmin ? 'superadmin' : 'project admin'}).
      </div>
    </main>
  );
}
