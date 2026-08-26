'use client';

export function ReporteView() {
  return (
    <div className="page">
      <h1>Reporte final</h1>
      <p className="lead">Reporte consolidado del proyecto. Incluye métricas de acuerdo, distribución de anotaciones, taxa de rechazo y exportación del dataset final.</p>

      <div className="grid g-4" style={{ marginBottom: 20 }}>
        <div className="kpi"><div className="label">Fragmentos finales</div><div className="value">1.224</div><div className="delta">consolidados</div></div>
        <div className="kpi"><div className="label">Fleiss Kappa</div><div className="value">0,82</div><div className="delta up">sustancial</div></div>
        <div className="kpi"><div className="label">% Acuerdo</div><div className="value">84,5%</div><div className="delta up">+2,1% vs. Q2</div></div>
        <div className="kpi"><div className="label">Tiempo total</div><div className="value">18 días</div><div className="delta">3 personas · 6h/día</div></div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <h3 style={{ marginTop: 0 }}>Distribución de anotaciones por dimensión</h3>
        <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
          {[
            { dim: 'Sesgo de odio', low: 412, med: 510, high: 302 },
            { dim: 'Emotividad', low: 280, med: 720, high: 224 },
            { dim: 'Carácter tendencioso', low: 580, med: 480, high: 164 },
            { dim: 'Semiótica', low: 890, med: 234, high: 100 },
            { dim: 'Género', low: 1050, med: 130, high: 44 },
            { dim: 'Raza / etnia', low: 1180, med: 32, high: 12 },
            { dim: 'Religión', low: 1190, med: 22, high: 12 },
            { dim: 'Sesgo demográfico', low: 1090, med: 90, high: 44 },
          ].map((d, i) => {
            const total = d.low + d.med + d.high;
            return (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '180px 1fr 100px', gap: 10, alignItems: 'center', fontSize: 12 }}>
                <div style={{ fontWeight: 500 }}>{d.dim}</div>
                <div style={{ display: 'flex', height: 18, borderRadius: 4, overflow: 'hidden', background: 'var(--line-soft)' }}>
                  <div style={{ width: `${(d.low / total) * 100}%`, background: '#1c8a4a' }} title={`Bajo: ${d.low}`} />
                  <div style={{ width: `${(d.med / total) * 100}%`, background: '#c79d3c' }} title={`Medio: ${d.med}`} />
                  <div style={{ width: `${(d.high / total) * 100}%`, background: '#a13d3d' }} title={`Alto: ${d.high}`} />
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)', textAlign: 'right' }}>
                  <b style={{ color: 'var(--ink-1)' }}>{total.toLocaleString()}</b> frags
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 14, marginTop: 14, fontSize: 11, color: 'var(--ink-3)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 12, height: 12, background: '#1c8a4a', borderRadius: 2 }}></span> Bajo / Neutral</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 12, height: 12, background: '#c79d3c', borderRadius: 2 }}></span> Medio / Sutil</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 12, height: 12, background: '#a13d3d', borderRadius: 2 }}></span> Alto / Manifiesto</span>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <h3 style={{ marginTop: 0 }}>Exportar dataset</h3>
        <p style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 0 }}>Genera el dataset final con las anotaciones consolidadas. Formatos disponibles: JSONL (compatible con el LLM Juez), CSV (Excel), Parquet (BI).</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn primary">↓ JSONL (para LLM Juez)</button>
          <button className="btn">↓ CSV (Excel)</button>
          <button className="btn">↓ Parquet (BI)</button>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Reporte PDF</h3>
        <p style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 0 }}>Genera un PDF firmado con todas las métricas, la metodología y el detalle de anotación por dimensión. Listo para auditoría editorial.</p>
        <button className="btn primary">↓ Generar reporte PDF</button>
      </div>
    </div>
  );
}
