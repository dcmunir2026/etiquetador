import type { KappaData } from '@/lib/queries';
import { kappaLabel } from '@/lib/metrics';
import { BenchRow, EmptyState } from './shared';

function fmt(k: number | null): string {
  return k === null ? '—' : k.toFixed(2).replace('.', ',');
}

/** Fleiss' kappa, computed live from the project's annotations. */
export function KappaView({ data }: { data: KappaData }) {
  const { overall, byDimension, comparableFragments, threshold } = data;
  const ringPct = Math.round(Math.max(0, overall ?? 0) * 100);
  const gap = overall === null ? null : threshold - overall;

  return (
    <div className="page">
      <h1>Fiabilidad inter-jueces</h1>
      <p className="lead">
        Kappa de Fleiss calculado sobre las anotaciones reales del proyecto. Se consideran
        únicamente los pares (fragmento, dimensión) con dos o más anotadores. Las dimensiones de
        texto libre quedan excluidas, y un salto de la cascada cuenta como categoría propia.
      </p>

      {overall === null ? (
        <EmptyState title="Todavía no hay anotaciones comparables">
          El kappa necesita al menos dos anotadores sobre el mismo fragmento.
        </EmptyState>
      ) : (
        <>
          <div className="grid g-2" style={{ marginBottom: 18 }}>
            <div className="kappa" style={{ ['--p' as string]: ringPct }}>
              <div className="ring"><div className="v">{fmt(overall)}</div></div>
              <div className="text">
                <h4>Kappa de Fleiss global</h4>
                <p>
                  Concordancia inter-jueces sobre {byDimension.length} dimensiones y{' '}
                  {comparableFragments.toLocaleString('es-ES')} fragmentos comparables.
                  Interpretación: <b>{kappaLabel(overall)}</b>.
                </p>
                <div className="threshold">
                  Umbral de consenso del proyecto: <b>≥ {threshold.toFixed(2).replace('.', ',')}</b>.{' '}
                  {gap !== null && gap > 0
                    ? <>Faltan <b>{gap.toFixed(2).replace('.', ',')}</b> para consolidar la ronda.</>
                    : <>Umbral alcanzado: la ronda puede consolidarse.</>}
                </div>
              </div>
            </div>

            <div className="card">
              <h3>Cómo se calcula</h3>
              <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--ink-2)', margin: '0 0 10px' }}>
                Para cada ítem se cuenta cuántos anotadores eligieron cada categoría, se promedia el
                acuerdo observado y se descuenta el acuerdo esperado por azar. La implementación
                admite un número variable de anotadores por ítem, de modo que equipos de dos y de
                tres personas conviven en el mismo cálculo.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '6px 12px', fontSize: 12.5 }}>
                <span style={{ color: 'var(--ink-3)' }}>Fragmentos comparables</span>
                <span>{comparableFragments.toLocaleString('es-ES')}</span>
                <span style={{ color: 'var(--ink-3)' }}>Dimensiones medidas</span>
                <span>{byDimension.length}</span>
                <span style={{ color: 'var(--ink-3)' }}>Interpretación</span>
                <span><b>{kappaLabel(overall)}</b> (Landis &amp; Koch)</span>
              </div>
            </div>
          </div>

          <div className="card">
            <h3>Kappa por dimensión</h3>
            {byDimension.map((d) => (
              <BenchRow
                key={d.name}
                label={d.name}
                pct={Math.max(0, d.kappa ?? 0)}
                display={fmt(d.kappa)}
                tone={(d.kappa ?? 0) >= 0.8 ? 'ok' : (d.kappa ?? 0) >= 0.6 ? 'warn' : 'bad'}
              />
            ))}
          </div>
        </>
      )}

      <div className="card" style={{ marginTop: 14 }}>
        <h3>Configuración de envío del reporte</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: '14px 18px', alignItems: 'center' }}>
          <label>Proveedor</label>
          <select className="btn" style={{ textAlign: 'left', background: 'var(--surface-2)' }} defaultValue="gmail">
            <option value="gmail">Gmail (OAuth2)</option>
            <option value="outlook">Outlook / Microsoft 365</option>
            <option value="smtp">SMTP genérico</option>
          </select>
          <label>Destinatarios</label>
          <input className="btn" style={{ textAlign: 'left', background: 'var(--surface-2)' }}
                 defaultValue="redaccion@epdata.es, ccss@unir.es" />
          <label>Asunto</label>
          <input className="btn" style={{ textAlign: 'left', background: 'var(--surface-2)' }}
                 defaultValue={`[EpData] Reporte de Kappa — ${fmt(overall)}`} />
          <label>Adjuntar</label>
          <span>
            <span className="tag status-done">Reporte Word</span>{' '}
            <span className="tag status-done">CSV de consolidado</span>
          </span>
        </div>
        <p style={{ fontSize: 11.5, color: 'var(--ink-4)', marginTop: 14, marginBottom: 0 }}>
          El envío por email todavía no está conectado: falta decidir proveedor (issue pendiente en
          <code> docs/DECISIONS.md</code>).
        </p>
      </div>
    </div>
  );
}
