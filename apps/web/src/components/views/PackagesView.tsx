'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PackageRow, TeamRow } from '@/lib/queries';
import { generatePackages } from '@/app/actions/workflow';
import { Kpi, StatusTag, num } from './shared';

const SIZE_LABEL: Record<number, string> = { 2: 'dúo', 3: 'trío', 4: 'cuarteto', 5: 'quinteto' };

/** Corpus split into mirror packages, one per team (H8). */
export function PackagesView({
  projectId, packages, teams, fragmentTotal,
}: {
  projectId: string; packages: PackageRow[]; teams: TeamRow[]; fragmentTotal: number;
}) {
  const router = useRouter();
  const [strategy, setStrategy] = useState<'by-count' | 'by-size'>('by-count');
  const [amount, setAmount] = useState(4);
  const [distribution, setDistribution] = useState<'stratified' | 'random' | 'natural'>('stratified');
  const [metric, setMetric] = useState('fleiss');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const packagedFragments = packages.reduce((a, p) => a + p.fragmentCount, 0);
  const unpackaged = Math.max(0, fragmentTotal - packagedFragments);

  async function run() {
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await generatePackages({
      projectId, strategy, amount, distribution, consensusMetric: metric as never,
    });
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    setNotice(`${res.id} paquetes creados y asignados.`);
    router.refresh();
  }

  const byTeam = teams.map((t) => {
    const mine = packages.filter((p) => p.teamId === t.id);
    const done = mine.filter((p) => p.status === 'submitted' || p.status === 'approved').length;
    return { team: t, total: mine.length, done };
  });

  return (
    <div className="page">
      <h1>División en paquetes</h1>
      <p className="lead">
        El corpus se divide en paquetes que se asignan a todos los etiquetadores de un mismo equipo
        (paquete espejo). Esto habilita la comparación interjueces y el cálculo de Kappa de Fleiss.
      </p>

      <div className="grid g-4" style={{ marginBottom: 18 }}>
        <Kpi label="Paquetes" value={packages.length} delta={`${teams.length} equipos`} />
        <Kpi label="Fragmentos empaquetados" value={num(packagedFragments)} delta={`de ${num(fragmentTotal)}`} />
        <Kpi label="Sin empaquetar" value={num(unpackaged)} tone={unpackaged > 0 ? 'warn' : undefined} />
        <Kpi label="Asignaciones" value={packages.reduce((a, p) => a + p.assignments.length, 0)}
             delta="anotador × paquete" />
      </div>

      <div className="grid g-2" style={{ marginBottom: 18 }}>
        <div className="card">
          <h3>Configuración de la división</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: '14px 18px', alignItems: 'center' }}>
            <label>Estrategia</label>
            <select className="btn" style={{ textAlign: 'left', background: 'var(--surface-2)' }}
                    value={strategy} onChange={(e) => setStrategy(e.target.value as typeof strategy)}>
              <option value="by-count">Por número de paquetes</option>
              <option value="by-size">Por tamaño de paquete</option>
            </select>

            <label>{strategy === 'by-count' ? 'Nº paquetes' : 'Fragmentos por paquete'}</label>
            <input className="btn" type="number" min={1} style={{ textAlign: 'left', background: 'var(--surface-2)' }}
                   value={amount} onChange={(e) => setAmount(Number(e.target.value))} />

            <label>Distribución</label>
            <select className="btn" style={{ textAlign: 'left', background: 'var(--surface-2)' }}
                    value={distribution} onChange={(e) => setDistribution(e.target.value as typeof distribution)}>
              <option value="stratified">Aleatoria estratificada</option>
              <option value="random">Aleatoria simple</option>
              <option value="natural">Orden natural</option>
            </select>

            <label>Métrica de consenso</label>
            <select className="btn" style={{ textAlign: 'left', background: 'var(--surface-2)' }}
                    value={metric} onChange={(e) => setMetric(e.target.value)}>
              <option value="fleiss">Fleiss Kappa (N jueces, categórica)</option>
              <option value="krippendorff">Krippendorff α (N jueces, mixto)</option>
              <option value="weighted-majority">Mayoría ponderada (N≥3)</option>
              <option value="unanimous">Consenso total (todos iguales)</option>
            </select>
          </div>

          <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
            <button className="btn primary" onClick={run} disabled={busy || unpackaged === 0}>
              {busy ? 'Dividiendo…' : 'Dividir y asignar →'}
            </button>
          </div>

          {unpackaged === 0 && (
            <div style={{ marginTop: 12, padding: '10px 12px', background: '#e6f4ec', borderRadius: 7,
                          fontSize: 12.5, color: '#1c6e3a' }}>
              Todos los fragmentos están ya asignados a un paquete.
            </div>
          )}
          {error && (
            <div style={{ marginTop: 12, padding: '10px 12px', background: '#fbe6e6', borderRadius: 7,
                          fontSize: 12.5, color: '#5a2222' }}>{error}</div>
          )}
          {notice && (
            <div style={{ marginTop: 12, padding: '10px 12px', background: '#e6f4ec', borderRadius: 7,
                          fontSize: 12.5, color: '#1c6e3a' }}>{notice}</div>
          )}
        </div>

        <div className="card">
          <h3>Reparto por equipo</h3>
          {byTeam.map(({ team, total, done }) => (
            <div className="bench-row" key={team.id}>
              <span className="lbl">
                <b>{team.name}</b> · {SIZE_LABEL[team.members.length] ?? `${team.members.length}`}{' '}
                <small style={{ color: 'var(--ink-3)' }}>({team.members.length})</small>
              </span>
              <div className="bar-bg">
                <div className={`bar-fill ${team.members.length < 2 ? 'warn' : total === 0 ? 'warn' : 'ok'}`}
                     style={{ width: `${total === 0 ? 0 : Math.round((done / total) * 100)}%` }} />
              </div>
              <span className="val">{done}/{total}</span>
            </div>
          ))}
          {byTeam.some((t) => t.team.members.length < 2) && (
            <div style={{ marginTop: 12, padding: '10px 12px', background: '#fdf6e3', borderRadius: 7,
                          fontSize: 12.5, color: '#5a4400' }}>
              Hay equipos con menos de 2 etiquetadores. Sin al menos dos, no se puede medir el acuerdo.
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <h3>Paquetes asignados <span className="count">{packages.length}</span></h3>
        <table>
          <thead>
            <tr>
              <th>Paquete</th><th>Fragmentos</th><th>Grupo</th>
              <th>Asignaciones</th><th>Estado</th><th>Versión</th>
            </tr>
          </thead>
          <tbody>
            {packages.map((p) => (
              <tr key={p.id}>
                <td><b>{p.code}</b>{p.isMirror && <><br /><small style={{ color: 'var(--ink-3)' }}>espejo</small></>}</td>
                <td>{p.fragmentCount}</td>
                <td>
                  <span className="group-size-pill">{SIZE_LABEL[p.groupSize] ?? `${p.groupSize}`}</span>{' '}
                  {p.teamName ?? '—'}
                </td>
                <td>
                  <div className="assignees">
                    {p.assignments.map((a) => (
                      <span key={a.userId} className={`assignee${a.isLead ? ' lead' : ''}`}>
                        <span className="av" style={{ background: a.color ?? undefined }}>
                          {a.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()}
                        </span>
                        {a.name}
                      </span>
                    ))}
                  </div>
                </td>
                <td><StatusTag status={p.status} /></td>
                <td>
                  <small style={{ color: p.returnCount > 0 ? 'var(--warn)' : 'var(--ink-3)' }}>
                    v{p.version}
                    {p.returnCount > 0 && ` · ${p.returnCount} reenvío${p.returnCount > 1 ? 's' : ''}`}
                  </small>
                </td>
              </tr>
            ))}
            {packages.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 30, textAlign: 'center', color: 'var(--ink-3)' }}>
                Todavía no hay paquetes. Configura la división y pulsa «Dividir y asignar».
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
