import type { ReactNode } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { Topbar } from '@/components/Topbar';
import { getCurrentUser, getActiveProjectId } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { projects } from '@/lib/db';
import { eq, desc } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { ACTIVE_PROJECT_COOKIE } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();

  if (!user) {
    // No user — for now, redirect to a login page; in real auth this is enforced
    return (
      <html><body>
        <div style={{ padding: 40, textAlign: 'center' }}>
          <h1>Sin sesión</h1>
          <p>No hay usuario activo. Ve a <a href="/dev/login">/dev/login</a> (temporal, dev only).</p>
        </div>
      </body></html>
    );
  }

  // Load all projects the user is a member of
  const db = getDb();
  const userProjects = await db
    .select()
    .from(projects)
    .orderBy(desc(projects.createdAt));

  const activeProjectId = (await getActiveProjectId()) || userProjects[0]?.id;
  const activeProject = userProjects.find(p => p.id === activeProjectId) || null;

  return (
    <div className="app-shell">
      <Sidebar user={user} />
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Topbar user={user} projects={userProjects} activeProject={activeProject} />
        {children}
      </div>
    </div>
  );
}
