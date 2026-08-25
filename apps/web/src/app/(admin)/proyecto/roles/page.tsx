import { redirect } from 'next/navigation';
import { and, asc, desc, eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { projectMembers, projects, users, USER_ROLES } from '@/db/schema';
import { getCurrentUser } from '@/lib/session';
import InviteForm from './InviteForm';
import MemberRow from './MemberRow';

export const dynamic = 'force-dynamic';

type SP = { projectId?: string };

export default async function RolesPage({ searchParams }: { searchParams: SP }) {
  const me = await getCurrentUser();
  if (!me) redirect('/login');

  const db = getDb();

  // No project selected — show the picker.
  if (!searchParams.projectId) {
    const all = await db
      .select()
      .from(projects)
      .orderBy(desc(projects.createdAt));
    return (
      <main>
        <h1>Roles y equipos</h1>
        <p className="lead">Selecciona un proyecto para gestionar sus miembros y roles.</p>
        <div className="card" style={{ padding: 0 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Proyecto</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {all.map((p) => (
                <tr key={p.id}>
                  <td>
                    <span className="pname">{p.name}</span>
                    <span className="psub">{p.description || '—'}</span>
                  </td>
                  <td>
                    <span className={'badge ' + (p.status === 'active' ? 'green' : 'gray')}>
                      {p.status}
                    </span>
                  </td>
                  <td>
                    <a className="btn sm primary" href={`/proyecto/roles?projectId=${p.id}`}>
                      Abrir →
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    );
  }

  const projectId = searchParams.projectId;
  const projRows = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  const project = projRows[0];
  if (!project) {
    return (
      <main>
        <h1>Proyecto no encontrado</h1>
        <p className="lead">El proyecto <code>{projectId}</code> no existe o fue archivado.</p>
        <a className="btn" href="/proyecto/roles">← Volver al listado</a>
      </main>
    );
  }

  // RBAC: only superadmins and project-admins of THIS project can manage.
  const myMembership = await db
    .select({ role: projectMembers.role })
    .from(projectMembers)
    .where(
      and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, me.id)),
    )
    .limit(1);
  const canManage = !!me.isSuperAdmin || myMembership[0]?.role === 'projectadmin';

  // Members with user details.
  const memberRows = await db
    .select({
      userId: projectMembers.userId,
      role: projectMembers.role,
      createdAt: projectMembers.createdAt,
      name: users.name,
      email: users.email,
      avatarColor: users.avatarColor,
    })
    .from(projectMembers)
    .innerJoin(users, eq(users.id, projectMembers.userId))
    .where(eq(projectMembers.projectId, projectId))
    .orderBy(asc(projectMembers.createdAt));

  return (
    <main>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <h1 style={{ margin: 0 }}>Roles y equipos</h1>
        <a className="btn" href="/proyecto/roles">← Cambiar proyecto</a>
      </div>
      <p className="lead">
        Proyecto <b>{project.name}</b>. {memberRows.length} miembro{memberRows.length === 1 ? '' : 's'}.
      </p>

      {canManage ? (
        <InviteForm projectId={projectId} availableRoles={USER_ROLES as readonly string[]} />
      ) : (
        <div className="card" style={{ background: 'var(--warn-bg)', color: '#5a4400' }}>
          No tienes permiso para invitar o cambiar roles en este proyecto.
        </div>
      )}

      <div className="card" style={{ padding: 0, marginTop: 16 }}>
        <table className="table">
          <thead>
            <tr>
              <th>Persona</th>
              <th>Email</th>
              <th>Rol</th>
              <th>Desde</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {memberRows.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', color: 'var(--ink-3)', padding: 30 }}>
                  Nadie en el proyecto todavía. Invita a alguien con el formulario de arriba.
                </td>
              </tr>
            ) : (
              memberRows.map((m) => (
                <MemberRow
                  key={m.userId}
                  projectId={projectId}
                  userId={m.userId}
                  name={m.name}
                  email={m.email}
                  role={m.role}
                  avatarColor={m.avatarColor}
                  canManage={canManage}
                  isMe={m.userId === me.id}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
