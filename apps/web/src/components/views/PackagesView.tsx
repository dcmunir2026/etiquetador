'use client';
import { useState } from 'react';

export function PackagesView() {
  const [strategy, setStrategy] = useState('count');
  const [size, setSize] = useState(50);
  const [groupSize, setGroupSize] = useState('trio');
  const [metric, setMetric] = useState('fleiss');

  return (
    <div className="page">
      <h1>Paquetes espejo</h1>
      <p className="lead">Divide el corpus del proyecto en paquetes disjuntos y asigna anotadores. Los paquetes espejo (mismo contenido, distinto anotador) permiten medir acuerdo inter-anotador.</p>

      <div className="grid g-2" style={{ marginBottom: 20 }}>
        <div className="kpi"><div className="label">Fragmentos a dividir</div><div className="value">3.662</div><div className="delta">tras dedupe y segmentación</div></div>
        <div className="kpi"><div className="label">Paquetes resultantes</div><div className="value">46 × 2</div><div className="delta">46 base + 46 espejo = 92</div></div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Configuración de la división</h3>
        <div className="grid g-2" style={{ gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--ink-2)', marginBottom: 4 }}>Estrategia de división</label>
            <select value={strategy} onChange={e => setStrategy(e.target.value)} style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 7, fontSize: 13, background: 'var(--surface-2)' }}>
              <option value="count">Por número de paquetes</option>
              <option value="size">Por tamaño (N fragmentos cada uno)</option>
              <option value="stratified">Estratificada por sección</option>
            </select>
            <p style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 6 }}>{strategy === 'count' ? 'Genera exactamente N paquetes; el tamaño se ajusta al corpus.' : strategy === 'size' ? 'Cada paquete tiene exactamente N fragmentos. El último puede ser más pequeño.' : 'Mantiene proporciones por sección; requiere columna de sección.'}</p>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--ink-2)', marginBottom: 4 }}>Tamaño de cada paquete</label>
            <input type="number" value={size} onChange={e => setSize(parseInt(e.target.value) || 50)} style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 7, fontSize: 13, background: 'var(--surface-2)' }} />
            <p style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 6 }}>Recomendado: 50 fragmentos. Si el corpus no es múltiplo, el último puede ser menor.</p>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--ink-2)', marginBottom: 4 }}>Distribución</label>
            <select style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 7, fontSize: 13, background: 'var(--surface-2)' }}>
              <option>Aleatoria estratificada por sección</option>
              <option>Secuencial</option>
              <option>Round-robin</option>
              <option>Hash por ID de pregunta</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--ink-2)', marginBottom: 4 }}>Asignación</label>
            <select style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 7, fontSize: 13, background: 'var(--surface-2)' }}>
              <option>Automática (mismo equipo)</option>
              <option>Automática (equipos distintos)</option>
              <option>Manual</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--ink-2)', marginBottom: 4 }}>Tamaño del grupo</label>
            <select value={groupSize} onChange={e => setGroupSize(e.target.value)} style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 7, fontSize: 13, background: 'var(--surface-2)' }}>
              <option value="single">Solo (1)</option>
              <option value="duo">Dúo (2)</option>
              <option value="trio">Trío (3)</option>
              <option value="quartet">Cuarteto (4)</option>
              <option value="custom">Custom…</option>
            </select>
            <p style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 6 }}>Cada paquete se asigna a {groupSize === 'trio' ? '3' : groupSize === 'duo' ? '2' : groupSize === 'quartet' ? '4' : '1'} etiquetadores.</p>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--ink-2)', marginBottom: 4 }}>Métrica de consenso</label>
            <select value={metric} onChange={e => setMetric(e.target.value)} style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 7, fontSize: 13, background: 'var(--surface-2)' }}>
              <option value="fleiss">Fleiss Kappa (N jueces, categórica)</option>
              <option value="krippendorff">Krippendorff Alpha (cualquier nivel)</option>
              <option value="majority">Mayoría simple (≥ 50% acuerdo)</option>
              <option value="unanimous">Consenso total (100%)</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--line-soft)' }}>
          <div>
            <h3 style={{ margin: '0 0 4px' }}>Preview de la división</h3>
            <small style={{ color: 'var(--ink-3)' }}>Distribución tentativa. Confirma abajo para crear los paquetes en BD.</small>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>~ <b style={{ color: 'var(--ink-1)' }}>74 paquetes</b> (46 base + 28 espejo)</span>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 6, marginTop: 14 }}>
          {Array.from({ length: 20 }).map((_, i) => (
            <div key={i} style={{ padding: '8px 10px', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 6, fontSize: 11, display: 'flex', justifyContent: 'space-between' }}>
              <span>P{i + 1}</span>
              <span style={{ color: 'var(--ink-3)' }}>50 frags</span>
            </div>
          ))}
          <div style={{ padding: '8px 10px', background: 'var(--primary-fade)', border: '1px dashed var(--primary-2)', borderRadius: 6, fontSize: 11, color: 'var(--primary-2)', textAlign: 'center' }}>
            + 26 más…
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
          <button className="btn">Cancelar</button>
          <button className="btn primary">Previsualizar división</button>
          <button className="btn primary" style={{ background: 'var(--ok)', borderColor: 'var(--ok)' }}>Asignar y notificar →</button>
        </div>
      </div>
    </div>
  );
}
