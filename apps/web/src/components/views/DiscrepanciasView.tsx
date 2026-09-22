'use client';

import { useRouter } from 'next/navigation';
import type { MirrorComparison, PackageRow } from '@/lib/queries';
import { BenchRow, EmptyState, Kpi, num, pct } from './shared';

const THRESHOLD = 0.12;

/** Annotator-vs-annotator comparison inside one mirror package (H15). */
export function DiscrepanciasView({
  comparison, packages, selected,
}: {
  comparison: MirrorComparison | null; packages: PackageRow[]; selected: string | null;
}) {
  const router = useRouter();

  if (!comparison) {
    return (
      <div className="page">
        <h1>Detección de inconsistencias</h1>
        <EmptyState title="Sin paquetes que comparar">
          Divide el corpus en paquetes espejo y asígnalos a un equipo para poder comparar.
        </EmptyState>
      </div>
    );
  }

  const over = comparison.pct >= THRESHOLD;

  return (
    <div className="page">
      <h1>Detección de inconsistencias</h1>
      <p className="lead">
        Comparación automática entre los anotadores del paquete espejo{' '}
        <b>{comparison.packageCode}</b> ({comparison.annotators.join(', ') || 'sin asignar'}).
        Las discrepancias por encima del umbral del proyecto ({pct(THRESHOLD)}) bloquean la
        aprobación y devuelven el paquete al etiquetado.
      </p>

      <div className="tax-toolbar" style={{ marginBottom: 18 }}>
        <select value={selected ?? packages[0]?.id ?? ''}
                onChange={(e) => router.push(`/discrepancias?pkg=${e.target.value}`)}>
          {packages.map((p) => (
            <option key={p.id} value={p.id}>{p.code} · {p.teamName ?? 'sin equipo'}</option>
          ))}
        </select>
      </div>

      <div className="grid g-2" style={{ marginBottom: 18 }}>
        <Kpi label="Fragmentos comparados" value={num(comparison.comparedFragments)}
             delta="con dos o más anotadores" />
        <Kpi label="Fragmentos con discrepancia" value={num(comparison.discrepantFragments)}
             tone={over ? 'bad' : 'ok'}
             delta={`tasa por valoración ${pct(comparison.pct, 1)} · umbral ${pct(THRESHOLD)}`} />
      </div>

      <div className="card" style={{ padding: '14px 16px', marginBottom: 18 }}>
        <h3>Discrepancias por dimensión</h3>
        {comparison.byDimension.length === 0 ? (
          <p style={{ color: 'var(--ink-3)', fontSize: 13 }}>Sin datos comparables.</p>
        ) : (
          comparison.byDimension.map((d) => (
            <BenchRow key={d.name} label={d.name} pct={d.pct}
                      display={`${pct(d.pct)} (${d.disagreed}/${d.comparable})`} />
          ))
        )}
      </div>

      <div className="card">
        <h3>
          Vista fragmento a fragmento
          <span className="count">{comparison.rows.length} con discrepancia</span>
        </h3>
        <table className="compare">
          <thead>
            <tr>
              <th style={{ width: 60 }}>#</th>
              <th>Fragmento</th>
              <th style={{ width: 150 }}>Dimensión</th>
              <th>Respuestas</th>
            </tr>
          </thead>
          <tbody>
            {comparison.rows.map((r) => (
              <tr key={`${r.fragmentId}-${r.dimension}-${r.index}`}>
                <td>{String(r.index).padStart(3, '0')}</td>
                <td style={{ fontSize: 12.5, color: 'var(--ink-2)', maxWidth: 380 }}>
                  “{r.text.slice(0, 150)}{r.text.length > 150 ? '…' : ''}”
                </td>
                <td><b style={{ fontSize: 12.5 }}>{r.dimension}</b></td>
                <td>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {Object.entries(r.values).map(([who, value], i) => (
                      <span key={who} className={`vs ${i === 0 ? 'a' : i === 1 ? 'b' : 'mine'}`}>
                        {who.split(' ')[0]}: {value}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
            {comparison.rows.length === 0 && (
              <tr><td colSpan={4} style={{ padding: 30, textAlign: 'center', color: 'var(--ink-3)' }}>
                Los anotadores coinciden en todos los fragmentos comparables de este paquete.
              </td></tr>
            )}
          </tbody>
        </table>
        {comparison.rows.length >= 60 && (
          <p style={{ fontSize: 11.5, color: 'var(--ink-4)', marginTop: 10 }}>
            Se muestran las primeras 60 filas.
          </p>
        )}
      </div>
    </div>
  );
}
