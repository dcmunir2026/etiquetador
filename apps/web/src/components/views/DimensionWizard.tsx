'use client';

/**
 * Five-step dimension wizard: name, scale, values, description and
 * skip-logic. Ported from the mockup's `openDimensionWizard()` flow, with
 * the final step persisting through a server action.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createDimension, createScale } from '@/app/actions/catalog';
import type { DimensionRow } from '@/lib/queries';
import { wouldCycle, type CascadeDimension } from '@/lib/cascade';

type Scale = { id: string; name: string; kind: string; isCustom: boolean };

const PALETTE = ['#d97757', '#a85a35', '#7d6c4f', '#3d8268', '#5b8fb8', '#8b6db5', '#c79d3c', '#9c5b8b'];

/** The built-in scale presets offered in step 2, with their default values. */
const SCALE_PRESETS: Array<{
  key: string; title: string; pill: string; desc: string; example: string;
  kind: string; labels: string[];
}> = [
  { key: 'boolean', title: 'Booleano', pill: '2 valores', desc: 'Sí / No. Para presencia de un rasgo.', example: 'Ej. "¿Contiene error factual?"', kind: 'boolean', labels: ['Sí', 'No'] },
  { key: 'binary', title: 'Binario', pill: '2 valores', desc: 'Positivo / Negativo. Para polaridad.', example: 'Ej. "Tono: positivo vs negativo"', kind: 'binary', labels: ['Positivo', 'Negativo'] },
  { key: '3-level', title: 'Tres niveles', pill: '3 valores', desc: 'Bajo / Medio / Alto. Para intensidad.', example: 'Ej. "Sesgo: bajo, medio, alto"', kind: '3-level', labels: ['Bajo', 'Medio', 'Alto'] },
  { key: '5-level', title: 'Cinco niveles', pill: '5 valores', desc: 'Escala Likert estándar para matices.', example: 'Ej. "Calidad periodística"', kind: '5-level', labels: ['Muy bajo', 'Bajo', 'Medio', 'Alto', 'Muy alto'] },
  { key: 'likert', title: 'Likert 1–7', pill: '7 valores', desc: 'Para análisis fino o psicometría.', example: 'Ej. "Credibilidad percibida"', kind: 'likert', labels: ['1', '2', '3', '4', '5', '6', '7'] },
  { key: 'text', title: 'Texto libre', pill: 'N valores', desc: 'El anotador escribe el valor manualmente.', example: 'Ej. "Etiqueta abierta"', kind: 'free-text', labels: [] },
];

const TEMPLATES: Record<string, string> = {
  hate: 'Identifica expresiones de odio o rechazo dirigidas a grupos protegidos (raza, religión, género, orientación sexual, etnia, nacionalidad, discapacidad). NO se considera odio: crítica política, relato negativo de hechos, vocabulario crudo sin carga. SÍ: deshumanización, generalización ofensiva, insulto identitario, incitación.',
  quality: 'Evalúa la calidad periodística en cuatro ejes: rigor factual (¿citas verificables?), equilibrio (¿múltiples fuentes?), contexto (¿datos de fondo?) y claridad. Asignar el valor más bajo si falla gravemente en alguno.',
  emotion: 'Mide el tono emocional dominante: positivo (esperanza, logro), negativo (miedo, conflicto), neutro (hechos sin carga). Si coexisten con claridad, elegir el dominante.',
};

function slugify(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

type WizValue = { label: string; color: string };

export function DimensionWizard({
  dimensions, scales, onClose,
}: {
  dimensions: DimensionRow[]; scales: Scale[]; onClose: () => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [shortDesc, setShortDesc] = useState('');
  const [longDesc, setLongDesc] = useState('');
  const [scaleKey, setScaleKey] = useState<string | null>(null);
  const [customScaleId, setCustomScaleId] = useState<string | null>(null);
  const [values, setValues] = useState<WizValue[]>([]);
  const [parentId, setParentId] = useState('');
  const [depValue, setDepValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showCustomScale, setShowCustomScale] = useState(false);

  // Slug follows the name until the user edits it directly.
  useEffect(() => {
    if (!slugTouched) setSlug(slugify(name));
  }, [name, slugTouched]);

  const preset = SCALE_PRESETS.find((p) => p.key === scaleKey) ?? null;
  const isFreeText = preset?.kind === 'free-text';

  const graph: CascadeDimension[] = useMemo(
    () => dimensions.map((d) => ({
      id: d.id, name: d.name, kind: d.kind, values: d.values, dependency: d.dependency,
    })),
    [dimensions],
  );
  const parent = dimensions.find((d) => d.id === parentId) ?? null;

  function chooseScale(key: string) {
    const p = SCALE_PRESETS.find((x) => x.key === key)!;
    setScaleKey(key);
    setCustomScaleId(null);
    setValues(p.labels.map((label, i) => ({ label, color: PALETTE[i % PALETTE.length]! })));
  }

  function validate(target: number): string | null {
    if (target > 1 && !name.trim()) return 'El nombre es obligatorio.';
    if (target > 2 && !scaleKey && !customScaleId) return 'Elige un tipo de escala.';
    if (target > 3 && !isFreeText && values.filter((v) => v.label.trim()).length === 0) {
      return 'Al menos un valor debe tener nombre.';
    }
    return null;
  }

  function go(target: number) {
    const err = validate(target);
    if (err && target > step) { setError(err); return; }
    setError(null);
    setStep(Math.max(1, Math.min(5, target)));
  }

  async function submit() {
    const err = validate(5);
    if (err) { setError(err); return; }
    if (parentId && depValue && wouldCycle('__new__', parentId, graph)) {
      setError('Ciclo detectado: no se puede depender de una dimensión que ya depende de esta.');
      return;
    }

    setSaving(true);
    setError(null);

    // The wizard's preset maps onto an existing scale row by name.
    const scaleId = customScaleId
      ?? scales.find((s) => s.kind === (preset?.kind ?? ''))?.id
      ?? null;

    const kind = isFreeText ? 'free-text'
      : preset?.kind === 'boolean' || preset?.kind === 'binary' ? 'flag'
      : preset?.kind === '3-level' || preset?.kind === '5-level' || preset?.kind === 'likert' ? 'intensity'
      : 'category';

    const res = await createDimension({
      name: name.trim(),
      slug: slug.trim(),
      shortDescription: shortDesc.trim(),
      longDescription: longDesc.trim(),
      scaleId,
      kind,
      values: isFreeText ? [] : values.filter((v) => v.label.trim()),
      dependency: parentId && depValue ? { parentId, values: [depValue] } : null,
    });

    setSaving(false);
    if (!res.ok) { setError(res.error); return; }
    onClose();
    router.refresh();
  }

  const STEPS = ['Nombre', 'Escala', 'Valores', 'Descripción', 'Dependencias'];

  return (
    <div style={{
      display: 'block', position: 'fixed', inset: 0, background: 'rgba(20,23,30,0.45)',
      zIndex: 60, backdropFilter: 'blur(2px)', overflowY: 'auto',
    }}>
      <div className="wiz-card">
        <div className="wiz-header">
          <h2>Crear nueva dimensión</h2>
          <p>Las dimensiones son globales. Una vez creada, puedes agruparla en una taxonomía y asignarla a cualquier proyecto.</p>
        </div>

        <div className="wiz-steps">
          {STEPS.map((label, i) => (
            <div key={label} className={`wiz-step${step === i + 1 ? ' active' : ''}${step > i + 1 ? ' done' : ''}`}
                 onClick={() => go(i + 1)} style={{ cursor: 'pointer' }}>
              <div className="wiz-num"><span>{i + 1}</span></div>
              <div className="wiz-label">{label}</div>
            </div>
          ))}
        </div>

        <div className="wiz-body">
          {step === 1 && (
            <>
              <div className="wiz-row">
                <label>Nombre de la dimensión <span className="req">*</span></label>
                <input type="text" placeholder="Ej. Sesgo de odio" value={name} onChange={(e) => setName(e.target.value)} />
                <div className="wiz-hint">Será visible para todos los anotadores en la pantalla de etiquetado.</div>
              </div>
              <div className="wiz-row">
                <label>Slug (identificador interno)</label>
                <input type="text" placeholder="sesgo-de-odio" value={slug}
                       onChange={(e) => { setSlugTouched(true); setSlug(e.target.value); }} />
                <div className="wiz-hint">Solo letras, números y guiones. Se usa en URLs y en la API.</div>
              </div>
              <div className="wiz-row">
                <label>Descripción breve</label>
                <textarea placeholder="Una línea que aparecerá en el catálogo." value={shortDesc}
                          maxLength={200} onChange={(e) => setShortDesc(e.target.value)} />
                <div className="wiz-hint">Opcional. Hasta 200 caracteres.</div>
              </div>
            </>
          )}

          {step === 2 && (
            <div className="wiz-row">
              <label>Tipo de escala <span className="req">*</span></label>
              <div className="wiz-hint" style={{ marginTop: 0, marginBottom: 12 }}>
                Define cuántos valores tendrá la dimensión y cómo se puntúan.
              </div>
              <div className="wiz-scale-grid">
                {SCALE_PRESETS.map((p) => (
                  <div key={p.key} className={`wiz-scale-card${scaleKey === p.key ? ' selected' : ''}`}
                       onClick={() => chooseScale(p.key)}>
                    <div className="sc-title">{p.title} <span className="sc-pill">{p.pill}</span></div>
                    <div className="sc-desc">{p.desc}</div>
                    <div className="sc-ex">{p.example}</div>
                  </div>
                ))}
                <div className="wiz-scale-card wiz-scale-new" onClick={() => setShowCustomScale(true)}
                     style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                              borderStyle: 'dashed', borderColor: 'var(--primary-2)', background: 'transparent',
                              textAlign: 'center', minHeight: 118 }}>
                  <div style={{ fontSize: 24, color: 'var(--primary-2)', fontWeight: 300, lineHeight: 1 }}>+</div>
                  <div className="sc-title" style={{ color: 'var(--primary-2)', marginTop: 6 }}>Crear escala personalizada</div>
                  <div className="sc-desc" style={{ textAlign: 'center' }}>Define un tipo propio con sus valores.</div>
                </div>
              </div>
              {customScaleId && (
                <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--ok)' }}>
                  Escala personalizada creada y seleccionada.
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <>
              <div className="wiz-row">
                <label>Valores de la dimensión</label>
                <div className="wiz-hint" style={{ marginTop: 0, marginBottom: 10 }}>
                  {isFreeText
                    ? 'Esta escala es de texto libre: el anotador escribe el valor, no hay lista cerrada.'
                    : 'Define cada valor con su nombre y color. Aparecerán como opciones al anotar.'}
                </div>
                {!isFreeText && (
                  <>
                    <div>
                      {values.map((v, i) => (
                        <div key={i} className="wiz-value-row" style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                          <input type="color" value={v.color} style={{ width: 34, height: 32, padding: 2, border: '1px solid var(--line)', borderRadius: 6 }}
                                 onChange={(e) => setValues(values.map((x, j) => j === i ? { ...x, color: e.target.value } : x))} />
                          <input type="text" value={v.label} placeholder={`Valor ${i + 1}`} style={{ flex: 1 }}
                                 onChange={(e) => setValues(values.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} />
                          <button className="btn-mini" onClick={() => setValues(values.filter((_, j) => j !== i))}>Quitar</button>
                        </div>
                      ))}
                    </div>
                    <button className="btn-mini" onClick={() => setValues([...values, { label: '', color: PALETTE[values.length % PALETTE.length]! }])}>
                      + Añadir valor
                    </button>
                    <div className="wiz-hint" style={{ marginTop: 8 }}>
                      {values.filter((v) => v.label.trim()).length} valores con nombre.
                    </div>
                  </>
                )}
              </div>
              {!isFreeText && (
                <div className="wiz-row">
                  <label>Paleta sugerida</label>
                  <div className="wiz-color-suggest">
                    {PALETTE.map((c) => (
                      <span key={c} style={{ display: 'inline-block', width: 22, height: 22, borderRadius: 6, background: c, marginRight: 6, cursor: 'pointer' }}
                            onClick={() => setValues(values.map((v, i) => ({ ...v, color: PALETTE[i % PALETTE.length]! })))} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {step === 4 && (
            <>
              <div className="wiz-row">
                <label>Resumen</label>
                <div className="wiz-summary">
                  <div className="sm-row"><span className="sm-label">Nombre</span><span className="sm-value">{name || '—'}</span></div>
                  <div className="sm-row"><span className="sm-label">Slug</span><span className="sm-value" style={{ fontFamily: 'monospace', fontSize: 11.5 }}>{slug || '—'}</span></div>
                  <div className="sm-row"><span className="sm-label">Escala</span><span className="sm-value">{preset?.title ?? (customScaleId ? 'Personalizada' : '—')}</span></div>
                  <div className="sm-row">
                    <span className="sm-label">Valores ({values.length})</span>
                    <span className="sm-value sm-chips">
                      {isFreeText
                        ? <span style={{ color: 'var(--ink-4)', fontStyle: 'italic' }}>texto libre</span>
                        : values.filter((v) => v.label.trim()).map((v) => (
                            <span key={v.label} className="sm-chip" style={{ background: v.color }}>
                              <span className="sm-dot" />{v.label}
                            </span>
                          ))}
                    </span>
                  </div>
                </div>
              </div>
              <div className="wiz-row">
                <label>Descripción completa</label>
                <textarea placeholder="Define el criterio editorial, ejemplos, casos límite, lo que NO se considera..."
                          style={{ minHeight: 120 }} value={longDesc} onChange={(e) => setLongDesc(e.target.value)} />
                <div className="wiz-hint">Aparece junto al anotador cuando está etiquetando. Sé específico.</div>
              </div>
              <div className="wiz-row">
                <label>Plantilla sugerida <span style={{ color: 'var(--ink-4)', fontWeight: 400 }}>(rellenar automáticamente)</span></label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button className="btn-mini" onClick={() => setLongDesc(TEMPLATES.hate!)}>Plantilla: Sesgo de odio</button>
                  <button className="btn-mini" onClick={() => setLongDesc(TEMPLATES.quality!)}>Plantilla: Calidad periodística</button>
                  <button className="btn-mini" onClick={() => setLongDesc(TEMPLATES.emotion!)}>Plantilla: Tono emocional</button>
                </div>
              </div>
            </>
          )}

          {step === 5 && (
            <>
              <div style={{ marginBottom: 14 }}>
                <h3 style={{ margin: '0 0 6px' }}>Dependencias (skip logic)</h3>
                <p className="lead" style={{ fontSize: 12.5, color: 'var(--ink-3)', margin: 0 }}>
                  Configura si esta dimensión debe mostrarse solo cuando otra tenga un valor concreto.
                </p>
              </div>
              <div style={{ background: '#fdf3da', border: '1px solid #e8d49c', borderLeft: '3px solid #b58300',
                            padding: '10px 14px', borderRadius: '0 6px 6px 0', marginBottom: 14, fontSize: 12.5, color: '#5a3e00' }}>
                <b>Skip logic:</b> si no defines dependencia, la dimensión será siempre visible.
                Cuando el padre no coincide, esta dimensión se guarda como <b>saltada</b>, no como vacía.
              </div>
              <div style={{ padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--line)',
                            borderRadius: 6, marginBottom: 14, fontSize: 13 }}>
                Dependencia actual:{' '}
                {parent && depValue
                  ? <b>{parent.name} = {depValue}</b>
                  : <i style={{ color: 'var(--ink-3)' }}>ninguna (dimensión raíz)</i>}
              </div>

              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5 }}>
                Dimensión padre
              </label>
              <select value={parentId} onChange={(e) => { setParentId(e.target.value); setDepValue(''); }}
                      style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--line)', borderRadius: 6,
                               fontSize: 13, background: 'var(--surface-2)', cursor: 'pointer' }}>
                <option value="">— sin dependencia (siempre visible) —</option>
                {dimensions.filter((d) => d.status === 'active' && d.values.length > 0).map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>

              {parent && (
                <div style={{ marginTop: 14 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5 }}>
                    Mostrar solo cuando el padre sea:
                  </label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <select value={depValue} onChange={(e) => setDepValue(e.target.value)}
                            style={{ flex: 1, padding: '7px 10px', border: '1px solid var(--line)', borderRadius: 6,
                                     fontSize: 13, background: 'var(--surface-2)', cursor: 'pointer' }}>
                      <option value="">— elige un valor —</option>
                      {parent.values.map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                    <div style={{ padding: '7px 12px', background: '#fdf3da', border: '1px solid #e8d49c', borderRadius: 6,
                                  fontSize: 12.5, color: '#8a6300', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 14 }}>⊘</span> Saltar (ocultar)
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {error && (
            <div style={{ marginTop: 14, padding: '9px 12px', background: '#fbe6e6', border: '1px solid #e8c5c5',
                          borderLeft: '3px solid var(--bad)', borderRadius: '0 6px 6px 0', fontSize: 12.5, color: '#5a2222' }}>
              {error}
            </div>
          )}
        </div>

        <div className="wiz-footer">
          <button className="btn" onClick={onClose}>Cancelar</button>
          <div className="wiz-actions">
            {step > 1 && <button className="btn" onClick={() => go(step - 1)}>← Atrás</button>}
            {step < 5 && <button className="btn primary" onClick={() => go(step + 1)}>Siguiente →</button>}
            {step === 5 && (
              <button className="btn primary" onClick={submit} disabled={saving}>
                {saving ? 'Creando…' : 'Crear dimensión'}
              </button>
            )}
          </div>
        </div>
      </div>

      {showCustomScale && (
        <CustomScaleDialog
          onClose={() => setShowCustomScale(false)}
          onCreated={(id, labels) => {
            setCustomScaleId(id);
            setScaleKey(null);
            setValues(labels.map((label, i) => ({ label, color: PALETTE[i % PALETTE.length]! })));
            setShowCustomScale(false);
          }}
        />
      )}
    </div>
  );
}

/** Step 2's "crear escala personalizada" dialog. */
function CustomScaleDialog({
  onClose, onCreated,
}: {
  onClose: () => void; onCreated: (id: string, labels: string[]) => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<'categorical' | 'numerical' | 'free'>('categorical');
  const [count, setCount] = useState(4);
  const [numMax, setNumMax] = useState(10);
  const [desc, setDesc] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const labels = useMemo(() => {
    if (type === 'free') return ['(texto libre)'];
    if (type === 'numerical') return Array.from({ length: numMax + 1 }, (_, i) => String(i));
    const defaults: Record<number, string[]> = {
      1: ['Único'], 2: ['Sí', 'No'], 3: ['Bajo', 'Medio', 'Alto'],
      4: ['Ninguno', 'Bajo', 'Medio', 'Alto'],
      5: ['Muy bajo', 'Bajo', 'Medio', 'Alto', 'Muy alto'],
    };
    return defaults[count] ?? Array.from({ length: count }, (_, i) => `Valor ${i + 1}`);
  }, [type, count, numMax]);

  async function save() {
    if (!name.trim()) { setError('El nombre de la escala es obligatorio.'); return; }
    setSaving(true);
    const kind = type === 'free' ? 'free-text' : type === 'numerical' ? 'numerical' : 'categorical';
    const res = await createScale({ name: name.trim(), kind: kind as never, labels, description: desc });
    setSaving(false);
    if (!res.ok) { setError(res.error); return; }
    onCreated(res.id!, labels);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,23,30,0.55)', zIndex: 70,
                  backdropFilter: 'blur(2px)', overflowY: 'auto' }}>
      <div className="picker-card" style={{ marginTop: 60, textAlign: 'left', maxWidth: 520 }}>
        <h2 style={{ textAlign: 'center', fontSize: 17, marginBottom: 4 }}>Crear escala personalizada</h2>
        <p className="lead" style={{ textAlign: 'center', marginBottom: 18 }}>
          Define un tipo de escala propio. Quedará guardada para futuras dimensiones.
        </p>

        <div className="wiz-row">
          <label>Nombre de la escala <span style={{ color: '#c0392b' }}>*</span></label>
          <input type="text" placeholder="Ej. Polaridad 0-10" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="wiz-row">
          <label>Tipo de valores</label>
          <select value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            <option value="categorical">Categórico (lista cerrada)</option>
            <option value="numerical">Numérico (rango 0-N)</option>
            <option value="free">Texto libre (anotador escribe)</option>
          </select>
        </div>

        {type === 'categorical' && (
          <div className="wiz-row">
            <label>Número de valores</label>
            <input type="number" min={1} max={10} value={count} onChange={(e) => setCount(Number(e.target.value))} />
          </div>
        )}
        {type === 'numerical' && (
          <div className="wiz-row">
            <label>Rango numérico</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="number" value={0} style={{ width: 80 }} disabled />
              <span style={{ color: 'var(--ink-3)' }}>a</span>
              <input type="number" min={2} max={100} value={numMax} onChange={(e) => setNumMax(Number(e.target.value))} />
            </div>
          </div>
        )}

        <div className="wiz-row">
          <label>Vista previa de valores</label>
          <div style={{ background: 'var(--surface-2)', border: '1px solid var(--line-soft)', borderRadius: 7,
                        padding: '10px 12px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {labels.slice(0, 12).map((l) => <span key={l} className="scale-pill">{l}</span>)}
            {labels.length > 12 && <span className="scale-pill">+{labels.length - 12}</span>}
          </div>
        </div>

        <div className="wiz-row">
          <label>Descripción (opcional)</label>
          <textarea placeholder="¿Cuándo se usa esta escala?" style={{ minHeight: 50 }}
                    value={desc} onChange={(e) => setDesc(e.target.value)} />
        </div>

        {error && <div style={{ fontSize: 12.5, color: 'var(--bad)', marginBottom: 10 }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16,
                      paddingTop: 14, borderTop: '1px solid var(--line-soft)' }}>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn primary" onClick={save} disabled={saving}>
            {saving ? 'Creando…' : 'Crear y usar'}
          </button>
        </div>
      </div>
    </div>
  );
}
