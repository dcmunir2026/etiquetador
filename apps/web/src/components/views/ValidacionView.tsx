'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { QualSampleFragment, QualTeamRow } from '@/lib/queries';
import { loadQualSample } from '@/app/actions/reads';
import { approveQualFragment, buildQualSample, correctQualFragment } from '@/app/actions/workflow';
import { EmptyState, Kpi, Progress, ago, num, pct } from './shared';
import { Modal } from './TeamDiscrepanciesView';

const STATUS_STYLE: Record<string, { label: string; bg: string; txt: string; dot: string }> = {
  pending: { label: 'Pendiente', bg: '#f3f4f6', txt: '#6b7280', dot: 'var(--ink-3)' },
  progress: { label: 'En curso', bg: '#fdf6e3', txt: '#7d6c4f', dot: 'var(--warn)' },
  done: { label: 'Completado', bg: '#e6f4ec', txt: '#1c6e3a', dot: 'var(--ok)' },
};

/** Qualitative review: a sample per team, approved or corrected label by label. */
export function ValidacionView({ projectId, teams, readOnly = false }: { projectId: string; teams: QualTeamRow[]; readOnly?: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [openTeam, setOpenTeam] = useState<QualTeamRow | null>(null);
  const [sample, setSample] = useState<QualSampleFragment[] | null>(null);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const visible = teams.filter((t) => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    const q = query.trim().toLowerCase();
    if (q && !t.teamName.toLowerCase().includes(q)) return false;
    return true;
  });

  const total = teams.reduce((a, t) => a + t.total, 0);
  const reviewed = teams.reduce((a, t) => a + t.reviewed, 0);
  const corrected = teams.reduce((a, t) => a + t.corrected, 0);

  async function open(team: QualTeamRow) {
    setOpenTeam(team);
    setBusy(true);
    const rows = await loadQualSample(team.teamId);
    setSample(rows);
    // Start on the first fragment still awaiting a decision.
    const firstPending = rows.findIndex((r) => r.status === 'pending');
    setIndex(firstPending === -1 ? 0 : firstPending);
    setBusy(false);
  }

  async function makeSample(team: QualTeamRow) {
    setBusy(true);
    const res = await buildQualSample({ projectId, teamId: team.teamId, percent: 10 });
    setBusy(false);
    setNotice(res.ok ? `Muestra generada para ${team.teamName}.` : res.error);
    router.refresh();
  }

  async function refreshSample() {
    if (!openTeam) return;
    setSample(await loadQualSample(openTeam.teamId));
    router.refresh();
  }

  const current = sample?.[index] ?? null;

  return (
    <div className="page">
      <h1>Validación cualitativa</h1>
      <p className="lead">
        Muestreo sistemático por equipo. El validador revisa el etiquetado consensuado de cada
        fragmento y decide si es correcto o lo corrige etiqueta a etiqueta. Las correcciones quedan
        registradas junto al valor original.
      </p>

      <div className="grid g-4" style={{ marginBottom: 18 }}>
        <Kpi label="Equipos a validar" value={teams.length} delta={`${teams.filter((t) => t.total > 0).length} con muestra`} />
        <Kpi label="Muestra total" value={num(total)} delta="fragmentos seleccionados" />
        <Kpi label="Revisados" value={num(reviewed)} tone="ok"
             delta={total ? `${pct(reviewed / total)} del total` : '—'} />
        <Kpi label="Corregidos" value={num(corrected)} tone="warn"
             delta={reviewed ? `${pct(corrected / reviewed)} de los revisados` : '—'} />
      </div>

      {notice && (
        <div style={{ marginBottom: 14, padding: '10px 13px', background: 'var(--surface-2)',
                      borderLeft: '3px solid var(--primary-2)', borderRadius: '0 7px 7px 0',
                      fontSize: 12.5 }}>{notice}</div>
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
          <input type="search" placeholder="Buscar equipo..." value={query} onChange={(e) => setQuery(e.target.value)} />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">Todos los estados</option>
            <option value="progress">En curso</option>
            <option value="done">Completado</option>
            <option value="pending">Pendiente</option>
          </select>
        </div>

        <table>
          <thead>
            <tr>
              <th>Equipo</th><th>Paquete</th><th>Muestra</th><th>Revisados</th>
              <th>Pendientes</th><th>Estado</th><th>Última rev.</th><th />
            </tr>
          </thead>
          <tbody>
            {visible.map((t) => {
              const st = STATUS_STYLE[t.status]!;
              return (
                <tr key={t.teamId}>
                  <td>
                    <b>{t.teamName}</b><br />
                    <small style={{ color: 'var(--ink-3)' }}>{t.members.join(' · ')}</small>
                  </td>
                  <td><code style={{ fontSize: 11.5, background: 'var(--surface-2)', padding: '1px 6px', borderRadius: 3 }}>
                    {t.packageCode ?? '—'}
                  </code></td>
                  <td>{t.total}</td>
                  <td>
                    <Progress value={t.total ? t.reviewed / t.total : 0} width={90}
                              tone={t.status === 'done' ? 'ok' : 'warn'} />
                  </td>
                  <td>{t.pending}</td>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px',
                                   borderRadius: 11, background: st.bg, color: st.txt, fontSize: 11.5, fontWeight: 500 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: st.dot }} />
                      {st.label}
                    </span>
                  </td>
                  <td><small style={{ color: 'var(--ink-3)' }}>{ago(t.lastReview)}</small></td>
                  <td>
                    {t.total === 0 ? (
                      <button className="btn-mini" disabled={busy || readOnly} onClick={() => makeSample(t)}>
                        Generar muestra
                      </button>
                    ) : (
                      <button className="btn-mini primary-mini" onClick={() => open(t)}>
                        {readOnly ? 'Consultar →' : 'Revisar →'}
                      </button>
                    )}
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

      <div className="card" style={{ marginTop: 14, background: '#fdf6e3', border: '1px solid #e8d59a',
                                     borderLeft: '3px solid var(--warn)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#5a4400' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <div>
            <b>Decisión agregada:</b> si un equipo acumula muchas correcciones en su muestra, devuelve
            su paquete desde <a href="/validacion-cuantitativa" style={{ color: '#5a4400', fontWeight: 600 }}>
            validación cuantitativa</a> para una nueva ronda de etiquetado.
          </div>
        </div>
      </div>

      {openTeam && (
        <Modal title="Validación cualitativa" subtitle={openTeam.teamName}
               right={sample ? `Fragmento ${index + 1} de ${sample.length}` : '—'}
               onClose={() => { setOpenTeam(null); setSample(null); }} maxWidth={1080}>
          {busy && !sample ? (
            <p style={{ color: 'var(--ink-3)' }}>Cargando muestra…</p>
          ) : !current ? (
            <EmptyState title="Muestra vacía">Genera una muestra para este equipo.</EmptyState>
          ) : (
            <QualFragmentPanel
              readOnly={readOnly}
              fragment={current}
              onDone={async () => { await refreshSample(); setIndex((i) => Math.min(i + 1, (sample?.length ?? 1) - 1)); }}
            />
          )}

          {sample && sample.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--line-soft)' }}>
              <button className="btn" onClick={() => setIndex(Math.max(0, index - 1))} disabled={index === 0}>
                ← Anterior
              </button>
              <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                {sample.filter((s) => s.status !== 'pending').length} revisados ·{' '}
                {sample.filter((s) => s.status === 'pending').length} pendientes
              </span>
              <button className="btn" onClick={() => setIndex(Math.min(sample.length - 1, index + 1))}
                      disabled={index >= sample.length - 1}>
                Siguiente →
              </button>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

/** One fragment under review, with an inline correction matrix. */
function QualFragmentPanel({ fragment, onDone, readOnly = false }: {
  fragment: QualSampleFragment; onDone: () => void; readOnly?: boolean;
}) {
  const [correcting, setCorrecting] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(fragment.labels.map((l) => [l.dimensionId, fragment.corrections[l.dimensionId] ?? l.value])),
  );
  const [reason, setReason] = useState(fragment.rejectReason ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function approve() {
    setBusy(true);
    await approveQualFragment(fragment.validationId);
    setBusy(false);
    onDone();
  }

  async function saveCorrection() {
    setBusy(true);
    setError(null);
    const res = await correctQualFragment({
      validationId: fragment.validationId,
      corrections: fragment.labels.map((l) => ({
        dimensionId: l.dimensionId,
        originalValue: l.value,
        correctedValue: values[l.dimensionId] ?? l.value,
      })),
      reason,
    });
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    setCorrecting(false);
    onDone();
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 14 }}>
        <h3 style={{ marginTop: 0 }}>
          Fragmento
          <span className={`tag ${fragment.status === 'approved' ? 'status-done'
            : fragment.status === 'corrected' ? 'status-progress' : 'status-todo'}`}
                style={{ marginLeft: 'auto' }}>
            {fragment.status === 'approved' ? 'Aprobado'
              : fragment.status === 'corrected' ? 'Corregido' : 'Pendiente'}
          </span>
        </h3>
        {fragment.question && (
          <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: '0 0 8px' }}>
            <b style={{ color: 'var(--ink-2)' }}>Pregunta:</b> {fragment.question}
          </p>
        )}
        <div className="context-box" style={{ maxHeight: 180, overflowY: 'auto' }}>{fragment.answer}</div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>
          Etiquetado del equipo
          <span className="count">{fragment.labels.length} dimensiones</span>
        </h3>

        {fragment.labels.length === 0 ? (
          <p style={{ color: 'var(--ink-3)', fontSize: 13 }}>Este fragmento no tiene etiquetas consensuadas.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Dimensión</th><th>Valor del equipo</th>{correcting && <th>Corrección</th>}</tr>
            </thead>
            <tbody>
              {fragment.labels.map((l) => {
                const changed = correcting && (values[l.dimensionId] ?? l.value) !== l.value;
                return (
                  <tr key={l.dimensionId}>
                    <td><b style={{ fontSize: 12.5 }}>{l.name}</b></td>
                    <td>
                      <span style={fragment.corrections[l.dimensionId] && !correcting
                        ? { textDecoration: 'line-through', color: 'var(--ink-4)' } : undefined}>
                        {l.value}
                      </span>
                      {fragment.corrections[l.dimensionId] && !correcting && (
                        <> → <b style={{ color: 'var(--warn)' }}>{fragment.corrections[l.dimensionId]}</b></>
                      )}
                    </td>
                    {correcting && (
                      <td>
                        {l.options.length > 0 ? (
                          <select value={values[l.dimensionId] ?? l.value}
                                  onChange={(e) => setValues({ ...values, [l.dimensionId]: e.target.value })}
                                  style={{ padding: '5px 9px', border: `1px solid ${changed ? '#b58300' : 'var(--line)'}`,
                                           borderRadius: 6, fontSize: 13,
                                           background: changed ? '#fdf8e8' : 'var(--surface-2)' }}>
                            {l.options.map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                        ) : (
                          <input value={values[l.dimensionId] ?? l.value}
                                 onChange={(e) => setValues({ ...values, [l.dimensionId]: e.target.value })}
                                 style={{ padding: '5px 9px', border: `1px solid ${changed ? '#b58300' : 'var(--line)'}`,
                                          borderRadius: 6, fontSize: 13,
                                          background: changed ? '#fdf8e8' : 'var(--surface-2)' }} />
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {correcting && (
          <div className="wiz-row" style={{ marginTop: 14 }}>
            <label>Motivo de la corrección</label>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} style={{ minHeight: 50 }}
                      placeholder="Por qué el etiquetado del equipo no es correcto." />
          </div>
        )}

        {fragment.rejectReason && !correcting && (
          <div style={{ marginTop: 12, padding: '9px 12px', background: '#fdf6e3', borderRadius: 7,
                        fontSize: 12.5, color: '#5a4400' }}>
            <b>Motivo:</b> {fragment.rejectReason}
          </div>
        )}

        {error && <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--bad)' }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16,
                      paddingTop: 14, borderTop: '1px solid var(--line-soft)' }}>
          {correcting ? (
            <>
              <button className="btn" onClick={() => setCorrecting(false)}>Cancelar</button>
              <button className="btn primary" onClick={saveCorrection} disabled={busy}>
                {busy ? 'Guardando…' : 'Guardar corrección'}
              </button>
            </>
          ) : (
            <>
              <button className="btn" onClick={() => setCorrecting(true)}
                      disabled={fragment.labels.length === 0 || readOnly}>
                Corregir etiquetas
              </button>
              <button className="btn primary" onClick={approve} disabled={busy || readOnly}>
                {busy ? 'Guardando…' : 'Aprobar etiquetado'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
