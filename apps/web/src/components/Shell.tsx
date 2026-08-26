'use client';

import { useState, useTransition, ReactNode, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { Modals } from './modals/Modals';

type Project = { id: string; name: string; slug: string; description: string | null; color?: string };
type User = { name?: string; email: string; isSuperAdmin?: boolean } | null | undefined;

const VIEW_FROM_PATH: Record<string, string> = {
  '/': 'dashboard',
  '/proyectos': 'dashboard',
  '/cargar-excel': 'upload',
  '/dimensiones': 'taxonomies',
  '/taxonomias': 'taxonomy-groups',
  '/proyecto/taxonomias': 'dimensions',
  '/proyecto/roles': 'roles',
  '/proyecto/paquetes': 'paquetes',
  '/proyecto/segmentacion': 'segmentation',
  '/etiquetar': 'tagging',
  '/discrepancias': 'discrepancias',
  '/validacion': 'validacion',
  '/reporte': 'reporte',
  '/kappa': 'kappa',
  '/login': 'login',
};

const PATH_FROM_VIEW: Record<string, string> = Object.fromEntries(
  Object.entries(VIEW_FROM_PATH).map(([k, v]) => [v, k])
);

export function Shell({ user, projects, activeProject, children }: { user: User; projects: Project[]; activeProject: Project | null; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();
  const initialView = VIEW_FROM_PATH[pathname] || 'dashboard';
  const [view, setView] = useState<string>(initialView);

  useEffect(() => {
    setView(VIEW_FROM_PATH[pathname] || 'dashboard');
  }, [pathname]);

  function navigate(v: string) {
    setView(v);
    const path = PATH_FROM_VIEW[v] || '/';
    startTransition(() => router.push(path));
  }

  async function pickProject(projectId: string) {
    await fetch('/api/active-project', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId }),
    });
    router.refresh();
  }

  return (
    <div className="app">
      <Sidebar currentView={view} onNavigate={navigate} user={user} project={activeProject} />
      <main>
        <Topbar currentView={view} projects={projects} activeProject={activeProject} onPickProject={pickProject} />
        {children}
        <Modals />
      </main>
    </div>
  );
}
