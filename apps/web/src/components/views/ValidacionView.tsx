'use client';

export function ValidacionView() {
  return (
    <div className="page">
      <h1>Validación cualitativa</h1>
      <p className="lead">Selección cualitativa para validar manualmente. El sistema propone muestras estratificadas por dimensión y por nivel de discrepancia.</p>

      <div className="grid g-3" style={{ marginBottom: 20 }}>
        <div className="kpi"><div className="label">Muestra seleccionada</div><div className="value">120</div><div className="delta">6.5% del corpus</div></div>
        <div className="kpi"><div className="label">Validados</div><div className="value">82</div><div className="delta up">68% completado</div></div>
        <div className="kpi"><div className="label">Rechazados</div><div className="value">9</div><div className="delta down">7.5% rechazo</div></div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <h3 style={{ marginTop: 0 }}>Estrategia de muestreo</h3>
        <div className="grid g-3" style={{ gap: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--ink-2)', marginBottom: 4, fontWeight: 500 }}>Tipo de muestreo</label>
            <select style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 7, fontSize: 13 }}>
              <option>Estratificado por dimensión</option>
              <option>Aleatorio simple</option>
              <option>Dirigido a discrepancias</option>
              <option>Mixto (estratificado + discrepancias)</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--ink-2)', marginBottom: 4, fontWeight: 500 }}>Tamaño de la muestra</label>
            <input type="number" defaultValue="120" style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 7, fontSize: 13 }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--ink-2)', marginBottom: 4, fontWeight: 500 }}>Nivel de confianza</label>
            <select style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 7, fontSize: 13 }}>
              <option>95% (z = 1.96)</option>
              <option>99% (z = 2.58)</option>
              <option>90% (z = 1.65)</option>
            </select>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="tax-toolbar">
          <input type="search" placeholder="Buscar fragmento a validar..." />
          <select>
            <option>Todos los estratos</option>
            <option>Sesgo de odio</option>
            <option>Emotividad</option>
            <option>Género</option>
            <option>Casos con discrepancia alta</option>
          </select>
          <button className="btn" style={{ marginLeft: 'auto' }}>↓ Exportar muestra</button>
        </div>
        <table>
          <thead><tr><th>ID</th><th>Estrato</th><th>3 votos</th><th>Decisión</th><th>Notas</th><th></th></tr></thead>
          <tbody>
            {Array.from({ length: 8 }).map((_, i) => {
              const strata = ['Sesgo odio · Alto', 'Emotividad · Cargada', 'Género · Manifiesto', 'Sesgo odio · Medio'];
              const vote = [['Bajo', 'Alto', 'Alto'], ['Neutra', 'Cargada', 'Cargada'], ['Neutral', 'Sutil', 'Manifiesto'], ['Bajo', 'Medio', 'Alto']][i % 4] || [];
              return (
                <tr key={i}>
                  <td><code style={{ fontSize: 11, color: 'var(--ink-3)' }}>q-uuid-{2000 + i}</code></td>
                  <td><span className="chip">{strata[i % 4]}</span></td>
                  <td>
                    <div style={{ display: 'flex', gap: 3 }}>
                      {vote.map((v, vi) => (
                        <span key={vi} className="tag status-progress" style={{ fontSize: 10, padding: '2px 6px' }}>{v}</span>
                      ))}
                    </div>
                  </td>
                  <td>
                    <select style={{ padding: '4px 8px', fontSize: 12, border: '1px solid var(--line)', borderRadius: 5 }}>
                      <option>Pendiente</option>
                      <option>✓ Aprobado</option>
                      <option>✗ Rechazado</option>
                      <option>~ Aprobado con notas</option>
                    </select>
                  </td>
                  <td>
                    <input type="text" placeholder="Anotación..." style={{ width: '100%', padding: '4px 8px', fontSize: 12, border: '1px solid var(--line)', borderRadius: 5 }} />
                  </td>
                  <td>
                    <button className="btn-mini primary">Guardar</button>
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
