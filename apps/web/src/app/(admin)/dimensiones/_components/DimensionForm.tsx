'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createDimension, updateDimension, archiveDimension } from '../actions/actions';
import { type DimensionKind } from '@/lib/dimension-kinds';
import type { Scale } from './types';
import CreateScaleModal from './CreateScaleModal';

const TK_COLORS: Array<{ id: string; label: string; hex: string }> = [
  { id: 'tk-odio', label: 'Odio', hex: '#d97757' },
  { id: 'tk-emot', label: 'Emotividad', hex: '#a85a35' },
  { id: 'tk-tend', label: 'Tendencioso', hex: '#7d6c4f' },
  { id: 'tk-semi', label: 'Semiótica', hex: '#3d8268' },
  { id: 'tk-gen', label: 'Género', hex: '#5b8fb8' },
  { id: 'tk-race', label: 'Raza', hex: '#8b6db5' },
  { id: 'tk-rel', label: 'Religión', hex: '#c79d3c' },
  { id: 'tk-demo', label: 'Demográfico', hex: '#9c5b8b' },
  { id: 'tk-stat', label: 'Estadístico', hex: '#5a7d8f' },
  { id: 'tk-toxic', label: 'Toxicidad', hex: '#7a1a1c' },
  { id: 'tk-fact', label: 'Fact.', hex: '#1c6e3a' },
];

const SUGGESTED_PALETTE: Array<{ hex: string; label: string }> = [
  { hex: '#7a1a1c', label: 'Rojo intenso' },
  { hex: '#b04143', label: 'Rojo' },
  { hex: '#d97757', label: 'Coral' },
  { hex: '#c79d3c', label: 'Mostaza' },
  { hex: '#8a6300', label: 'Ocre' },
  { hex: '#1c6e3a', label: 'Verde' },
  { hex: '#3d8268', label: 'Teal' },
  { hex: '#1d4a72', label: 'Azul' },
  { hex: '#5b8fb8', label: 'Celeste' },
  { hex: '#8b6db5', label: 'Lila' },
  { hex: '#9c5b8b', label: 'Magenta' },
  { hex: '#5a7d8f', label: 'Gris azulado' },
];

// Pre-defined scale types — match the card grid in
// mockup/overlays/tax-wizard-overlay.html (step 2).
type ScaleType = {
  key: string;
  title: string;
  pill: string;
  desc: string;
  example: string;
  kind: DimensionKind;
  defaultValues: ValueRow[];
};

const SCALE_TYPES: ScaleType[] = [
  {
    key: 'boolean',
    title: 'Booleano',
    pill: '2 valores',
    desc: 'Sí / No. Para presencia de un rasgo.',
    example: 'Ej. "¿Contiene error factual?"',
    kind: 'flag',
    defaultValues: [
      { label: 'Sí', value: 'yes', color: '#7a1a1c' },
      { label: 'No', value: 'no', color: '#1c6e3a' },
    ],
  },
  {
    key: 'binary',
    title: 'Binario',
    pill: '2 valores',
    desc: 'Positivo / Negativo. Para polaridad.',
    example: 'Ej. "Tono: positivo vs negativo"',
    kind: 'category',
    defaultValues: [
      { label: 'Positivo', value: 'positive', color: '#1c6e3a' },
      { label: 'Negativo', value: 'negative', color: '#7a1a1c' },
    ],
  },
  {
    key: '3-level',
    title: 'Tres niveles',
    pill: '3 valores',
    desc: 'Bajo / Medio / Alto. Para intensidad.',
    example: 'Ej. "Sesgo: bajo, medio, alto"',
    kind: 'category',
    defaultValues: [
      { label: 'Bajo', value: 'low', color: '#1c6e3a' },
      { label: 'Medio', value: 'mid', color: '#c79d3c' },
      { label: 'Alto', value: 'high', color: '#7a1a1c' },
    ],
  },
  {
    key: '5-level',
    title: 'Cinco niveles',
    pill: '5 valores',
    desc: 'Escala Likert estándar para matices.',
    example: 'Ej. "Calidad periodística"',
    kind: 'category',
    defaultValues: [
      { label: 'Muy bajo', value: '1', color: '#1c6e3a' },
      { label: 'Bajo', value: '2', color: '#3d8268' },
      { label: 'Medio', value: '3', color: '#c79d3c' },
      { label: 'Alto', value: '4', color: '#d97757' },
      { label: 'Muy alto', value: '5', color: '#7a1a1c' },
    ],
  },
  {
    key: 'likert',
    title: 'Likert 1–7',
    pill: '7 valores',
    desc: 'Para análisis fino o psicometría.',
    example: 'Ej. "Credibilidad percibida"',
    kind: 'intensity',
    defaultValues: [
      { label: '1', value: '1', color: '#1c6e3a' },
      { label: '2', value: '2', color: '#3d8268' },
      { label: '3', value: '3', color: '#5b8fb8' },
      { label: '4', value: '4', color: '#c79d3c' },
      { label: '5', value: '5', color: '#d97757' },
      { label: '6', value: '6', color: '#b04143' },
      { label: '7', value: '7', color: '#7a1a1c' },
    ],
  },
  {
    key: 'text',
    title: 'Texto libre',
    pill: 'N valores',
    desc: 'El anotador escribe el valor manualmente.',
    example: 'Ej. "Etiqueta abierta"',
    kind: 'free-text',
    defaultValues: [
      { label: 'Valor 1', value: 'v1', color: '#5a7d8f' },
    ],
  },
];

type ValueRow = { label: string; value: string; color: string };

function scaleTypeByKey(key: string): ScaleType | undefined {
  return SCALE_TYPES.find((s) => s.key === key);
}

function defaultValue(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

function autoSlug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function mapKindFromScaleName(name: string, scaleKind: string): DimensionKind {
  const n = name.toLowerCase();
  if (n.includes('booleano')) return 'flag';
  if (n.includes('binario')) return 'category';
  if (n.includes('tres niveles')) return 'category';
  if (n.includes('cinco niveles')) return 'category';
  if (n.includes('likert')) return 'intensity';
  if (n.includes('texto libre') || scaleKind === 'free-text') return 'free-text';
  return 'category';
}

export type DimensionInitial = {
  id: string;
  name: string;
  kind: DimensionKind;
  scaleId: string | null;
  scaleName: string | null;
  shortDescription: string | null;
  longDescription: string | null;
  /** TK color id (e.g. `tk-odio`). Visual only — no DB column yet, so on
   *  edit it falls back to the slug-derived color (see `pickColor` in the
   *  catalog) or `tk-odio` as last resort. */
  color: string | null;
  /** Existing dimension_values, sorted by `order`. Empty for a new dim. */
  values: ValueRow[];
};

/** Given the dimension's persisted scaleId + scaleName, decide whether the
 *  scale is one of the 6 hardcoded global presets (match by name) or a
 *  user-created custom scale. Falls back to the default `3-level` preset
 *  when the scale can't be resolved. */
function deriveScaleSelection(
  scaleId: string | null,
  scaleName: string | null,
): { scaleKind: 'global' | 'custom'; scaleKey: string; customScaleId: string | null } {
  if (scaleId && scaleName) {
    const name = scaleName.toLowerCase();
    for (const st of SCALE_TYPES) {
      if (name.includes(st.title.toLowerCase())) {
        return { scaleKind: 'global', scaleKey: st.key, customScaleId: null };
      }
    }
    return { scaleKind: 'custom', scaleKey: '3-level', customScaleId: scaleId };
  }
  return { scaleKind: 'global', scaleKey: '3-level', customScaleId: null };
}

const STEPS = [
  { key: 'nombre', label: 'Nombre', n: 1 },
  { key: 'escala', label: 'Escala', n: 2 },
  { key: 'valores', label: 'Valores', n: 3 },
  { key: 'descripcion', label: 'Descripción', n: 4 },
] as const;

type StepKey = (typeof STEPS)[number]['key'];

export default function DimensionForm({
  initial,
  scales,
  isSuperAdmin,
  onDone,
  onNewScale,
  compact = false,
}: {
  initial?: DimensionInitial;
  scales: Scale[];
  isSuperAdmin: boolean;
  onDone?: () => void;
  onNewScale?: (scale: Scale) => void;
  compact?: boolean;
}) {
  const router = useRouter();
  const isEdit = !!initial;

  const [step, setStep] = useState<StepKey>('nombre');

  const [name, setName] = useState(initial?.name ?? '');
  const [shortDesc, setShortDesc] = useState(initial?.shortDescription ?? '');
  const [longDesc, setLongDesc] = useState(initial?.longDescription ?? '');

  // Scale selection — derived from the dimension's persisted scaleId
  // + scaleName when editing, defaults to "3-level" for new.
  const initialScale = deriveScaleSelection(initial?.scaleId ?? null, initial?.scaleName ?? null);
  const [scaleKind, setScaleKind] = useState<'global' | 'custom'>(initialScale.scaleKind);
  const [scaleKey, setScaleKey] = useState<string>(initialScale.scaleKey);
  const [customScaleId, setCustomScaleId] = useState<string | null>(initialScale.customScaleId);

  // Values: from initial when editing, from the default scale when creating.
  // For custom scales we re-derive the levels so colors are populated.
  const initialValues: ValueRow[] = (() => {
    if (initial && initial.values.length > 0) return initial.values;
    if (initial && initial.scaleId) {
      const s = scales.find((x) => x.id === initial.scaleId);
      if (s) {
        return s.levels.length > 0
          ? s.levels.map((lv) => ({
              label: lv.label,
              value: lv.value,
              color: lv.color || '#5a7d8f',
            }))
          : [{ label: '', value: '', color: '#5a7d8f' }];
      }
    }
    const st = scaleTypeByKey(initialScale.scaleKey);
    return st ? st.defaultValues : [];
  })();
  const [values, setValues] = useState<ValueRow[]>(initialValues);
  const [showCreateScale, setShowCreateScale] = useState(false);

  // Color: use the stored value if present; otherwise default to the first
  // TK color. (DB column doesn't exist yet; see STATUS.md.)
  const [color, setColor] = useState<string>(initial?.color ?? TK_COLORS[0]!.id);

  const [stepError, setStepError] = useState<string | null>(null);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [submitOk, setSubmitOk] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const slugPreview = useMemo(() => autoSlug(name), [name]);

  // No startup effect: the initial-state factories above already produce
  // the right values, scales and color for both new and edit modes.

  function deriveValuesFromScale(s: Scale): ValueRow[] {
    if (s.levels.length === 0) {
      return [{ label: '', value: '', color: SUGGESTED_PALETTE[0]!.hex }];
    }
    return s.levels.map((lv) => ({
      label: lv.label,
      value: lv.value,
      color: lv.color || SUGGESTED_PALETTE[0]!.hex,
    }));
  }

  function pickScale(key: string) {
    setScaleKind('global');
    setScaleKey(key);
    setCustomScaleId(null);
    const st = scaleTypeByKey(key);
    if (st) setValues(st.defaultValues);
  }

  function pickCustomScale(id: string) {
    setScaleKind('custom');
    setCustomScaleId(id);
    const s = scales.find((x) => x.id === id);
    if (s) setValues(deriveValuesFromScale(s));
  }

  function updateValue(i: number, patch: Partial<ValueRow>) {
    setValues((prev) => prev.map((v, idx) => (idx === i ? { ...v, ...patch } : v)));
  }

  function addValue() {
    if (values.length >= 20) return;
    setValues((prev) => [
      ...prev,
      {
        label: '',
        value: '',
        color: SUGGESTED_PALETTE[prev.length % SUGGESTED_PALETTE.length]!.hex,
      },
    ]);
  }

  function removeValue(i: number) {
    if (values.length <= 1) return;
    setValues((prev) => prev.filter((_, idx) => idx !== i));
  }

  function onValueLabelBlur(i: number) {
    const v = values[i];
    if (v && !v.value && v.label) {
      updateValue(i, { value: defaultValue(v.label) });
    }
  }

  if (!isSuperAdmin) {
    return (
      <div className="card" style={{ background: 'var(--warn-bg)', color: '#5a4400' }}>
        Solo el superadmin puede crear o editar dimensiones.
      </div>
    );
  }

  function validateCurrentStep(): string | null {
    if (step === 'nombre') {
      if (name.trim().length < 2) return 'El nombre debe tener al menos 2 caracteres.';
      if (name.trim().length > 80) return 'El nombre no puede superar 80 caracteres.';
    }
    if (step === 'escala') {
      if (scaleKind === 'global' && !scaleKey) return 'Selecciona una escala.';
      if (scaleKind === 'custom' && !customScaleId) return 'Selecciona una escala personalizada.';
    }
    if (step === 'valores') {
      const filled = values.filter((v) => v.label.trim() !== '');
      if (filled.length === 0) return 'Añade al menos un valor con etiqueta.';
      const seen = new Set<string>();
      for (const v of filled) {
        const k = v.label.trim().toLowerCase();
        if (seen.has(k)) return `Etiqueta duplicada: "${v.label}"`;
        seen.add(k);
      }
    }
    return null;
  }

  function goNext() {
    const err = validateCurrentStep();
    if (err) {
      setStepError(err);
      return;
    }
    setStepError(null);
    const idx = STEPS.findIndex((s) => s.key === step);
    if (idx < STEPS.length - 1) {
      const next = STEPS[idx + 1];
      if (next) setStep(next.key);
    }
  }

  function goBack() {
    setStepError(null);
    const idx = STEPS.findIndex((s) => s.key === step);
    if (idx > 0) {
      const prev = STEPS[idx - 1];
      if (prev) setStep(prev.key);
    }
  }

  function jumpTo(target: StepKey) {
    // Only allow jumping back to a step we've already passed.
    const currentIdx = STEPS.findIndex((s) => s.key === step);
    const targetIdx = STEPS.findIndex((s) => s.key === target);
    if (targetIdx < currentIdx) {
      setStepError(null);
      setStep(target);
    }
  }

  function onSubmit() {
    setSubmitErr(null);
    setSubmitOk(null);
    const trimmedValues = values
      .filter((v) => v.label.trim() !== '')
      .map((v, i) => ({
        label: v.label.trim(),
        value: (v.value.trim() || defaultValue(v.label)).slice(0, 32),
        color: v.color,
        order: i,
      }));
    let resolvedKind: DimensionKind = 'category';
    let resolvedScaleId: string | null = null;
    if (scaleKind === 'custom' && customScaleId) {
      const s = scales.find((x) => x.id === customScaleId);
      if (!s) return setSubmitErr('Escala personalizada no encontrada');
      resolvedKind = mapKindFromScaleName(s.name, s.kind);
      resolvedScaleId = customScaleId;
    } else if (scaleKey) {
      const st = scaleTypeByKey(scaleKey);
      if (st) {
        resolvedKind = st.kind;
        const match = scales.find((x) => x.name.toLowerCase().includes(st.title.toLowerCase()));
        if (match) resolvedScaleId = match.id;
      }
    }
    const payload = {
      name: name.trim(),
      kind: resolvedKind,
      scaleId: resolvedScaleId,
      shortDescription: shortDesc.trim() || undefined,
      longDescription: longDesc.trim() || undefined,
      color,
      customValues: trimmedValues,
    };
    startTransition(async () => {
      const res = isEdit
        ? await updateDimension({ ...payload, id: initial!.id })
        : await createDimension(payload);
      if (res.ok) {
        setSubmitOk(isEdit ? 'Cambios guardados.' : 'Dimensión creada.');
        router.refresh();
        if (onDone) {
          setTimeout(() => onDone(), 350);
        }
      } else {
        setSubmitErr(res.error);
      }
    });
  }

  function onArchive() {
    if (!initial) return;
    if (!confirm(`¿Archivar la dimensión "${initial.name}"?\nDejará de aparecer en los selectores activos.`)) {
      return;
    }
    setSubmitErr(null);
    startTransition(async () => {
      const res = await archiveDimension({ id: initial.id });
      if (res.ok) {
        router.refresh();
        if (onDone) onDone();
      } else {
        setSubmitErr(res.error);
      }
    });
  }

  return (
    <div className="wizard">
      {/* Stepper */}
      <div className="wizard-stepper" role="tablist" aria-label="Pasos del wizard">
        {STEPS.map((s, i) => {
          const currentIdx = STEPS.findIndex((x) => x.key === step);
          const state =
            i < currentIdx ? 'done' : i === currentIdx ? 'active' : 'pending';
          return (
            <button
              type="button"
              key={s.key}
              className={`wizard-step wizard-step--${state}`}
              onClick={() => jumpTo(s.key)}
              aria-current={state === 'active' ? 'step' : undefined}
              disabled={state === 'pending'}
            >
              <span className="wizard-step__num">{s.n}</span>
              <span className="wizard-step__label">{s.label}</span>
            </button>
          );
        })}
      </div>

      {/* Step content */}
      <div className="wizard-body card">
        {step === 'nombre' ? (
          <div className="wizard-step-body">
            <Field
              label="Nombre de la dimensión"
              required
              help="Será visible para todos los anotadores en la pantalla de etiquetado."
            >
              <input
                type="text"
                required
                minLength={2}
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={inputStyle}
                placeholder="Ej. Sesgo de odio"
                autoFocus
              />
            </Field>
            {slugPreview ? (
              <div className="wizard-field__help" style={{ marginTop: -8 }}>
                <b>Identificador interno:</b> <code>{slugPreview}</code>
                <span style={{ color: 'var(--ink-4)' }}> (se genera automáticamente)</span>
              </div>
            ) : null}
            <Field
              label="Descripción breve"
              help="Opcional. Hasta 200 caracteres."
            >
              <textarea
                rows={3}
                maxLength={200}
                value={shortDesc}
                onChange={(e) => setShortDesc(e.target.value)}
                style={{ ...inputStyle, resize: 'vertical' }}
                placeholder="Una línea que aparecerá en el catálogo."
              />
            </Field>
          </div>
        ) : null}

        {step === 'escala' ? (
          <div className="wizard-step-body">
            <div className="wizard-field">
              <label className="wizard-field__label">
                Tipo de escala<span style={{ color: 'var(--danger)' }}> *</span>
              </label>
              <div className="wizard-field__help" style={{ marginBottom: 10 }}>
                Define cuántos valores tendrá la dimensión y cómo se puntúan.
              </div>
              <div className="scale-grid">
                {SCALE_TYPES.map((st) => {
                  const selected = scaleKind === 'global' && scaleKey === st.key;
                  return (
                    <button
                      type="button"
                      key={st.key}
                      className={`scale-card ${selected ? 'is-selected' : ''}`}
                      onClick={() => pickScale(st.key)}
                    >
                      <div className="scale-card__title">
                        {st.title}
                        <span className="scale-card__pill">{st.pill}</span>
                      </div>
                      <div className="scale-card__desc">{st.desc}</div>
                      <div className="scale-card__ex">{st.example}</div>
                    </button>
                  );
                })}
                {scales.filter((s) => s.name).map((s) => {
                  const selected = scaleKind === 'custom' && customScaleId === s.id;
                  return (
                    <button
                      type="button"
                      key={s.id}
                      className={`scale-card ${selected ? 'is-selected' : ''}`}
                      onClick={() => pickCustomScale(s.id)}
                    >
                      <div className="scale-card__title">
                        {s.name}
                        <span className="scale-card__pill">
                          {s.levels.length} {s.levels.length === 1 ? 'nivel' : 'niveles'}
                        </span>
                      </div>
                      <div className="scale-card__desc">Escala personalizada.</div>
                      <div className="scale-card__ex">Creada desde el catálogo o el wizard.</div>
                    </button>
                  );
                })}
                {isSuperAdmin ? (
                  <button
                    type="button"
                    className="scale-card scale-card--new"
                    onClick={() => setShowCreateScale(true)}
                  >
                    <div className="scale-card__plus">+</div>
                    <div className="scale-card__title" style={{ color: 'var(--primary-2)' }}>
                      Crear escala personalizada
                    </div>
                    <div className="scale-card__desc" style={{ textAlign: 'center' }}>
                      Define un tipo propio con sus valores.
                    </div>
                  </button>
                ) : null}
              </div>
              <div className="wizard-field__help" style={{ marginTop: 10 }}>
                ¿No encaja con ninguna?{' '}
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    if (isSuperAdmin) setShowCreateScale(true);
                  }}
                >
                  Crea una escala a medida
                </a>{' '}
                con sus propios valores.
              </div>
            </div>
          </div>
        ) : null}

        {step === 'valores' ? (
          <div className="wizard-step-body">
            <div className="wizard-field">
              <label className="wizard-field__label">Valores de la dimensión</label>
              <div className="wizard-field__help" style={{ marginBottom: 10 }}>
                Define cada valor con su nombre y color. Aparecerán como opciones al
                anotar.
              </div>
              <div className="value-rows">
                {values.map((v, i) => (
                  <div key={i} className="value-row">
                    <button
                      type="button"
                      className="value-swatch"
                      style={{ background: v.color }}
                      onClick={() => {
                        const idx = SUGGESTED_PALETTE.findIndex((p) => p.hex === v.color);
                        const next = SUGGESTED_PALETTE[(idx + 1) % SUGGESTED_PALETTE.length]!;
                        updateValue(i, { color: next.hex });
                      }}
                      title="Click para cambiar el color"
                    />
                    <span className="value-row__idx">{i + 1}</span>
                    <input
                      type="text"
                      value={v.label}
                      onChange={(e) => updateValue(i, { label: e.target.value })}
                      onBlur={() => onValueLabelBlur(i)}
                      placeholder="Etiqueta (p.ej. Bajo)"
                      style={{ ...inputStyle, flex: 1 }}
                    />
                    <input
                      type="text"
                      value={v.value}
                      onChange={(e) => updateValue(i, { value: e.target.value })}
                      placeholder="valor-interno"
                      style={{
                        ...inputStyle,
                        width: 160,
                        fontFamily: 'JetBrains Mono, monospace',
                        fontSize: 12.5,
                      }}
                    />
                    <button
                      type="button"
                      className="btn-mini danger-mini"
                      onClick={() => removeValue(i)}
                      disabled={values.length <= 1}
                      aria-label={`Quitar valor ${i + 1}`}
                      title="Quitar"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="btn-mini"
                style={{ marginTop: 8 }}
                onClick={addValue}
                disabled={values.length >= 20}
              >
                + Añadir valor
              </button>
              {values.length > 0 ? (
                <div className="wizard-field__help" style={{ marginTop: 8 }}>
                  {values.length} {values.length === 1 ? 'valor' : 'valores'}{' '}
                  configurados.
                </div>
              ) : null}
            </div>
            <div className="wizard-field">
              <label className="wizard-field__label">Paleta sugerida</label>
              <div className="wizard-field__help" style={{ marginBottom: 8 }}>
                Aplica a los valores automáticamente si no los has personalizado.
              </div>
              <div className="palette-suggest">
                {SUGGESTED_PALETTE.map((p) => (
                  <button
                    type="button"
                    key={p.hex}
                    className="palette-swatch"
                    title={p.label}
                    onClick={() => {
                      setValues((prev) =>
                        prev.map((v) => ({ ...v, color: p.hex })),
                      );
                    }}
                    style={{ background: p.hex }}
                  />
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {step === 'descripcion' ? (
          <div className="wizard-step-body">
            <div className="wizard-field">
              <label className="wizard-field__label">Resumen</label>
              <div className="wiz-summary">
                <div className="wiz-summary__name">{name || '(sin nombre)'}</div>
                <div className="wiz-summary__meta">
                  <span>
                    <b>Slug:</b> <code>{slugPreview || '—'}</code>
                  </span>
                  <span>
                    <b>Escala:</b>{' '}
                    {scaleKind === 'custom' && customScaleId
                      ? scales.find((s) => s.id === customScaleId)?.name ?? '—'
                      : scaleTypeByKey(scaleKey)?.title ?? '—'}{' '}
                    ({values.length} {values.length === 1 ? 'valor' : 'valores'})
                  </span>
                  <span>
                    <b>Color:</b>{' '}
                    <span
                      className={`tax-color ${color}`}
                      style={{
                        display: 'inline-block',
                        width: 14,
                        height: 14,
                        verticalAlign: 'middle',
                        borderRadius: 3,
                      }}
                    />
                    {TK_COLORS.find((c) => c.id === color)?.label}
                  </span>
                </div>
                {values.length > 0 ? (
                  <div className="wiz-summary__values">
                    {values.map((v, i) => (
                      <span
                        key={i}
                        className="scale-pill values"
                        style={{ borderLeft: `3px solid ${v.color}` }}
                      >
                        {v.label || `valor ${i + 1}`}
                      </span>
                    ))}
                  </div>
                ) : null}
                {shortDesc ? (
                  <div className="wiz-summary__short">{shortDesc}</div>
                ) : null}
              </div>
            </div>
            <Field
              label="Color de la tarjeta"
              help="Solo visual. Aparecerá en la cuadrícula del catálogo."
            >
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {TK_COLORS.map((c) => {
                  const sel = c.id === color;
                  return (
                    <button
                      type="button"
                      key={c.id}
                      onClick={() => setColor(c.id)}
                      title={c.label}
                      aria-label={c.label}
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 7,
                        border: sel ? '2px solid var(--ink-1)' : '1px solid var(--line)',
                        background: c.hex,
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    />
                  );
                })}
              </div>
            </Field>
            <Field
              label="Descripción larga"
              help="Opcional. Hasta 2000 caracteres. Aparece en la página de detalle."
            >
              <textarea
                rows={6}
                maxLength={2000}
                value={longDesc}
                onChange={(e) => setLongDesc(e.target.value)}
                style={{ ...inputStyle, resize: 'vertical' }}
                placeholder="Contexto, criterios de anotación, ejemplos. Lo que un anotador nuevo necesita saber para puntuar bien."
              />
            </Field>
          </div>
        ) : null}

        {stepError ? <Alert kind="error" message={stepError} /> : null}
        {submitErr ? <Alert kind="error" message={submitErr} /> : null}
        {submitOk ? <Alert kind="success" message={submitOk} /> : null}
      </div>

      {/* Footer with nav */}
      <div className="wizard-footer">
        {compact ? (
          <button
            type="button"
            className="btn"
            onClick={() => onDone?.()}
            disabled={pending}
          >
            Cancelar
          </button>
        ) : (
          <a href="/dimensiones" className="btn">
            Cancelar
          </a>
        )}
        <div style={{ flex: 1 }} />
        <button type="button" className="btn" onClick={goBack} disabled={step === 'nombre' || pending}>
          ← Atrás
        </button>
        {step !== 'descripcion' ? (
          <button type="button" className="btn primary" onClick={goNext} disabled={pending}>
            Siguiente →
          </button>
        ) : (
          <button
            type="button"
            className="btn primary"
            onClick={onSubmit}
            disabled={pending}
            aria-busy={pending}
          >
            {pending ? (isEdit ? 'Guardando…' : 'Creando…') : isEdit ? 'Guardar cambios' : 'Crear dimensión'}
          </button>
        )}
        {isEdit ? (
          <button
            type="button"
            className="btn"
            onClick={onArchive}
            disabled={pending}
            style={{ color: 'var(--danger)', marginLeft: 8 }}
          >
            Archivar
          </button>
        ) : null}
      </div>

      <CreateScaleModal
        open={showCreateScale}
        onClose={() => setShowCreateScale(false)}
        onCreated={(s) => {
          onNewScale?.(s);
          setShowCreateScale(false);
          setScaleKind('custom');
          setCustomScaleId(s.id);
          setValues(deriveValuesFromScale(s));
        }}
      />
    </div>
  );
}

/* ─── Step / Field helpers ─────────────────────────────────────────── */

function Field({
  label,
  help,
  required,
  children,
}: {
  label: string;
  help?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="wizard-field">
      <label className="wizard-field__label">
        {label}
        {required ? <span style={{ color: 'var(--danger)' }}> *</span> : null}
      </label>
      {children}
      {help ? <div className="wizard-field__help">{help}</div> : null}
    </div>
  );
}

function Alert({ kind, message }: { kind: 'error' | 'success'; message: string }) {
  return (
    <div
      style={{
        background: kind === 'error' ? 'var(--danger-bg)' : 'var(--success-bg)',
        color: kind === 'error' ? 'var(--danger)' : 'var(--success)',
        border:
          kind === 'error' ? '1px solid #e6c4c4' : '1px solid #c5e3d2',
        borderRadius: 7,
        padding: '9px 12px',
        fontSize: 12.5,
        marginTop: 12,
      }}
    >
      {message}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 11px',
  border: '1px solid var(--line)',
  borderRadius: 7,
  font: 'inherit',
  fontSize: 14,
  background: 'var(--surface)',
  color: 'var(--ink-1)',
};
