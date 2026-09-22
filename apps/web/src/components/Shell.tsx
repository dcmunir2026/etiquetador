'use client';

import { useState, useTransition, ReactNode, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { VIEW_FROM_PATH, PATH_FROM_VIEW } from '@/lib/views';
import type { Role } from '@/lib/permissions';

type Project = { id: string; name: string; slug: string; description: string | null };
export type ShellUser = {
  name: string; email: string; isSuperAdmin: boolean; color: string | null;
};

export function Shell({
  user, role, projects, activeProject, children,
}: {
  user: ShellUser;
  role: Role | null;
  projects: Project[];
  activeProject: Project | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();
  const [view, setView] = useState<string>(() => VIEW_FROM_PATH[pathname] ?? 'dashboard');

  useEffect(() => {
    setView(VIEW_FROM_PATH[pathname] ?? 'dashboard');
  }, [pathname]);

  function navigate(v: string) {
    setView(v);
    startTransition(() => router.push((PATH_FROM_VIEW[v] ?? '/') as never));
  }

  async function pickProject(projectId: string) {
    await fetch('/api/active-project', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId }),
    });
    // The role is per project, so switching one re-renders the whole shell.
    router.refresh();
  }

  return (
    <div className="app">
      <Sidebar
        currentView={view}
        onNavigate={navigate}
        user={user}
        role={role}
        project={activeProject}
      />
      <main>
        <Topbar
          currentView={view}
          projects={projects}
          activeProject={activeProject}
          onPickProject={pickProject}
          canCreateProject={user.isSuperAdmin}
        />
        {children}
      </main>
    </div>
  );
}
