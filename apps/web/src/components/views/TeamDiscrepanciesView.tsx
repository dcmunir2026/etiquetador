'use client';

import { useState } from 'react';
import type { DiscrepantFragment, TeamValidationRow } from '@/lib/queries';
import { loadFragmentBreakdown, loadTeamDiscrepancies } from '@/app/actions/reads';
import { EmptyState, Kpi, num, pct } from './shared';

type Breakdown = Awaited<ReturnType<typeof loadFragmentBreakdown>>;

function levelOf(p: number): { label: string; color: string } {
  if (p >= 0.3) return { label: 'Alto', color: 'var(--bad)' };
  if (p >= 0.15) return { label: 'Medio', color: 'var(--warn)' };
  return { label: 'Bajo', color: 'var(--ok)' };
}

/**
 * Fragments where a team's annotators failed to reach consensus, with a
 * read-only per-annotator breakdown.
 */
export function TeamDiscrepanciesView({ teams }: { teams: TeamValidationRow[] }) {
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState('all');
  const [openTeam, setOpenTeam] = useState<TeamValidationRow | null>(null);
  const [fragments, setFragments] = useState<DiscrepantFragment[] | null>(null);
  const [breakdown, setBreakdown] = useState<Breakdown | null>(null);
  const [loading, setLoading] = useState(false);

  const withData = teams.filter((t) => t.comparableFragments > 0);
  const visible = withData.filter((t) => {
    const p = t.errorRate ?? 0;
    if (level === 'high' && p < 0.3) return false;
    if (level === 'mid' && (p < 0.15 || p >= 0.3)) return false;
    if (level === 'low' && p >= 0.15) return false;
    const q = query.trim().toLowerCase();
    if (q && !t.teamName.toLowerCase().includes(q) && !(t.packageCode ?? '').toLowerCase().includes(q)) return false;
    return true;
  });

  const totalDiscrepant = withData.reduce((a, t) => a + t.discrepantFragments, 0);
  const totalComparable = withData.reduce((a, t) => a + t.comparableFragments, 0);
  // Averaged over ratings, consistent with the threshold used elsewhere.
  const avg = withData.reduce((a, t) => a + t.comparableRatings, 0) > 0
    ? withData.reduce((a, t) => a + t.disagreedRatings, 0) / withData.reduce((a, t) => a + t.comparableRatings, 0)
    : 0;
  const worst = withData.reduce<TeamValidationRow | null>(
    (best, t) => (!best || (t.errorRate ?? 0) > (best.errorRate ?? 0) ? t : best), null);

  async function openTeamModal(team: TeamValidationRow) {
    setOpenTeam(team);
    setLoading(true);
    setFragments(await loadTeamDiscrepancies(team.teamId));
    setLoading(false);
  }

  async function openBreakdown(fragmentId: string) {
    if (!openTeam) return;
    setLoading(true);
    setBreakdown(await loadFragmentBreakdown(openTeam.teamId, fragmentId));
    setLoading(false);
  }

  return (
    <div className="page">
      <h1>Discrepancias de equipos</h1>
      <p className="lead">
        Fragmentos en los que los anotadores de un mismo equipo no llegaron a consenso en al menos
        una dimensión. El desglose es de solo lectura: para forzar una decisión final, usa la
        validación cualitativa.
      </p>

      <div className="kpi-row kpi-row--compact">
        <Kpi small label="Equipos" value={withData.length} delta={`de ${teams.length} totales`} />
        <Kpi small label="Frag. discrepantes" value={num(totalDiscrepant)} tone="warn"
             delta={`de ${num(totalComparable)} comparables`} />
        <Kpi small label="% valoraciones" value={pct(avg, 1)} tone={avg >= 0.12 ? 'bad' : 'ok'}
             delta="en desacuerdo, sobre el total" />
        <Kpi small label="Mayor %" value={worst ? pct(worst.errorRate ?? 0, 1) : '—'} tone="bad"
             delta={worst ? `${worst.teamName} · ${worst.discrepantFragments} frags` : '—'} />
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="tax-toolbar">
          <input type="search" placeholder="Buscar equipo o paquete..." value={query}
                 onChange={(e) => setQuery(e.target.value)} />
          <select value={level} onChange={(e) => setLevel(e.target.value)}>
            <option value="all">Todos los niveles</option>
            <option value="high">Alto (≥30%)</option>
            <option value="mid">Medio (15-29%)</option>
            <option value="low">Bajo (&lt;15%)</option>
          </select>
        </div>

        <table>
          <thead>
            <tr>
              <th>Equipo</th><th>Paquete</th><th>Anotadores</th>
              <th>Frag. discrepantes</th><th>%</th><th>Nivel</th>
              <th style={{ textAlign: 'right' }}>Acción</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((t) => {
              const lv = levelOf(t.errorRate ?? 0);
              return (
                <tr key={t.teamId}>
                  <td><b>{t.teamName}</b></td>
                  <td><code style={{ fontSize: 11.5, background: 'var(--surface-2)', padding: '1px 6px', borderRadius: 3 }}>
                    {t.packageCode ?? '—'}
                  </code></td>
                  <td><small style={{ color: 'var(--ink-3)' }}>{t.members.join(' · ')}</small></td>
                  <td>{t.discrepantFragments} / {t.comparableFragments}</td>
                  <td style={{ fontWeight: 600, color: lv.color }}>{pct(t.errorRate ?? 0, 1)}</td>
                  <td><span style={{ color: lv.color, fontWeight: 500, fontSize: 12 }}>{lv.label}</span></td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn-mini" onClick={() => openTeamModal(t)}>Ver fragmentos</button>
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 30, textAlign: 'center', color: 'var(--ink-3)' }}>
                No hay equipos que coincidan con el filtro.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {openTeam && (
        <Modal title="Discrepancias de equipos" subtitle={`${openTeam.teamName} · ${openTeam.packageCode ?? '—'}`}
               right={`${openTeam.discrepantFragments} fragmentos · ${pct(openTeam.errorRate ?? 0, 1)}`}
               onClose={() => { setOpenTeam(null); setFragments(null); }} maxWidth={1080}>
          <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 600 }}>
            Fragmentos con discrepancia entre anotadores
          </h3>
          {loading && !fragments ? (
            <p style={{ color: 'var(--ink-3)' }}>Cargando…</p>
          ) : (fragments?.length ?? 0) === 0 ? (
            <EmptyState title="Sin discrepancias">Este equipo coincide en todos los fragmentos.</EmptyState>
          ) : (
            <table>
              <thead>
                <tr><th>#</th><th>Pregunta</th><th>Dimensiones discrepantes</th>
                    <th>Nivel</th><th style={{ textAlign: 'right' }}>Acción</th></tr>
              </thead>
              <tbody>
                {fragments!.map((f) => (
                  <tr key={f.fragmentId}>
                    <td>{String(f.index).padStart(3, '0')}</td>
                    <td style={{ maxWidth: 340, fontSize: 12.5, color: 'var(--ink-2)' }}>
                      {f.question ?? f.text.slice(0, 90)}
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {f.dims.map((d) => <span key={d.dimensionId} className="scale-pill">{d.name}</span>)}
                      </div>
                    </td>
                    <td>
                      <span style={{ color: f.dims.length >= 3 ? 'var(--bad)' : f.dims.length === 2 ? 'var(--warn)' : 'var(--ok)',
                                     fontWeight: 500, fontSize: 12 }}>
                        {f.dims.length} {f.dims.length === 1 ? 'dimensión' : 'dimensiones'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn-mini" onClick={() => openBreakdown(f.fragmentId)}>Ver desglose</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Modal>
      )}

      {breakdown && openTeam && (
        <Modal title={openTeam.teamName} subtitle={breakdown.fragment?.question ?? 'Desglose por anotador'}
               onClose={() => setBreakdown(null)} maxWidth={1100}>
          <div style={{ background: '#e3eef5', border: '1px solid #c2dde4', borderLeft: '3px solid #1d6e75',
                        padding: '10px 14px', borderRadius: '0 6px 6px 0', marginBottom: 14,
                        fontSize: 12.5, color: '#1a3a3f' }}>
            <b>Vista de consulta:</b> se muestra el etiquetado de cada anotador del equipo. Los valores en{' '}
            <span style={{ background: '#fbe6e6', padding: '1px 6px', borderRadius: 3, color: '#a13d3d', fontWeight: 600 }}>
              rojo
            </span>{' '}
            difieren del consenso mayoritario. Esta vista es de solo lectura.
          </div>
          <table style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
            <thead>
              <tr>
                <th>Dimensión</th>
                {breakdown.annotators.map((a) => <th key={a}>{a}</th>)}
                <th>Consenso</th>
              </tr>
            </thead>
            <tbody>
              {breakdown.dims.map((d) => (
                <tr key={d.dimensionId}>
                  <td><b style={{ fontSize: 12.5 }}>{d.name}</b></td>
                  {breakdown.annotators.map((a) => {
                    const v = d.values[a] ?? '—';
                    const differs = v !== d.consensus;
                    return (
                      <td key={a}>
                        <span style={differs
                          ? { background: '#fbe6e6', padding: '1px 6px', borderRadius: 3, color: '#a13d3d', fontWeight: 600 }
                          : undefined}>{v}</span>
                      </td>
                    );
                  })}
                  <td><b>{d.consensus}</b> <small style={{ color: 'var(--ink-3)' }}>({d.agree}/{d.total})</small></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18, paddingTop: 14,
                        borderTop: '1px solid var(--line-soft)' }}>
            <small style={{ color: 'var(--ink-3)' }}>
              Vista de solo lectura. Para forzar decisiones finales, usa Validación cualitativa.
            </small>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function Modal({ title, subtitle, right, children, onClose, maxWidth = 900 }: {
  title: string; subtitle?: string; right?: string; children: React.ReactNode;
  onClose: () => void; maxWidth?: number;
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,23,30,0.55)', zIndex: 71,
                  backdropFilter: 'blur(2px)', overflowY: 'auto' }}>
      <div style={{ background: 'var(--surface)', width: '100%', maxWidth, margin: '24px auto',
                    borderRadius: 14, display: 'flex', flexDirection: 'column',
                    maxHeight: 'calc(100vh - 48px)', overflow: 'hidden', border: '1px solid var(--line)' }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--line-soft)',
                      display: 'flex', alignItems: 'center', gap: 14 }}>
          <button className="btn ghost" onClick={onClose} style={{ padding: '6px 10px' }}>← Volver</button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em',
                          color: 'var(--ink-3)', fontWeight: 600 }}>{title}</div>
            {subtitle && <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink-1)' }}>{subtitle}</div>}
          </div>
          {right && <div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>{right}</div>}
        </div>
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: '1 1 auto', minHeight: 0, background: 'var(--bg)' }}>
          {children}
        </div>
      </div>
    </div>
  );
}
