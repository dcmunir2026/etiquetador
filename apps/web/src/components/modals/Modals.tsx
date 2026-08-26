'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

type Project = { id: string; name: string; slug: string; description: string | null };

const PROJECTS_MOCK: Project[] = [
  { id: 'epdata-2026q3', name: 'EpData 2026-Q3', slug: 'epdata-2026q3', description: 'Validación cuantitativa · 3.662 fragmentos' },
  { id: 'epdata-2026q2', name: 'EpData 2026-Q2', slug: 'epdata-2026q2', description: 'Consolidación final · 1.224 fragmentos' },
  { id: 'epdata-sint', name: 'EpData Sintético v1', slug: 'epdata-sint', description: 'Línea base juez · 200 fragmentos' },
  { id: 'ods-2026', name: 'ODS 2026 (demo)', slug: 'ods-2026', description: 'Pilotaje en otros indicadores · 412' },
];

function projectColor(slug: string): string {
  if (slug.startsWith('epdata-2026q3') || slug.startsWith('epdata-2026q2')) return 'linear-gradient(135deg,#0e4a52,#1d6e75)';
  if (slug.startsWith('epdata-sint')) return 'linear-gradient(135deg,#5a4400,#8a6300)';
  if (slug.startsWith('ods-2026')) return 'linear-gradient(135deg,#7a1a1c,#b04143)';
  return 'linear-gradient(135deg,#3a4256,#6b6f7d)';
}

function projectTag(slug: string): string {
  if (slug.startsWith('epdata')) return 'E';
  if (slug.startsWith('ods')) return 'O';
  return '?';
}

export function Modals() {
  const router = useRouter();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dimensionWizardOpen, setDimensionWizardOpen] = useState(false);
  const [taxonomyGroupWizardOpen, setTaxonomyGroupWizardOpen] = useState(false);
  const [customScaleOpen, setCustomScaleOpen] = useState(false);
  const [dimensionPickerOpen, setDimensionPickerOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    function open() { setPickerOpen(true); }
    function openDim() { setDimensionWizardOpen(true); }
    function openTx() { setTaxonomyGroupWizardOpen(true); }
    function openCs() { setCustomScaleOpen(true); }
    function openDp() { setDimensionPickerOpen(true); }
    function showToast(e: any) { setToast(e.detail); setTimeout(() => setToast(null), 3000); }

    window.addEventListener('open-picker', open);
    window.addEventListener('open-dimension-wizard', openDim);
    window.addEventListener('open-taxonomy-group-wizard', openTx);
    window.addEventListener('open-custom-scale', openCs);
    window.addEventListener('open-dimension-picker', openDp);
    window.addEventListener('show-toast', showToast);
    return () => {
      window.removeEventListener('open-picker', open);
      window.removeEventListener('open-dimension-wizard', openDim);
      window.removeEventListener('open-taxonomy-group-wizard', openTx);
      window.removeEventListener('open-custom-scale', openCs);
      window.removeEventListener('open-dimension-picker', openDp);
      window.removeEventListener('show-toast', showToast);
    };
  }, []);

  async function pickProject(id: string) {
    await fetch('/api/active-project', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: id }),
    });
    setPickerOpen(false);
    router.refresh();
  }

  return (
    <>
      {/* PROJECT PICKER */}
      {pickerOpen && (
        <div className="picker-overlay" onClick={() => setPickerOpen(false)}>
          <div className="picker-card" onClick={e => e.stopPropagation()}>
            <svg className="ic-big" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
            <h2>Elige el proyecto</h2>
            <p className="lead">Esta sección se configura por proyecto. Selecciona con cuál quieres trabajar.</p>
            <div className="picker-list">
              {PROJECTS_MOCK.map(p => (
                <div key={p.id} className="picker-row" onClick={() => pickProject(p.id)}>
                  <div className="av" style={{ background: projectColor(p.slug), width: 38, height: 38, fontSize: 15 }}>{projectTag(p.slug)}</div>
                  <div className="meta">
                    <b>{p.name}</b>
                    <small>{p.description}</small>
                  </div>
                  <span className="badge-count">3 equipos</span>
                  <svg className="arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
                </div>
              ))}
            </div>
            <button className="btn" style={{ marginTop: 14 }} onClick={() => setPickerOpen(false)}>Volver al inicio</button>
          </div>
        </div>
      )}

      {/* DIMENSION WIZARD */}
      {dimensionWizardOpen && (
        <DimensionWizard
          onClose={() => setDimensionWizardOpen(false)}
          onOpenCustomScale={() => { setDimensionWizardOpen(false); setCustomScaleOpen(true); }}
          showToast={(msg) => { setToast(msg); setTimeout(() => setToast(null), 3000); }}
        />
      )}

      {/* CUSTOM SCALE DIALOG */}
      {customScaleOpen && (
        <CustomScaleDialog
          onClose={() => setCustomScaleOpen(false)}
          onBack={() => { setCustomScaleOpen(false); setDimensionWizardOpen(true); }}
        />
      )}

      {/* TAXONOMY GROUP WIZARD */}
      {taxonomyGroupWizardOpen && (
        <TaxonomyGroupWizard
          onClose={() => setTaxonomyGroupWizardOpen(false)}
        />
      )}

      {/* DIMENSION PICKER */}
      {dimensionPickerOpen && (
        <DimensionPicker
          onClose={() => setDimensionPickerOpen(false)}
        />
      )}

      {/* TOAST */}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}

// ─── Dimension Wizard (4 steps) ───────────────────────────────────────
function DimensionWizard({ onClose, onOpenCustomScale, showToast }: { onClose: () => void; onOpenCustomScale: () => void; showToast: (m: string) => void }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [scale, setScale] = useState('3-level');
  const [values, setValues] = useState<Array<{ name: string; color: string }>>([]);
  const [shortDesc, setShortDesc] = useState('');
  const [longDesc, setLongDesc] = useState('');

  // Inicializar valores según escala
  useEffect(() => {
    if (scale === 'boolean') setValues([{ name: 'Sí', color: '#d97757' }, { name: 'No', color: '#3d8268' }]);
    else if (scale === 'binary') setValues([{ name: 'Positivo', color: '#3d8268' }, { name: 'Negativo', color: '#d97757' }]);
    else if (scale === '3-level') setValues([{ name: 'Bajo', color: '#3d8268' }, { name: 'Medio', color: '#c79d3c' }, { name: 'Alto', color: '#d97757' }]);
    else if (scale === '5-level') setValues([{ name: 'Muy bajo', color: '#1c8a4a' }, { name: 'Bajo', color: '#3d8268' }, { name: 'Medio', color: '#c79d3c' }, { name: 'Alto', color: '#a85a35' }, { name: 'Muy alto', color: '#c0392b' }]);
    else if (scale === 'likert') setValues(Array.from({ length: 7 }, (_, i) => ({ name: String(i + 1), color: `hsl(${20 + i * 15}, 55%, ${50 - i * 3}%)` })));
    else if (scale === 'text') setValues([{ name: '(texto libre)', color: '#7d6c4f' }]);
  }, [scale]);

  useEffect(() => {
    if (name) {
      setSlug(name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''));
    }
  }, [name]);

  function next() {
    if (step === 1 && !name.trim()) return;
    if (step < 4) setStep(step + 1);
  }
  function prev() { if (step > 1) setStep(step - 1); }
  function create() {
    showToast(`"${name}" creada. Aparece en el catálogo de dimensiones.`);
    onClose();
  }

  return (
    <div className="wizard-overlay" onClick={onClose}>
      <div className="wizard-card" onClick={e => e.stopPropagation()}>
        <div className="wiz-head">
          <h2>Crear nueva dimensión</h2>
          <p className="lead">Las dimensiones son globales. Una vez creada, puedes asignarla a cualquier proyecto.</p>
        </div>
        <div className="wiz-steps">
          <div className={`wiz-step ${step === 1 ? 'active' : step > 1 ? 'done' : ''}`}><div className="wiz-num">{step > 1 ? '✓' : '1'}</div><div className="wiz-label">Nombre</div></div>
          <div className={`wiz-step ${step === 2 ? 'active' : step > 2 ? 'done' : ''}`}><div className="wiz-num">{step > 2 ? '✓' : '2'}</div><div className="wiz-label">Escala</div></div>
          <div className={`wiz-step ${step === 3 ? 'active' : step > 3 ? 'done' : ''}`}><div className="wiz-num">{step > 3 ? '✓' : '3'}</div><div className="wiz-label">Valores</div></div>
          <div className={`wiz-step ${step === 4 ? 'active' : ''}`}><div className="wiz-num">4</div><div className="wiz-label">Descripción</div></div>
        </div>
        <div className="wiz-body">
          {step === 1 && (
            <>
              <div className="wiz-row">
                <label>Nombre de la dimensión <span style={{ color: '#c0392b' }}>*</span></label>
                <input type="text" placeholder="Ej. Sesgo de odio" value={name} onChange={e => setName(e.target.value)} />
                <div className="wiz-hint">Será visible para todos los anotadores en la pantalla de etiquetado.</div>
              </div>
              <div className="wiz-row">
                <label>Slug (identificador interno)</label>
                <input type="text" value={slug} onChange={e => setSlug(e.target.value)} />
                <div className="wiz-hint">Solo letras, números y guiones. Se usa en URLs y en la API.</div>
              </div>
              <div className="wiz-row">
                <label>Descripción breve</label>
                <textarea placeholder="Una línea que aparecerá en el catálogo." value={shortDesc} onChange={e => setShortDesc(e.target.value)} />
                <div className="wiz-hint">Opcional. Hasta 200 caracteres.</div>
              </div>
            </>
          )}
          {step === 2 && (
            <>
              <div className="wiz-row">
                <label>Tipo de escala <span style={{ color: '#c0392b' }}>*</span></label>
                <select value={scale} onChange={e => setScale(e.target.value)}>
                  <option value="boolean">Booleano (2 valores)</option>
                  <option value="binary">Binario (2 valores)</option>
                  <option value="3-level">Tres niveles (3 valores)</option>
                  <option value="5-level">Cinco niveles (5 valores)</option>
                  <option value="likert">Likert 1–7 (7 valores)</option>
                  <option value="text">Texto libre (N valores)</option>
                </select>
                <div className="wiz-hint" style={{ marginTop: 0, marginBottom: 12 }}>Define cuántos valores tendrá la dimensión y cómo se puntúan.</div>
              </div>
              <div style={{ background: 'var(--primary-fade)', border: '1px solid var(--primary-2)', borderRadius: 8, padding: 14, marginTop: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
                <div style={{ fontSize: 13, color: 'var(--primary-2)' }}>
                  ¿No encaja con ninguna? <a href="#" onClick={(e) => { e.preventDefault(); onOpenCustomScale(); }} style={{ fontWeight: 500, textDecoration: 'underline' }}>Crea una escala personalizada</a> con sus propios valores.
                </div>
              </div>
            </>
          )}
          {step === 3 && scale !== 'text' && (
            <div className="wiz-row">
              <label>Valores de la dimensión</label>
              <div className="wiz-hint" style={{ marginTop: 0, marginBottom: 10 }}>Edita los nombres de cada valor. Aparecerán como opciones al anotar.</div>
              <div>
                {values.map((v, i) => (
                  <div key={i} className="cs-vrow">
                    <div className="cs-vcolor" style={{ background: v.color }}>
                      <input type="color" value={v.color} onChange={(e) => {
                        const newValues = [...values];
                        newValues[i] = { ...v, color: e.target.value };
                        setValues(newValues);
                      }} />
                    </div>
                    <input className="v-name" value={v.name} onChange={(e) => {
                      const newValues = [...values];
                      newValues[i] = { ...v, name: e.target.value };
                      setValues(newValues);
                    }} />
                    <span className="cs-vnum">#{i + 1}</span>
                  </div>
                ))}
                {scale !== 'likert' && scale !== 'boolean' && scale !== 'binary' && (
                  <button className="btn-mini" style={{ marginTop: 6 }} onClick={() => setValues([...values, { name: '', color: '#7d6c4f' }])}>+ Añadir valor</button>
                )}
              </div>
            </div>
          )}
          {step === 3 && scale === 'text' && (
            <div className="wiz-row">
              <label>Modo texto libre</label>
              <div style={{ padding: 14, background: 'var(--surface-2)', border: '1px solid var(--line-soft)', borderRadius: 7, fontSize: 13, color: 'var(--ink-3)' }}>
                En modo texto libre, los anotadores escriben el valor. No es necesario definir valores fijos.
              </div>
            </div>
          )}
          {step === 4 && (
            <>
              <div className="wiz-row">
                <label>Resumen</label>
                <div className="wiz-summary">
                  <div className="sm-row"><span className="sm-label">Nombre</span><span className="sm-value">{name || '—'}</span></div>
                  <div className="sm-row"><span className="sm-label">Slug</span><span className="sm-value" style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11.5 }}>{slug || '—'}</span></div>
                  <div className="sm-row"><span className="sm-label">Escala</span><span className="sm-value">{scale === '3-level' ? 'Tres niveles (3 valores)' : scale === '5-level' ? 'Cinco niveles (5 valores)' : scale === 'likert' ? 'Likert 1–7 (7 valores)' : scale === 'text' ? 'Texto libre' : scale}</span></div>
                  {values.length > 0 && (
                    <div className="sm-row">
                      <span className="sm-label">Valores ({values.length})</span>
                      <span className="sm-value sm-chips">
                        {values.map((v, i) => (
                          <span key={i} className="sm-chip" style={{ background: v.color }}><span className="sm-dot"></span>{v.name || '(sin nombre)'}</span>
                        ))}
                      </span>
                    </div>
                  )}
                  {shortDesc && <div className="sm-row"><span className="sm-label">Descripción breve</span><span className="sm-value">{shortDesc}</span></div>}
                </div>
              </div>
              <div className="wiz-row">
                <label>Descripción completa</label>
                <textarea placeholder="Define el criterio editorial, ejemplos, casos límite, lo que NO se considera..." value={longDesc} onChange={e => setLongDesc(e.target.value)} style={{ minHeight: 100 }} />
                <div className="wiz-hint">Aparece al lado del anotador cuando está etiquetando. Sé específico.</div>
              </div>
            </>
          )}
        </div>
        <div className="wiz-footer">
          <button className="btn" onClick={onClose}>Cancelar</button>
          <div className="wiz-actions">
            {step > 1 && <button className="btn" onClick={prev}>← Atrás</button>}
            {step < 4 ? <button className="btn primary" onClick={next}>Siguiente →</button> : <button className="btn primary" onClick={create}>Crear dimensión</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Custom Scale Dialog ──────────────────────────────────────────────
function CustomScaleDialog({ onClose, onBack }: { onClose: () => void; onBack: () => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('categorical');
  const [count, setCount] = useState(4);

  const defaults = (n: number) => {
    if (n === 1) return ['Sí'];
    if (n === 2) return ['Opción A', 'Opción B'];
    if (n === 3) return ['Bajo', 'Medio', 'Alto'];
    if (n === 4) return ['Muy bajo', 'Bajo', 'Alto', 'Muy alto'];
    if (n === 5) return ['Muy bajo', 'Bajo', 'Medio', 'Alto', 'Muy alto'];
    return Array.from({ length: n }, (_, i) => `Opción ${i + 1}`);
  };

  return (
    <div className="wizard-overlay" onClick={onClose}>
      <div className="picker-card" style={{ marginTop: 60, textAlign: 'left', maxWidth: 520 }} onClick={e => e.stopPropagation()}>
        <h2 style={{ textAlign: 'center', fontSize: 17, marginBottom: 4 }}>Crear escala personalizada</h2>
        <p className="lead" style={{ textAlign: 'center', marginBottom: 18 }}>Define un tipo de escala propio. Quedará guardado para futuras dimensiones.</p>
        <div className="wiz-row">
          <label>Nombre de la escala <span style={{ color: '#c0392b' }}>*</span></label>
          <input type="text" placeholder="Ej. Polaridad 0-10, Impacto periodístico" value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div className="wiz-row">
          <label>Tipo de valores</label>
          <select value={type} onChange={e => setType(e.target.value)}>
            <option value="categorical">Categórico (lista cerrada)</option>
            <option value="numerical">Numérico (rango 0-N)</option>
            <option value="free">Texto libre (anotador escribe)</option>
          </select>
          <div className="wiz-hint">Categórico: el anotador elige de N opciones. Numérico: introduce un número. Libre: campo abierto.</div>
        </div>
        {type !== 'free' && (
          <div className="wiz-row">
            <label>Número de valores</label>
            <input type="number" value={count} min={1} max={10} onChange={e => setCount(parseInt(e.target.value) || 1)} />
            <div className="wiz-hint">Entre 1 y 10.</div>
          </div>
        )}
        {type === 'categorical' && count > 0 && (
          <div className="wiz-row">
            <label>Vista previa</label>
            <div style={{ background: 'var(--surface-2)', border: '1px solid var(--line-soft)', borderRadius: 7, padding: '10px 12px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {defaults(count).map((d, i) => (
                <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 10, fontSize: 12, color: '#fff', fontWeight: 500, background: ['#d97757', '#a85a35', '#7d6c4f', '#3d8268', '#5b8fb8', '#8b6db5', '#c79d3c', '#9c5b8b', '#1c8a4a', '#3b6cb0'][i] }}>{d}</span>
              ))}
            </div>
            <div className="wiz-hint">Si los nombres no te convencen, puedes editarlos en el siguiente paso del wizard.</div>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--line-soft)' }}>
          <button className="btn" onClick={onBack}>← Volver</button>
          <button className="btn primary" onClick={() => { onBack(); }}>Crear y usar</button>
        </div>
      </div>
    </div>
  );
}

// ─── Taxonomy Group Wizard ───────────────────────────────────────────
function TaxonomyGroupWizard({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [color, setColor] = useState('cyan');
  function save() {
    onClose();
  }
  return (
    <div className="wizard-overlay" onClick={onClose}>
      <div className="wizard-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <div className="wiz-head">
          <h2>Crear nueva taxonomía</h2>
          <p className="lead">Las taxonomías agrupan dimensiones y se asignan como conjunto a proyectos.</p>
        </div>
        <div className="wiz-body">
          <div className="wiz-row">
            <label>Nombre de la taxonomía <span style={{ color: '#c0392b' }}>*</span></label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Ej. Sesgos sociodemográficos" />
          </div>
          <div className="wiz-row">
            <label>Descripción breve</label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="¿Qué agrupa esta taxonomía?" />
          </div>
          <div className="wiz-row">
            <label>Color</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['rose', 'amber', 'cyan', 'violet'] as const).map(c => (
                <div key={c} onClick={() => setColor(c)} style={{ width: 36, height: 36, borderRadius: 8, cursor: 'pointer', background: { rose: 'linear-gradient(135deg,#7a1a1c,#b04143)', amber: 'linear-gradient(135deg,#5a4400,#8a6300)', cyan: 'linear-gradient(135deg,#0d4a5a,#1a7088)', violet: 'linear-gradient(135deg,#3d2a4d,#5a4080)' }[c], border: color === c ? '3px solid var(--ink-1)' : '3px solid transparent' }} />
              ))}
            </div>
          </div>
        </div>
        <div className="wiz-footer">
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn primary" onClick={save}>Crear y añadir dimensiones</button>
        </div>
      </div>
    </div>
  );
}

// ─── Dimension Picker (assigning dimensions to project) ─────────────
function DimensionPicker({ onClose }: { onClose: () => void }) {
  const dims = [
    { id: 'tx-odio', name: 'Sesgo de odio', scale: 'Tres niveles', color: '#d97757', assigned: true },
    { id: 'tx-emot', name: 'Emotividad', scale: 'Tres niveles', color: '#a85a35', assigned: true },
    { id: 'tx-tenden', name: 'Carácter tendencioso', scale: 'Tres niveles', color: '#7d6c4f', assigned: true },
    { id: 'tx-semio', name: 'Semiótica', scale: 'Tres niveles', color: '#3d8268', assigned: true },
    { id: 'tx-genero', name: 'Género', scale: 'Tres niveles', color: '#5b8fb8', assigned: true },
    { id: 'tx-raza', name: 'Raza / etnia', scale: 'Tres niveles', color: '#8b6db5', assigned: false },
    { id: 'tx-religion', name: 'Religión', scale: 'Tres niveles', color: '#c79d3c', assigned: false },
    { id: 'tx-demo', name: 'Sesgo demográfico', scale: 'Tres niveles', color: '#9c5b8b', assigned: false },
    { id: 'tx-stat', name: 'Sesgo estadístico', scale: 'Tres niveles', color: '#5a7d8f', assigned: false },
    { id: 'tx-toxic', name: 'Toxicidad', scale: 'Likert 5', color: '#7a1a1c', assigned: false },
  ];
  const [search, setSearch] = useState('');
  const filtered = search ? dims.filter(d => d.name.toLowerCase().includes(search.toLowerCase())) : dims;
  return (
    <div className="wizard-overlay" onClick={onClose}>
      <div className="picker-card" style={{ marginTop: 24, textAlign: 'left' }} onClick={e => e.stopPropagation()}>
        <h2 style={{ textAlign: 'center' }}>Asignar dimensiones</h2>
        <p className="lead" style={{ textAlign: 'center' }}>Marca las dimensiones que quieres usar en este proyecto. Las que ya están asignadas aparecen marcadas.</p>
        <div className="tax-toolbar" style={{ marginBottom: 14, flexShrink: 0 }}>
          <input type="search" placeholder="Buscar dimensión..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="picker-list">
          {filtered.map(d => (
            <div key={d.id} className={`picker-row ${d.assigned ? 'is-assigned' : ''}`} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <div className="av" style={{ background: d.color, width: 34, height: 34, fontSize: 12 }}>{d.name.charAt(0)}</div>
              <div className="meta" style={{ flex: 1 }}>
                <b>{d.name}</b>
                <small>{d.scale} · 3 valores{d.assigned ? ' · asignada' : ''}</small>
              </div>
              {d.assigned ? <span className="badge green" style={{ fontSize: 10 }}>✓ Asignada</span> : <button className="btn-mini primary">Asignar</button>}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--line-soft)', flexShrink: 0 }}>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn primary" onClick={onClose}>Listo</button>
        </div>
      </div>
    </div>
  );
}
