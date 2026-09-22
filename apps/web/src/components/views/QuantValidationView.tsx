'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { TeamValidationRow } from '@/lib/queries';
import { returnPackageToTeam } from '@/app/actions/workflow';
import { BenchRow, EmptyState, Kpi, Progress, num, pct } from './shared';
import { Modal } from './TeamDiscrepanciesView';

const THRESHOLD = 0.12;

const STATUS_STYLE: Record<string, { label: string; bg: string; txt: string; dot: string }> = {
  progress: { label: 'En progreso', bg: '#fdf6e3', txt: '#7d6c4f', dot: 'var(--warn)' },
  ok: { label: 'Aprobado', bg: '#e6f4ec', txt: '#1c6e3a', dot: 'var(--ok)' },
  fail: { label: 'Con discrepancias', bg: '#fbe6e6', txt: '#a13d3d', dot: 'var(--bad)' },
};

/** Quantitative supervision: per-team agreement and the decision to return work. */
export function QuantValidationView({ teams, readOnly = false }: { teams: TeamValidationRow[]; readOnly?: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [detail, setDetail] = useState<TeamValidationRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const visible = teams.filter((t) => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    const q = query.trim().toLowerCase();
    if (q && !t.teamName.toLowerCase().includes(q) && !(t.packageCode ?? '').toLowerCase().includes(q)) return false;
    return true;
  });

  const inProgress = teams.filter((t) => t.status === 'progress').length;
  const approved = teams.filter((t) => t.status === 'ok').length;
  const failing = teams.filter((t) => t.status === 'fail').length;

  const totalComparable = teams.reduce((a, t) => a + t.comparableRatings, 0);
  const totalDiscrepant = teams.reduce((a, t) => a + t.disagreedRatings, 0);
  const agreed = totalComparable - totalDiscrepant;

  async function returnWork(t: TeamValidationRow) {
    if (!t.packageId) return;
    setBusy(t.teamId);
    const res = await returnPackageToTeam(t.packageId, `Discrepancia del ${pct(t.errorRate ?? 0, 1)} sobre el umbral`);
    setBusy(null);
    setNotice(res.ok ? `Trabajo devuelto a ${t.teamName}.` : res.error);
    router.refresh();
  }

  return (
    <div className="page">
      <h1>Validación cuantitativa</h1>
      <p className="lead">
        Supervisión por métricas de acuerdo. Cada equipo anota un paquete espejo y se compara
        anotador contra anotador. La <b>tasa de error</b> es el porcentaje de valoraciones
        (fragmento × dimensión) en desacuerdo — no de fragmentos, que se satura al crecer el número
        de dimensiones. El umbral del proyecto es {pct(THRESHOLD)}.
      </p>

      <div className="grid g-4" style={{ marginBottom: 18 }}>
        <Kpi label="Equipos" value={teams.length} delta={`${teams.filter((t) => t.packageId).length} con paquete`} />
        <Kpi label="En progreso" value={inProgress} tone="warn" delta="sin enviar todavía" />
        <Kpi label="Aprobado" value={approved} tone="ok" delta={`error < ${pct(THRESHOLD)}`} />
        <Kpi label="Con discrepancias" value={failing} tone="bad" delta={`error ≥ ${pct(THRESHOLD)}`} />
      </div>

      {notice && (
        <div style={{ marginBottom: 14, padding: '10px 13px', background: '#e6f4ec',
                      borderLeft: '3px solid var(--ok)', borderRadius: '0 7px 7px 0',
                      fontSize: 12.5, color: '#1c6e3a' }}>{notice}</div>
      )}

      {readOnly && (
        <div style={{ marginBottom: 14, padding: '9px 13px', background: 'var(--surface-2)',
                      border: '1px solid var(--line)', borderLeft: '3px solid var(--ink-3)',
                      borderRadius: '0 7px 7px 0', fontSize: 12.5, color: 'var(--ink-3)' }}>
          Solo lectura: tu rol puede consultar esta pantalla, pero no modificarla.
        </div>
      )}

      <div className="card" style={{ padding: 0 }}>
        <div className="tax-toolbar">
          <input type="search" placeholder="Buscar equipo o paquete..." value={query}
                 onChange={(e) => setQuery(e.target.value)} />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">Todos los estados</option>
            <option value="progress">En progreso</option>
            <option value="ok">Aprobado</option>
            <option value="fail">Con discrepancias</option>
          </select>
        </div>

        <table>
          <thead>
            <tr>
              <th>Equipo</th><th>Paquete</th><th>Fragmentos</th><th>Avance</th>
              <th>Estado</th><th>Tasa de error</th><th>Kappa</th><th />
            </tr>
          </thead>
          <tbody>
            {visible.map((t) => {
              const st = STATUS_STYLE[t.status]!;
              const errColor = t.errorRate === null ? 'var(--ink-3)'
                : t.errorRate < THRESHOLD ? 'var(--ok)' : 'var(--bad)';
              return (
                <tr key={t.teamId}>
                  <td>
                    <b>{t.teamName}</b><br />
                    <small style={{ color: 'var(--ink-3)' }}>{t.members.join(' · ')}</small>
                  </td>
                  <td><code style={{ fontSize: 11.5, background: 'var(--surface-2)', padding: '1px 6px', borderRadius: 3 }}>
                    {t.packageCode ?? '—'}
                  </code></td>
                  <td>{t.fragmentDone} / {t.fragmentTotal}</td>
                  <td><Progress value={t.progress} width={90}
                                tone={t.status === 'ok' ? 'ok' : t.status === 'fail' ? 'bad' : 'warn'} /></td>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px',
                                   borderRadius: 11, background: st.bg, color: st.txt, fontSize: 11.5, fontWeight: 500 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: st.dot }} />
                      {st.label}
                    </span>
                  </td>
                  <td style={{ fontWeight: 600, color: errColor }}>
                    {t.errorRate === null ? '—' : pct(t.errorRate, 1)}
                  </td>
                  <td>{t.kappa === null ? '—' : t.kappa.toFixed(2).replace('.', ',')}</td>
                  <td style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                    <button className="btn-mini" onClick={() => setDetail(t)} title="Ver discrepancias por dimensión">
                      Desglose
                    </button>
                    {t.status === 'fail' && !readOnly ? (
                      <button className="btn-mini danger" disabled={busy === t.teamId} onClick={() => returnWork(t)}>
                        {busy === t.teamId ? '…' : 'Devolver'}
                      </button>
                    ) : <span style={{ color: 'var(--ink-4)', fontSize: 11 }}>—</span>}
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr><td colSpan={8} style={{ padding: 30, textAlign: 'center', color: 'var(--ink-3)' }}>
                No hay equipos que coincidan con el filtro.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h3 style={{ marginTop: 0 }}>Acuerdo global del proyecto</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px', gap: 14, alignItems: 'center' }}>
          <div>
            <div className="progress" style={{ height: 10 }}>
              <div className="bar" style={{
                width: `${totalComparable ? Math.round((agreed / totalComparable) * 100) : 0}%`,
                background: 'linear-gradient(90deg,var(--ok),#1e6a44)',
              }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11,
                          color: 'var(--ink-3)', marginTop: 4 }}>
              <span>{num(agreed)} / {num(totalComparable)} valoraciones con acuerdo</span>
              <span>{totalComparable ? pct(agreed / totalComparable) : '—'}</span>
            </div>
          </div>
          <a className="btn primary" style={{ whiteSpace: 'nowrap', justifyContent: 'center' }} href="/validacion">
            Ir a validación cualitativa →
          </a>
        </div>
        <div style={{ display: 'flex', gap: 14, marginTop: 12, paddingTop: 12,
                      borderTop: '1px solid var(--line-soft)', fontSize: 11.5, color: 'var(--ink-3)', flexWrap: 'wrap' }}>
          <span><b style={{ color: 'var(--ok)', fontSize: 13 }}>{approved}</b> aprobados</span>
          <span><b style={{ color: 'var(--bad)', fontSize: 13 }}>{failing}</b> con discrepancias</span>
          <span><b style={{ color: 'var(--ink-1)', fontSize: 13 }}>{num(totalDiscrepant)}</b> valoraciones en desacuerdo</span>
        </div>
      </div>

      {detail && (
        <Modal title="Validación cuantitativa"
               subtitle={`${detail.teamName} · ${detail.packageCode ?? '—'}`}
               right={`Acuerdo global: ${detail.errorRate === null ? '—' : pct(1 - detail.errorRate, 1)}`}
               onClose={() => setDetail(null)} maxWidth={880}>
          <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 600 }}>Discrepancias por dimensión</h3>
          {detail.byDimension.length === 0 ? (
            <EmptyState title="Sin datos comparables">
              Este equipo todavía no tiene fragmentos anotados por dos o más personas.
            </EmptyState>
          ) : (
            detail.byDimension.map((d) => (
              <BenchRow key={d.dimensionId} label={d.name} pct={d.pct}
                        display={`${pct(d.pct)} (${d.disagreed}/${d.comparable})`} />
            ))
          )}
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--line-soft)',
                        fontSize: 12.5, color: 'var(--ink-3)' }}>
            {detail.disagreedRatings} de {detail.comparableRatings} valoraciones en desacuerdo
            ({detail.discrepantFragments} de {detail.comparableFragments} fragmentos tienen al menos
            una). Kappa del equipo:{' '}
            <b style={{ color: 'var(--ink-1)' }}>
              {detail.kappa === null ? '—' : detail.kappa.toFixed(2).replace('.', ',')}
            </b>.
          </div>
        </Modal>
      )}
    </div>
  );
}
