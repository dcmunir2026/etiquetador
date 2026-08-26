'use client';

export function KappaView() {
  return (
    <div className="page">
      <h1>Kappa de Fleiss</h1>
      <p className="lead">Métrica de acuerdo inter-anotador. Mide qué tanto concuerdan los etiquetadores más allá del azar. Rango: −1 (desacuerdo total) a 1 (acuerdo total). Por encima de 0.7 se considera acuerdo sustancial.</p>

      <div className="grid g-3" style={{ marginBottom: 20 }}>
        <div className="kpi"><div className="label">Fleiss Kappa global</div><div className="value">0,82</div><div className="delta up">Sustancial</div></div>
        <div className="kpi"><div className="label">Krippendorff Alpha</div><div className="value">0,79</div><div className="delta up">+0,03 vs. ronda 1</div></div>
        <div className="kpi"><div className="label">% Acuerdo global</div><div className="value">84,5%</div><div className="delta up">+2,1% vs. Q2</div></div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <h3 style={{ marginTop: 0 }}>Kappa por dimensión</h3>
        <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
          {[
            { dim: 'Sesgo de odio', k: 0.84, n: 1224, level: 'sustancial' },
            { dim: 'Emotividad', k: 0.79, n: 1224, level: 'sustancial' },
            { dim: 'Carácter tendencioso', k: 0.71, n: 1224, level: 'sustancial' },
            { dim: 'Semiótica', k: 0.65, n: 1224, level: 'moderado' },
            { dim: 'Género', k: 0.88, n: 1224, level: 'casi perfecto' },
            { dim: 'Raza / etnia', k: 0.92, n: 1224, level: 'casi perfecto' },
            { dim: 'Religión', k: 0.91, n: 1224, level: 'casi perfecto' },
            { dim: 'Sesgo demográfico', k: 0.76, n: 1224, level: 'sustancial' },
            { dim: 'Sesgo estadístico', k: 0.82, n: 1224, level: 'sustancial' },
            { dim: 'Incoherencia factual', k: 0.78, n: 1224, level: 'sustancial' },
          ].map((d, i) => {
            const color = d.k >= 0.81 ? 'var(--ok)' : d.k >= 0.61 ? 'var(--warn)' : 'var(--bad)';
            const pctWidth = Math.max(5, d.k * 100);
            return (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '180px 1fr 80px 100px', gap: 12, alignItems: 'center', fontSize: 12 }}>
                <div style={{ fontWeight: 500 }}>{d.dim}</div>
                <div style={{ position: 'relative', height: 22, background: 'var(--line-soft)', borderRadius: 4 }}>
                  <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'var(--ink-3)', opacity: 0.5 }} />
                  <div style={{ width: `${pctWidth}%`, height: '100%', background: color, borderRadius: 4, opacity: 0.85 }} />
                </div>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, fontWeight: 600, textAlign: 'right' }}>{d.k.toFixed(2)}</div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{d.level} · n={d.n}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Interpretación</h3>
        <table style={{ fontSize: 12 }}>
          <thead><tr><th>Valor de κ</th><th>Interpretación (Landis & Koch, 1977)</th></tr></thead>
          <tbody>
            <tr><td>&lt; 0</td><td>Peor que el azar</td></tr>
            <tr><td>0.00 – 0.20</td><td>Desacuerdo leve</td></tr>
            <tr><td>0.21 – 0.40</td><td>Acuerdo leve</td></tr>
            <tr><td>0.41 – 0.60</td><td>Acuerdo moderado</td></tr>
            <tr><td>0.61 – 0.80</td><td>Acuerdo sustancial</td></tr>
            <tr><td>0.81 – 1.00</td><td>Acuerdo casi perfecto</td></tr>
          </tbody>
        </table>
        <p style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 10 }}>
          Referencia: Landis, J.R. & Koch, G.G. (1977). "The measurement of observer agreement for categorical data." <em>Biometrics</em>, 33, 159–174.
        </p>
      </div>
    </div>
  );
}
