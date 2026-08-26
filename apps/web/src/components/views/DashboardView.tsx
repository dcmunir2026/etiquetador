'use client';
import type { ViewData } from './ViewRouter';

export function DashboardView({ data, onNavigate }: { data: ViewData; onNavigate?: (v: string) => void }) {
  return (
    <div className="page">
      <h1>Proyectos de etiquetado</h1>
      <p className="lead">Vista global del estado de los proyectos activos. Cada proyecto atraviesa cinco etapas: definición, carga, configuración, etiquetado y consolidación.</p>

      <div className="grid g-4" style={{ marginBottom: 24 }}>
        <div className="kpi"><div className="label">Proyectos activos</div><div className="value">{data.projects.length}</div><div className="delta up">+1 vs. mes anterior</div></div>
        <div className="kpi"><div className="label">Fragmentos cargados</div><div className="value">3.662</div><div className="delta">3.074 de Reader T2</div></div>
        <div className="kpi"><div className="label">Etiquetadores</div><div className="value">12</div><div className="delta">4 equipos · 6 roles</div></div>
        <div className="kpi"><div className="label">Kappa global</div><div className="value">0,82</div><div className="delta down">−0,03 vs. ronda 1</div></div>
      </div>

      <div className="card">
        <h3>Proyectos recientes <span className="count">{data.projects.length} activos</span></h3>
        <table>
          <thead><tr><th>Proyecto</th><th>Estado</th><th>Fragmentos</th><th>Avance</th><th>Equipo</th><th>Creado</th><th></th></tr></thead>
          <tbody>
            {data.projects.map((p: any, i: number) => {
              const status = i === 0 ? 'progress' : i === 1 ? 'done' : 'todo';
              const statusLabel = i === 0 ? 'En etiquetado' : i === 1 ? 'Validado' : 'En configuración';
              const statusColor = i === 0 ? 'var(--warn)' : i === 1 ? 'var(--ok)' : 'var(--ink-3)';
              const fragments = i === 0 ? '1.847 / 3.662' : i === 1 ? '1.224 / 1.224' : '0 / 200';
              const progress = i === 0 ? '50%' : i === 1 ? '100%' : '8%';
              const team = i === 0 ? '6 personas' : i === 1 ? '5 personas' : '3 personas';
              const created = i === 0 ? 'hace 2 días' : i === 1 ? 'hace 2 meses' : 'ayer';
              const action = i === 0 ? 'tagging' : i === 1 ? 'reporte' : 'dimensions';
              const actionLabel = i === 0 ? 'Abrir →' : i === 1 ? 'Reporte →' : 'Configurar →';
              return (
                <tr key={p.id}>
                  <td>
                    <b>{p.name}</b>
                    <br />
                    <small style={{ color: 'var(--ink-3)' }}>{p.description || '—'}</small>
                  </td>
                  <td>
                    <span className={`tag status-${status}`}>
                      <span className="dot" style={{ background: statusColor }}></span>
                      {statusLabel}
                    </span>
                  </td>
                  <td>{fragments}</td>
                  <td>
                    <div className="progress" style={{ width: 130 }}>
                      <div className="bar" style={{ width: progress, ...(i === 1 ? { background: 'linear-gradient(90deg,var(--ok),#1e6a44)' } : {}) }}></div>
                    </div>
                    <small style={{ color: 'var(--ink-3)', fontSize: 11, marginLeft: 8 }}>{progress}</small>
                  </td>
                  <td>{team}</td>
                  <td><small style={{ color: 'var(--ink-3)' }}>{created}</small></td>
                  <td>
                    <button className="btn ghost" onClick={() => onNavigate?.(action)}>{actionLabel}</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
