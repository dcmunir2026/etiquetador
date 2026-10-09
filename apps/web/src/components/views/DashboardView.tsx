'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ProjectSummary } from '@/lib/queries';
import { kappaLabel } from '@/lib/metrics';
import { PATH_FROM_VIEW } from '@/lib/views';
import { Kpi, Progress, StatusTag, ago, num } from './shared';
import { deleteProject } from '@/app/actions/projects';

type Data = {
  projects: ProjectSummary[];
  totals: { activeProjects: number; fragments: number; annotators: number; teams: number; kappa: number | null };
};

type Props = {
  data: Data;
  /** Only superadmins see the per-row delete button and can act on it. */
  currentUserIsSuperAdmin: boolean;
};

/** A project's stage, inferred from what actually exists for it. */
function stageOf(p: ProjectSummary): { status: string; label: string } {
  if (p.status === 'archived') return { status: 'archived', label: 'Archivado' };
  if (p.fragmentCount === 0) return { status: 'assigned', label: 'En configuración' };
  if (p.progress >= 1) return { status: 'approved', label: 'Validado' };
  if (p.annotatedCount > 0) return { status: 'in_progress', label: 'En etiquetado' };
  return { status: 'assigned', label: 'En configuración' };
}

export function DashboardView({ data, currentUserIsSuperAdmin }: Props) {
  const router = useRouter();
  const { projects, totals } = data;
  // Local mirror so the row disappears immediately on success — the
  // server's revalidatePath catches up next tick.
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set());
  const [deleting, setDeleting] = useState<ProjectSummary | null>(null);

  async function open(projectId: string, view: string) {
    await fetch('/api/active-project', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId }),
    });
    router.push((PATH_FROM_VIEW[view] ?? '/') as never);
    router.refresh();
  }

  const visible = projects.filter((p) => !hiddenIds.has(p.id));

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
            {visible.map((p) => {
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
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn ghost" onClick={() => open(p.id, next)}>{nextLabel}</button>
                    {currentUserIsSuperAdmin && (
                      <button
                        type="button"
                        className="btn-mini"
                        title={`Eliminar ${p.name}`}
                        aria-label={`Eliminar ${p.name}`}
                        style={{ marginLeft: 6, color: 'var(--bad)' }}
                        onClick={() => setDeleting(p)}
                      >
                        Eliminar
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 30, textAlign: 'center', color: 'var(--ink-3)' }}>
                {projects.length === 0
                  ? 'Todavía no hay proyectos.'
                  : 'Todos los proyectos visibles han sido eliminados.'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {deleting && (
        <DeleteProjectDialog
          project={deleting}
          onClose={() => setDeleting(null)}
          onDone={() => {
            setHiddenIds((prev) => {
              const next = new Set(prev);
              next.add(deleting.id);
              return next;
            });
            setDeleting(null);
            // If we just removed the active project, force a refresh so the
            // topbar / gate fall back to the picker instead of holding a
            // phantom id in the cookie.
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

/**
 * Confirmation dialog that asks the superadmin to retype the project's
 * name before letting the destructive action through.
 *
 * The button stays disabled until the typed value exactly matches
 * `project.name` (trimmed, case-sensitive). The server re-checks — this
 * client-side gate is just a UX nicety so a stray keystroke doesn't
 * nuke the project.
 */
function DeleteProjectDialog({ project, onClose, onDone }: {
  project: ProjectSummary;
  onClose: () => void;
  onDone: () => void;
}) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matches = typed.trim() === project.name;

  async function confirm() {
    if (!matches) return;
    setBusy(true);
    setError(null);
    const res = await deleteProject(project.id, typed);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    onDone();
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,23,30,0.45)', zIndex: 60,
                  backdropFilter: 'blur(2px)', overflowY: 'auto' }}>
      <div className="picker-card" style={{ marginTop: 80, textAlign: 'left', maxWidth: 520 }}>
        <h2 style={{ textAlign: 'center' }}>Eliminar proyecto</h2>
        <p className="lead" style={{ textAlign: 'center' }}>
          Esta acción es <b>permanente</b> y no se puede deshacer.
        </p>

        <div style={{ background: '#fdecea', border: '1px solid #f5c2c0', borderLeft: '3px solid #c0392b',
                      padding: '12px 14px', borderRadius: '0 6px 6px 0', marginBottom: 14,
                      fontSize: 13, color: '#7b1f1a' }}>
          Vas a eliminar <b>{project.name}</b> ({project.slug}). Se borrarán
          también sus {project.memberCount} miembro(s), todos los fragmentos,
          anotaciones, validaciones, equipos y paquetes asociados.
        </div>

        <div className="wiz-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <label>
            Para confirmar, escribe el nombre del proyecto: <code>{project.name}</code>
          </label>
          <input
            type="text"
            value={typed}
            onChange={(e) => { setTyped(e.target.value); setError(null); }}
            placeholder={project.name}
            autoFocus
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        {error && (
          <div style={{ fontSize: 12.5, color: 'var(--bad)', marginTop: 10 }}>{error}</div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16,
                      paddingTop: 14, borderTop: '1px solid var(--line-soft)' }}>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={confirm}
            disabled={!matches || busy}
            style={{ background: matches ? 'var(--bad)' : undefined, borderColor: matches ? 'var(--bad)' : undefined }}
          >
            {busy ? 'Eliminando…' : 'Eliminar proyecto'}
          </button>
        </div>
      </div>
    </div>
  );
}
