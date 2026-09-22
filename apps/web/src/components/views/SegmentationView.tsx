'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveSegmentationConfig } from '@/app/actions/workflow';
import { segCount, segment, UNIT_LABELS, type SegmentationUnit } from '@/lib/segmentation';

type Config = {
  id: string; name: string; unit: SegmentationUnit;
  maxChunkSize: number; overlap: number; respectBoundaries: boolean; tolerance: number;
};

const DEFAULT_SAMPLE =
  'El mercado inmobiliario español ha experimentado fluctuaciones significativas en las últimas dos décadas. ' +
  'Las transacciones de viviendas alcanzaron máximos en 2007 con 70.928 operaciones, seguidas de una caída dramática ' +
  'durante la crisis financiera: en 2009 bajaron a 27.821 transacciones, una contracción del 61%. La recuperación ha ' +
  'sido lenta pero sostenida. En 2024 se registraron 63.859 transacciones, aproximándose a los niveles previos a la ' +
  'crisis. El dato más reciente de 2025 muestra 56.108 operaciones, indicando cierta volatilidad en el mercado actual.';

/**
 * Segmentation parameters with a live preview. The preview runs the exact
 * same `segment()` the server uses when ingesting a corpus.
 */
export function SegmentationView({
  projectId, configs, sampleText,
}: {
  projectId: string; configs: Config[]; sampleText: string;
}) {
  const router = useRouter();
  const first = configs[0];

  const [configId, setConfigId] = useState<string | undefined>(first?.id);
  const [name, setName] = useState(first?.name ?? 'Default (palabras)');
  const [unit, setUnit] = useState<SegmentationUnit>(first?.unit ?? 'word');
  const [maxSize, setMaxSize] = useState(first?.maxChunkSize ?? 120);
  const [overlap, setOverlap] = useState(first?.overlap ?? 20);
  const [respect, setRespect] = useState(first?.respectBoundaries ?? true);
  const [tolerance, setTolerance] = useState(first?.tolerance ?? 15);
  const [sample, setSample] = useState(sampleText || DEFAULT_SAMPLE);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const preview = useMemo(
    () => segment(sample, { unit, maxSize, overlap, respectBoundaries: respect, tolerance }),
    [sample, unit, maxSize, overlap, respect, tolerance],
  );

  function loadConfig(id: string) {
    const c = configs.find((x) => x.id === id);
    if (!c) return;
    setConfigId(c.id); setName(c.name); setUnit(c.unit);
    setMaxSize(c.maxChunkSize); setOverlap(c.overlap);
    setRespect(c.respectBoundaries); setTolerance(c.tolerance);
  }

  async function save() {
    setSaving(true); setError(null); setNotice(null);
    const res = await saveSegmentationConfig({
      projectId, id: configId, name, unit,
      maxChunkSize: maxSize, overlap, respectBoundaries: respect, tolerance,
    });
    setSaving(false);
    if (!res.ok) { setError(res.error); return; }
    setConfigId(res.id);
    setNotice('Configuración guardada.');
    router.refresh();
  }

  return (
    <div className="page">
      <h1>Configuración de segmentación</h1>
      <p className="lead">
        Define cómo se parten los textos largos en fragmentos etiquetables. Esta configuración se
        aplica al corpus completo del proyecto al cargarlo, antes de dividir en paquetes.
      </p>

      <div className="seg-grid">
        <div className="card">
          <h3>
            Parámetros
            {configs.length > 1 && (
              <select style={{ marginLeft: 'auto', fontSize: 12, padding: '3px 8px',
                               border: '1px solid var(--line)', borderRadius: 6, background: 'var(--surface-2)' }}
                      value={configId} onChange={(e) => loadConfig(e.target.value)}>
                {configs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
          </h3>

          <div className="seg-form-row">
            <label>Nombre de la config</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
            <label />
            <div className="seg-hint">
              Identifica esta configuración si quieres tener varias (p. ej. «Estricta» para campo
              abierto, «Laxa» para resúmenes).
            </div>

            <label>Unidad</label>
            <select value={unit} onChange={(e) => setUnit(e.target.value as SegmentationUnit)}>
              <option value="token">Token (≈ 4 caracteres)</option>
              <option value="word">Palabra</option>
              <option value="sentence">Frase</option>
              <option value="paragraph">Párrafo</option>
              <option value="character">Carácter</option>
            </select>
            <label />
            <div className="seg-hint">
              Recomendado: <b>palabra</b> o <b>frase</b>. Token es para textos técnicos; párrafo
              para respuestas estructuradas.
            </div>

            <label>Tamaño máximo</label>
            <input type="number" min={10} max={2000} value={maxSize} onChange={(e) => setMaxSize(Number(e.target.value))} />
            <label />
            <div className="seg-hint">Si el texto excede este tamaño, se parte en varios fragmentos.</div>

            <label>Overlap (unidades)</label>
            <input type="number" min={0} max={200} value={overlap} onChange={(e) => setOverlap(Number(e.target.value))} />
            <label />
            <div className="seg-hint">
              Unidades de solapamiento entre fragmentos consecutivos, para mantener contexto entre
              cortes. Debe ser menor que el tamaño máximo.
            </div>

            <label />
            <div className="seg-toggle">
              <input type="checkbox" id="seg-respect" checked={respect} onChange={(e) => setRespect(e.target.checked)} />
              <label htmlFor="seg-respect">Respetar límites de frase</label>
            </div>
            <label />
            <div className="seg-hint">
              Si está activo, el corte retrocede hasta el final de frase más cercano dentro de la
              tolerancia. Si no, el corte es por tamaño exacto.
            </div>

            <label>Tolerancia (%)</label>
            <input type="number" min={0} max={50} value={tolerance} onChange={(e) => setTolerance(Number(e.target.value))} />
            <label />
            <div className="seg-hint">
              Porcentaje que un fragmento puede encoger para caer en un límite limpio. 0 = corte exacto.
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18,
                        paddingTop: 14, borderTop: '1px solid var(--line-soft)' }}>
            <button className="btn" onClick={() => first && loadConfig(first.id)}>Restablecer</button>
            <button className="btn primary" onClick={save} disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar configuración'}
            </button>
          </div>

          {error && <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--bad)' }}>{error}</div>}
          {notice && <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--ok)' }}>{notice}</div>}

          <div className="seg-help">
            <b>Tip:</b> el fragmento más pequeño permitido es 10 unidades. Si una respuesta tiene
            menos, queda como un único fragmento.
          </div>
        </div>

        <div className="card">
          <h3>
            Live preview
            <span style={{ marginLeft: 'auto', fontSize: 11, background: '#f0ede4', color: 'var(--ink-2)',
                           padding: '2px 9px', borderRadius: 10, fontWeight: 500 }}>
              {sampleText ? 'fragmento real del corpus' : 'texto de ejemplo'}
            </span>
          </h3>

          <div className="preview-toolbar">
            <div className="preview-stats">
              <span><b>{preview.count}</b> fragmentos</span>
              <span><b>{preview.avg}</b> avg</span>
              <span><b>{preview.min}</b> min</span>
              <span><b>{preview.max}</b> max</span>
            </div>
            <button className="btn-mini" onClick={() => setSample('')}>Limpiar</button>
          </div>

          <textarea className="preview-input" value={sample} onChange={(e) => setSample(e.target.value)} />

          <div style={{ marginTop: 14 }}>
            {preview.fragments.length === 0 || (preview.fragments.length === 1 && !preview.fragments[0]?.trim()) ? (
              <div className="empty-state" style={{ margin: 0 }}>
                <h4>Sin texto</h4>
                Escribe o pega un texto arriba para ver cómo se segmenta.
              </div>
            ) : (
              preview.fragments.map((frag, i) => (
                <div className="frag-chip" key={i}>
                  <div className="frag-num">{i + 1}</div>
                  <div style={{ flex: 1 }}>
                    <div className="frag-text">{frag.length > 220 ? `${frag.slice(0, 220)}…` : frag}</div>
                    <div className="frag-meta">
                      <span>{segCount(frag, unit)} {UNIT_LABELS[unit]}</span>
                      <span>{frag.length} caracteres</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
