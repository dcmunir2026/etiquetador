'use client';

import { useRouter } from 'next/navigation';
import type { ProjectSummary } from '@/lib/queries';
import { kappaLabel } from '@/lib/metrics';
import { PATH_FROM_VIEW } from '@/lib/views';
import { Kpi, Progress, StatusTag, ago, num } from './shared';

type Data = {
  projects: ProjectSummary[];
  totals: { activeProjects: number; fragments: number; annotators: number; teams: number; kappa: number | null };
};

/** A project's stage, inferred from what actually exists for it. */
function stageOf(p: ProjectSummary): { status: string; label: string } {
  if (p.status === 'archived') return { status: 'archived', label: 'Archivado' };
  if (p.fragmentCount === 0) return { status: 'assigned', label: 'En configuración' };
  if (p.progress >= 1) return { status: 'approved', label: 'Validado' };
  if (p.annotatedCount > 0) return { status: 'in_progress', label: 'En etiquetado' };
  return { status: 'assigned', label: 'En configuración' };
}

export function DashboardView({ data }: { data: Data }) {
  const router = useRouter();
  const { projects, totals } = data;

  async function open(projectId: string, view: string) {
    await fetch('/api/active-project', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId }),
    });
    router.push((PATH_FROM_VIEW[view] ?? '/') as never);
    router.refresh();
  }

  return (
    <div className="page">
      <h1>Proyectos de etiquetado</h1>
      <p className="lead">
        Vista global del estado de los proyectos activos. Cada proyecto atraviesa cinco etapas:
        definición, carga, configuración, etiquetado y consolidación.
      </p>

      <div className="grid g-4" style={{ marginBottom: 24 }}>
        <Kpi label="Proyectos activos" value={totals.activeProjects} delta={`${projects.length} en total`} />
        <Kpi label="Fragmentos cargados" value={num(totals.fragments)} delta={`${totals.teams} equipos`} />
        <Kpi label="Etiquetadores" value={totals.annotators} delta="con anotaciones registradas" />
        <Kpi
          label="Kappa global"
          value={totals.kappa === null ? '—' : totals.kappa.toFixed(2).replace('.', ',')}
          delta={kappaLabel(totals.kappa)}
        />
      </div>

      <div className="card">
        <h3>
          Proyectos recientes
          <span className="count">{totals.activeProjects} activos</span>
        </h3>
        <table>
          <thead>
            <tr>
              <th>Proyecto</th><th>Estado</th><th>Fragmentos</th><th>Avance</th>
              <th>Equipo</th><th>Creado</th><th />
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => {
              const stage = stageOf(p);
              const next = p.fragmentCount === 0 ? 'dimensions' : p.progress >= 1 ? 'reporte' : 'tagging';
              const nextLabel = p.fragmentCount === 0 ? 'Configurar →' : p.progress >= 1 ? 'Reporte →' : 'Abrir →';
              return (
                <tr key={p.id}>
                  <td>
                    <b>{p.name}</b>
                    <br />
                    <small style={{ color: 'var(--ink-3)' }}>{p.description ?? '—'}</small>
                  </td>
                  <td>
                    <span className={`tag ${stage.status === 'approved' ? 'status-done' : stage.status === 'in_progress' ? 'status-progress' : 'status-todo'}`}>
                      <span className="dot" style={{ background: stage.status === 'approved' ? 'var(--ok)' : stage.status === 'in_progress' ? 'var(--warn)' : 'var(--ink-3)' }} />
                      {stage.label}
                    </span>
                  </td>
                  <td>{num(p.annotatedCount)} / {num(p.fragmentCount)}</td>
                  <td><Progress value={p.progress} tone={p.progress >= 1 ? 'ok' : undefined} /></td>
                  <td>{p.memberCount} personas</td>
                  <td><small style={{ color: 'var(--ink-3)' }}>{ago(p.createdAt)}</small></td>
                  <td>
                    <button className="btn ghost" onClick={() => open(p.id, next)}>{nextLabel}</button>
                  </td>
                </tr>
              );
            })}
            {projects.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 30, textAlign: 'center', color: 'var(--ink-3)' }}>
                Todavía no hay proyectos.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
