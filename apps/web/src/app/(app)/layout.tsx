import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { Shell } from '@/components/Shell';
import { getSessionContext } from '@/lib/session';
import { getTaggingProgress } from '@/lib/queries';
import { canRead } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { user, role, activeProject, projects } = await getSessionContext();

  // The middleware already blocks anonymous requests; this is the
  // belt-and-braces check for anything that slips past it.
  if (!user) redirect('/login');

  // Counter for the "Etiquetar fragmento" entry. Only worth querying for
  // someone who can actually open that screen in the active project.
  const taggingProgress = activeProject && canRead('tagging', role)
    ? await getTaggingProgress(activeProject.id, user.id)
    : null;

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
      taggingProgress={taggingProgress}
    >
      {children}
    </Shell>
  );
}
