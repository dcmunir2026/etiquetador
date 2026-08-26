'use client';
import { useState, useEffect } from 'react';

const SAMPLE = 'El mercado inmobiliario español ha experimentado fluctuaciones significativas en las últimas dos décadas. Las transacciones de viviendas alcanzaron máximos en 2007 con 70.928 operaciones, seguidas de una caída dramática durante la crisis financiera: en 2009 bajaron a 27.821 transacciones, una contracción del 61%. La recuperación ha sido lenta pero sostenida. En 2024 se registraron 63.859 transacciones, aproximándose a los niveles previos a la crisis. El dato más reciente de 2025 muestra 56.108 operaciones, indicando cierta volatilidad en el mercado actual.';

function tokenize(text: string, unit: string) {
  if (unit === 'token') return text.split(/(\s+|[.,;:!?¿¡])/g).filter(t => t && t.trim().length > 0);
  if (unit === 'word') return text.split(/\s+/g).filter(w => w.length > 0);
  if (unit === 'sentence') return text.split(/(?<=[.!?])\s+/g).filter(s => s.trim().length > 0);
  if (unit === 'paragraph') return text.split(/\n\s*\n+/g).filter(p => p.trim().length > 0);
  if (unit === 'character') return text.split('');
  return [text];
}

function countUnits(text: string, unit: string) {
  if (unit === 'token') return text.split(/\s+/).length;
  if (unit === 'word') return text.split(/\s+/).filter(w => w.length).length;
  if (unit === 'sentence') return text.split(/(?<=[.!?])\s+/).filter(s => s.trim()).length;
  if (unit === 'paragraph') return text.split(/\n\s*\n+/).filter(p => p.trim()).length;
  if (unit === 'character') return text.length;
  return 1;
}

function sliceUnits(units: string[], maxSize: number, overlap: number) {
  if (units.length <= maxSize) return [units.join(' ')];
  const step = Math.max(1, maxSize - overlap);
  const out: string[] = [];
  for (let i = 0; i < units.length; i += step) {
    const end = Math.min(i + maxSize, units.length);
    out.push(units.slice(i, end).join(' '));
    if (end >= units.length) break;
  }
  return out;
}

export function SegmentationView() {
  const [unit, setUnit] = useState('word');
  const [maxSize, setMaxSize] = useState(120);
  const [overlap, setOverlap] = useState(20);
  const [text, setText] = useState(SAMPLE);

  const units = tokenize(text, unit);
  const frags = sliceUnits(units, maxSize, overlap);
  const sizes = frags.map(f => countUnits(f, unit));
  const avg = sizes.length ? Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length) : 0;
  const min = sizes.length ? Math.min(...sizes) : 0;
  const max = sizes.length ? Math.max(...sizes) : 0;
  const unitLabel: Record<string, string> = { token: 'tokens', word: 'palabras', sentence: 'frases', paragraph: 'párrafos', character: 'caracteres' };

  return (
    <div className="page">
      <h1>Configuración de segmentación</h1>
      <p className="lead">Define cómo se parten los textos largos en fragmentos etiquetables. Esta configuración se aplica al corpus completo del proyecto antes de dividir en paquetes.</p>

      <div className="grid" style={{ gridTemplateColumns: '1.1fr 1fr', gap: 16 }}>
        <div className="card" style={{ margin: 0 }}>
          <h3 style={{ marginTop: 0 }}>Parámetros</h3>
          <div className="seg-form">
            <label>Nombre de la config</label>
            <input type="text" defaultValue="Default (palabras)" />

            <label>Unidad</label>
            <select value={unit} onChange={e => setUnit(e.target.value)}>
              <option value="token">Token (≈ 4 caracteres)</option>
              <option value="word">Palabra</option>
              <option value="sentence">Frase</option>
              <option value="paragraph">Párrafo</option>
              <option value="character">Carácter</option>
            </select>

            <label>Tamaño máximo</label>
            <input type="number" value={maxSize} onChange={e => setMaxSize(parseInt(e.target.value) || 120)} />

            <label>Overlap (caracteres)</label>
            <input type="number" value={overlap} onChange={e => setOverlap(parseInt(e.target.value) || 20)} />

            <label></label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" defaultChecked id="respect" />
              <label htmlFor="respect" style={{ margin: 0 }}>Respetar límites de frase y párrafo</label>
            </div>

            <label>Tolerancia</label>
            <input type="number" defaultValue="15" />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--line-soft)' }}>
            <button className="btn">Restablecer</button>
            <button className="btn primary">Guardar configuración</button>
          </div>

          <div style={{ background: '#fdf6e3', border: '1px solid #e8d59a', borderLeft: '3px solid var(--warn)', padding: '11px 13px', borderRadius: '0 7px 7px 0', fontSize: 12.5, color: '#5a4400', marginTop: 14 }}>
            <b>Tip:</b> El fragmento más pequeño permitido es 10 unidades (palabras/tokens). Si una respuesta tiene menos, queda como un único fragmento.
          </div>
        </div>

        <div className="card" style={{ margin: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h3 style={{ margin: 0 }}>Live preview <span style={{ marginLeft: 12, fontSize: 11, background: '#f0ede4', color: 'var(--ink-2)', padding: '2px 9px', borderRadius: 10, fontWeight: 500 }}>texto de ejemplo real</span></h3>
          </div>
          <div style={{ display: 'flex', gap: 14, fontSize: 12, color: 'var(--ink-3)', marginBottom: 10 }}>
            <span><b style={{ color: 'var(--ink-1)' }}>{frags.length}</b> fragmentos</span>
            <span><b style={{ color: 'var(--ink-1)' }}>{avg}</b> avg</span>
            <span><b style={{ color: 'var(--ink-1)' }}>{min}</b> min</span>
            <span><b style={{ color: 'var(--ink-1)' }}>{max}</b> max</span>
            <span style={{ marginLeft: 'auto' }}>
              <button className="btn-mini" onClick={() => setText('')}>Limpiar</button>
            </span>
          </div>
          <textarea className="preview-input" value={text} onChange={e => setText(e.target.value)} />
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {frags.map((frag, i) => (
              <div key={i} className="frag-chip">
                <div className="frag-num">{i + 1}</div>
                <div style={{ flex: 1 }}>
                  <div className="frag-text">{frag.length > 220 ? frag.slice(0, 220) + '…' : frag}</div>
                  <div className="frag-meta">
                    <span>{countUnits(frag, unit)} {unitLabel[unit]}</span>
                    <span>{frag.length} caracteres</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
