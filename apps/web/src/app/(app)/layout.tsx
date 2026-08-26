import { ReactNode } from 'react';
import { Shell } from '@/components/Shell';
import { getCurrentUser } from '@/lib/auth';
import { getDb } from '@/db/client';
import { projects } from '@/db/schema';
import { cookies } from 'next/headers';
import { ACTIVE_PROJECT_COOKIE } from '@/lib/auth';
import { desc } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  const db = getDb();
  const allProjects = await db.select().from(projects).orderBy(desc(projects.createdAt));
  const activeProjectId = cookies().get(ACTIVE_PROJECT_COOKIE)?.value || null;
  const activeProject = allProjects.find(p => p.id === activeProjectId) || null;

  return (
    <Shell
      user={user ? { name: user.name ?? undefined, email: user.email, isSuperAdmin: user.isSuperAdmin ?? false } : null}
      projects={allProjects}
      activeProject={activeProject}
    >
      {children}
    </Shell>
  );
}
