'use client';

import { useRouter } from 'next/navigation';

type Project = { id: string; name: string; slug: string; description: string | null };

export function projectColor(slug: string): string {
  if (slug.startsWith('epdata-2026q3') || slug.startsWith('epdata-2026q2')) return 'linear-gradient(135deg,#0e4a52,#1d6e75)';
  if (slug.startsWith('epdata-sint')) return 'linear-gradient(135deg,#5a4400,#8a6300)';
  if (slug.startsWith('ods-2026')) return 'linear-gradient(135deg,#7a1a1c,#b04143)';
  return 'linear-gradient(135deg,#3a4256,#6b6f7d)';
}

export function projectTag(slug: string): string {
  if (slug.startsWith('epdata')) return 'E';
  if (slug.startsWith('ods')) return 'O';
  return '·';
}

/**
 * Shown instead of a project-scoped view when no project is active.
 * Picking one here sets the cookie and reloads the view.
 */
export function ProjectGate({ projects, view }: { projects: Project[]; view: string }) {
  const router = useRouter();

  async function pick(projectId: string) {
    await fetch('/api/active-project', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId }),
    });
    router.refresh();
  }

  return (
    <div className="picker-card">
      <svg className="ic-big" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      </svg>
      <h2>Elige el proyecto a configurar</h2>
      <p className="lead">Esta sección se configura por proyecto. Selecciona con cuál quieres trabajar.</p>
      <div className="picker-list">
        {projects.map((p) => (
          <div key={p.id} className="picker-row" onClick={() => pick(p.id)}>
            <div className="av" style={{ background: projectColor(p.slug) }}>{projectTag(p.slug)}</div>
            <div className="meta">
              <b>{p.name}</b>
              <small>{p.description ?? '—'}</small>
            </div>
            <svg className="arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </div>
        ))}
        {projects.length === 0 && (
          <div className="empty-state" style={{ margin: 0 }}>
            <h4>No hay proyectos</h4>
            Crea un proyecto desde la barra superior para empezar.
          </div>
        )}
      </div>
      <button className="btn" onClick={() => router.push('/')}>Volver al inicio</button>
      <p style={{ fontSize: 11.5, color: 'var(--ink-4)', marginTop: 12 }}>
        Sección solicitada: <code>{view}</code>
      </p>
    </div>
  );
}
