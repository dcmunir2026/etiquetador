'use client';

export function DiscrepanciasView() {
  return (
    <div className="page">
      <h1>Discrepancias</h1>
      <p className="lead">Fragmentos donde los etiquetadores no coincidieron. La métrica de consenso (Fleiss) está por debajo de 0.4 — requiere revisión manual.</p>

      <div className="grid g-4" style={{ marginBottom: 20 }}>
        <div className="kpi"><div className="label">Fragmentos con discrepancia</div><div className="value">284</div><div className="delta down">+34 vs. ayer</div></div>
        <div className="kpi"><div className="label">% del total</div><div className="value">15,5%</div><div className="delta">284 / 1.833 etiquetados</div></div>
        <div className="kpi"><div className="label">Fleiss Kappa global</div><div className="value">0,68</div><div className="delta down">por debajo del umbral 0,7</div></div>
        <div className="kpi"><div className="label">Resueltas hoy</div><div className="value">47</div><div className="delta up">+12 vs. ayer</div></div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="tax-toolbar">
          <input type="search" placeholder="Buscar discrepancia..." />
          <select>
            <option>Todas las dimensiones</option>
            <option>Sesgo de odio</option>
            <option>Emotividad</option>
            <option>Carácter tendencioso</option>
            <option>Género</option>
          </select>
          <select>
            <option>Por fragmento</option>
            <option>Por paquete</option>
            <option>Por etiquetador</option>
          </select>
          <button className="btn" style={{ marginLeft: 'auto' }}>↓ Exportar</button>
        </div>

        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Pregunta (extracto)</th>
              <th>Sesgo odio</th>
              <th>Emotividad</th>
              <th>Género</th>
              <th>Discrep.</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 10 }).map((_, i) => {
              const votes = [
                ['Bajo', 'Medio', 'Alto'],
                ['Neutra', 'Cargada', 'Neutra'],
                ['Neutral', 'Sutil', 'Manifiesto'],
              ];
              const allAgree = (col: string[]) => col[0] === col[1] && col[1] === col[2];
              return (
                <tr key={i}>
                  <td><code style={{ fontSize: 11, color: 'var(--ink-3)' }}>q-uuid-{1000 + i}</code></td>
                  <td><small style={{ color: 'var(--ink-2)' }}>¿Cuáles son los principales riesgos de sesgo...</small></td>
                  {votes.map((col, ci) => (
                    <td key={ci}>
                      {allAgree(col) ? (
                        <span className="tag status-done">{col[0]}</span>
                      ) : (
                        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                          {Array.from(new Set(col)).map((v, vi) => (
                            <span key={vi} className="tag status-progress" style={{ fontSize: 10, padding: '2px 6px' }}>{v}</span>
                          ))}
                        </div>
                      )}
                    </td>
                  ))}
                  <td>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--bad)' }}>2 / 3</span>
                  </td>
                  <td>
                    <button className="btn ghost">Revisar →</button>
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
