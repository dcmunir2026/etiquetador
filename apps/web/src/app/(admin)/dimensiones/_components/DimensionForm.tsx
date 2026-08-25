'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createDimension, updateDimension, archiveDimension } from '../actions/actions';
import { DIMENSION_KINDS, DIMENSION_KIND_LABELS, type DimensionKind } from '@/lib/dimension-kinds';
import type { Scale } from './types';

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

export type DimensionInitial = {
  id: string;
  name: string;
  kind: DimensionKind;
  scaleId: string;
  shortDescription: string | null;
  longDescription: string | null;
};

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
  compact = false,
}: {
  initial?: DimensionInitial;
  scales: Scale[];
  isSuperAdmin: boolean;
  onDone?: () => void;
  compact?: boolean;
}) {
  const router = useRouter();
  const isEdit = !!initial;

  const [step, setStep] = useState<StepKey>('nombre');

  const [name, setName] = useState(initial?.name ?? '');
  const [slug, setSlug] = useState('');
  const [shortDesc, setShortDesc] = useState(initial?.shortDescription ?? '');
  const [kind, setKind] = useState<DimensionKind>(initial?.kind ?? 'category');
  const [scaleId, setScaleId] = useState(initial?.scaleId ?? scales[0]?.id ?? '');
  const [color, setColor] = useState(TK_COLORS[0]!.id);
  const [longDesc, setLongDesc] = useState(initial?.longDescription ?? '');

  const [stepError, setStepError] = useState<string | null>(null);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [submitOk, setSubmitOk] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const selectedScale = useMemo(
    () => scales.find((s) => s.id === scaleId),
    [scales, scaleId],
  );

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
      if (slug.trim() && !/^[a-z0-9-]+$/.test(slug.trim())) {
        return 'El slug solo puede tener minúsculas, números y guiones.';
      }
    }
    if (step === 'escala' || step === 'valores') {
      if (!scaleId) return 'Selecciona una escala.';
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
    const payload = {
      name: name.trim(),
      kind,
      scaleId,
      shortDescription: shortDesc.trim() || undefined,
      longDescription: longDesc.trim() || undefined,
      color,
    };
    startTransition(async () => {
      const res = isEdit
        ? await updateDimension({ ...payload, id: initial!.id })
        : await createDimension(payload);
      if (res.ok) {
        setSubmitOk(isEdit ? 'Cambios guardados.' : 'Dimensión creada.');
        router.refresh();
        if (onDone) {
          // small delay so the success message is visible before unmounting
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
                placeholder="p.ej. Sesgo de odio"
                autoFocus
              />
            </Field>
            <Field
              label="Slug (identificador interno)"
              help="Solo letras, números y guiones. Se usa en URLs y en la API."
            >
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                style={inputStyle}
                placeholder="(se genera desde el nombre si lo dejas vacío)"
              />
            </Field>
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
            <Field
              label="Tipo de dimensión"
              help="Categoría: valores discretos · Intensidad: escala numérica · Flag: presencia/ausencia · Texto libre."
            >
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as DimensionKind)}
                style={inputStyle}
              >
                {DIMENSION_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {DIMENSION_KIND_LABELS[k] ?? k}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Escala de intensidad"
              required
              help="Define los valores que tendrán los anotadores para elegir. Los valores se copiarán al crear la dimensión."
            >
              <select
                value={scaleId}
                onChange={(e) => setScaleId(e.target.value)}
                style={inputStyle}
                required
              >
                {scales.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.levels.length} {s.levels.length === 1 ? 'nivel' : 'niveles'})
                  </option>
                ))}
              </select>
            </Field>
            {selectedScale && selectedScale.levels.length > 0 ? (
              <div className="wizard-preview" aria-live="polite">
                <b>Vista previa de los valores:</b>
                <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {selectedScale.levels.map((l) => (
                    <span key={l.value} className="scale-pill values">
                      {l.label}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {step === 'valores' ? (
          <div className="wizard-step-body">
            {selectedScale && selectedScale.levels.length > 0 ? (
              <>
                <p className="lead" style={{ marginBottom: 12 }}>
                  La dimensión <b>{name.trim() || '(sin nombre)'}</b> se creará con los
                  siguientes valores, copiados de la escala{' '}
                  <b>{selectedScale.name}</b>. Estos valores son los que verán los
                  anotadores.
                </p>
                <div className="wizard-values">
                  {selectedScale.levels.map((l, i) => (
                    <div key={l.value} className="wizard-value-row">
                      <div className="wizard-value-idx">{i + 1}</div>
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--ink-1)' }}>
                          {l.label}
                        </div>
                        <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
                          Valor interno: <code>{l.value}</code>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="wizard-hint">
                  <b>Nota:</b> los valores se crean al guardar. Si necesitas una escala
                  con valores distintos, créala primero en el editor de escalas
                  (issue #16).
                </div>
              </>
            ) : (
              <div className="empty">Selecciona una escala en el paso anterior.</div>
            )}
          </div>
        ) : null}

        {step === 'descripcion' ? (
          <div className="wizard-step-body">
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
