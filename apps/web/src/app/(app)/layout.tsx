import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { Shell } from '@/components/Shell';
import { getSessionContext } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { user, role, activeProject, projects } = await getSessionContext();

  // The middleware already blocks anonymous requests; this is the
  // belt-and-braces check for anything that slips past it.
  if (!user) redirect('/login');

  return (
    <Shell
      user={{
        name: user.name,
        email: user.email,
        isSuperAdmin: user.isSuperAdmin,
        color: user.avatarColor,
      }}
      role={role}
      projects={projects}
      activeProject={activeProject}
    >
      {children}
    </Shell>
  );
}
