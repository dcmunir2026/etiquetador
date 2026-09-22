import type { ReportData } from '@/lib/queries';
import { BenchRow, Kpi, StatusTag, num, pct } from './shared';

/** Inconsistency report — every figure derives from live annotations. */
export function ReporteView({ report, projectName }: { report: ReportData; projectName: string }) {
  const {
    packagesReviewed, fragmentsCompared, inconsistencyRate, threshold,
    overThreshold, worstDimension, byDimension, returnedPackages,
  } = report;

  return (
    <div className="page">
      <div className="grid g-34">
        <div className="toc">
          <h4>Reporte de inconsistencias</h4>
          <a href="#resumen"><b>Resumen ejecutivo</b></a>
          <a href="#por-dimension">Discrepancias por dimensión</a>
          <a href="#reenviados">Paquetes reenviados</a>
          <a href="#acciones">Acciones tomadas</a>
        </div>

        <div>
          <h1>Reporte de inconsistencias</h1>
          <p className="lead">
            Documento exportable generado a partir del estado actual del proyecto <b>{projectName}</b>.
            Resumen ejecutivo, detalle por dimensión y acciones recomendadas.
          </p>

          <div className="grid g-3" style={{ marginBottom: 18 }}>
            <Kpi label="Paquetes revisados" value={packagesReviewed} />
            <Kpi label="Fragmentos comparados" value={num(fragmentsCompared)} />
            <Kpi label="Tasa de inconsistencia" value={pct(inconsistencyRate, 1)}
                 tone={inconsistencyRate >= threshold ? 'bad' : 'ok'} />
          </div>

          <div className="card" id="resumen">
            <h3>1. Resumen ejecutivo</h3>
            <p style={{ fontSize: 13.5, lineHeight: 1.65, color: 'var(--ink-2)', margin: '0 0 10px' }}>
              De los <b>{packagesReviewed} paquetes</b> procesados, <b>{overThreshold}</b> superaron el
              umbral global de discrepancia ({pct(threshold)}) y deben reenviarse al etiquetador.
              {worstDimension && (
                <> La dimensión con mayor desacuerdo fue <span className="tag sesgo-tendencioso">{worstDimension.name}</span>,
                  con un {pct(worstDimension.pct)} de fragmentos discrepantes.</>
              )}
            </p>
            <p style={{ fontSize: 13.5, lineHeight: 1.65, color: 'var(--ink-2)', margin: 0 }}>
              {worstDimension
                ? <>Se recomienda reforzar el manual de rúbricas en <b>{worstDimension.name}</b> y elevar el
                    peso de la validación cualitativa para esa dimensión en la siguiente ronda.</>
                : <>No hay suficientes anotaciones comparables para emitir una recomendación.</>}
            </p>
          </div>

          <div className="card" id="por-dimension" style={{ marginTop: 14 }}>
            <h3>2. Discrepancias por dimensión</h3>
            {byDimension.length === 0
              ? <p style={{ color: 'var(--ink-3)', fontSize: 13 }}>Sin datos comparables todavía.</p>
              : byDimension.map((d) => (
                  <BenchRow key={d.name} label={d.name} pct={d.pct} display={pct(d.pct)} />
                ))}
          </div>

          <div className="card" id="reenviados" style={{ marginTop: 14 }}>
            <h3>
              3. Paquetes reenviados
              <span className="count">{returnedPackages.length} de {packagesReviewed}</span>
            </h3>
            <table>
              <thead>
                <tr><th>Paquete</th><th>Reenvíos</th><th>Versión</th><th>Estado</th><th>Notas</th></tr>
              </thead>
              <tbody>
                {returnedPackages.map((p) => (
                  <tr key={p.code}>
                    <td><b>{p.code}</b></td>
                    <td>{p.returns}</td>
                    <td>v{p.version}</td>
                    <td><StatusTag status={p.status} /></td>
                    <td><small style={{ color: 'var(--ink-3)' }}>{p.notes ?? '—'}</small></td>
                  </tr>
                ))}
                {returnedPackages.length === 0 && (
                  <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', color: 'var(--ink-3)' }}>
                    Ningún paquete ha sido reenviado.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="card" id="acciones" style={{ marginTop: 14 }}>
            <h3>4. Acciones tomadas</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              <div style={{ display: 'flex', gap: 11, padding: '10px 13px', background: 'var(--surface-2)', borderRadius: 7 }}>
                <svg className="ic" style={{ color: 'var(--primary-2)', marginTop: 1 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                </svg>
                <div><b>Reenvío</b> de los {overThreshold} paquetes con discrepancia superior al umbral.</div>
              </div>
              <div style={{ display: 'flex', gap: 11, padding: '10px 13px', background: 'var(--surface-2)', borderRadius: 7 }}>
                <svg className="ic" style={{ color: 'var(--primary-2)', marginTop: 1 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" />
                </svg>
                <div><b>Validación cualitativa</b> sobre una muestra por equipo, con corrección etiqueta a etiqueta.</div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
            <button className="btn" disabled title="Pendiente: exportador Word">Exportar a Word →</button>
          </div>
          <p style={{ fontSize: 11.5, color: 'var(--ink-4)', textAlign: 'right', marginTop: 6 }}>
            La exportación a Word y el envío por email aún no están implementados.
          </p>
        </div>
      </div>
    </div>
  );
}
