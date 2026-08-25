'use client';

import { useEffect, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { createIntensityScale } from '@/lib/scales';
import { SCALE_KINDS, SCALE_KIND_LABELS, type ScaleKind } from '@/lib/scale-kinds';
import type { Scale } from './types';

type LevelRow = { label: string; value: string };

const KIND_LABELS = SCALE_KIND_LABELS;

function defaultValue(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

export default function CreateScaleModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (scale: Scale) => void;
}) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<ScaleKind>('numerical');
  const [levels, setLevels] = useState<LevelRow[]>([
    { label: '', value: '' },
    { label: '', value: '' },
  ]);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  // Reset form when opened
  useEffect(() => {
    if (open) {
      setName('');
      setKind('numerical');
      setLevels([
        { label: '', value: '' },
        { label: '', value: '' },
      ]);
      setErr(null);
    }
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  function updateLevel(i: number, patch: Partial<LevelRow>) {
    setLevels((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function addLevel() {
    if (levels.length >= 20) return;
    setLevels((prev) => [...prev, { label: '', value: '' }]);
  }

  function removeLevel(i: number) {
    if (levels.length <= 1) return;
    setLevels((prev) => prev.filter((_, idx) => idx !== i));
  }

  function onLabelBlur(i: number) {
    // Auto-fill value if blank.
    const lv = levels[i];
    if (lv && !lv.value && lv.label) {
      updateLevel(i, { value: defaultValue(lv.label) });
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    startTransition(async () => {
      const res = await createIntensityScale({ name, kind, levels });
      if (res.ok) {
        const newScale: Scale = {
          id: res.scale.id,
          name: res.scale.name,
          kind: res.scale.kind,
          levels: res.scale.levels,
        };
        onCreated(newScale);
      } else {
        setErr(res.error);
      }
    });
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Nueva escala de intensidad"
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-card scale-card">
        <div className="modal-head">
          <div>
            <h2 className="modal-title">Nueva escala de intensidad</h2>
            <p className="modal-lead">
              Crea una escala personalizada para usar en dimensiones. Disponible para
              todo el equipo desde el selector de escalas.
            </p>
          </div>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>
        <form className="modal-body" onSubmit={onSubmit}>
          <div className="wizard-field">
            <label className="wizard-field__label">
              Nombre<span style={{ color: 'var(--danger)' }}> *</span>
            </label>
            <input
              type="text"
              required
              minLength={2}
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={inputStyle}
              placeholder="p.ej. Escala Likert 5 invertida"
              autoFocus
            />
          </div>

          <div className="wizard-field">
            <label className="wizard-field__label">Tipo</label>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as ScaleKind)}
              style={inputStyle}
            >
              {SCALE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABELS[k] ?? k}
                </option>
              ))}
            </select>
            <div className="wizard-field__help">
              El tipo es metadata: define cómo se interpreta. Los valores reales son los
              que añadas abajo.
            </div>
          </div>

          <div className="wizard-field">
            <label className="wizard-field__label">
              Valores<span style={{ color: 'var(--danger)' }}> *</span>
            </label>
            <div className="wizard-field__help" style={{ marginBottom: 6 }}>
              Etiqueta visible para el anotador + valor interno. La etiqueta se
              autocompleta con un slug si dejas el valor vacío.
            </div>
            <div className="scale-levels">
              {levels.map((lv, i) => (
                <div key={i} className="scale-level-row">
                  <div className="scale-level-idx">{i + 1}</div>
                  <input
                    type="text"
                    value={lv.label}
                    onChange={(e) => updateLevel(i, { label: e.target.value })}
                    onBlur={() => onLabelBlur(i)}
                    placeholder="Etiqueta (p.ej. Bajo)"
                    style={{ ...inputStyle, flex: 1 }}
                    required
                  />
                  <input
                    type="text"
                    value={lv.value}
                    onChange={(e) => updateLevel(i, { value: e.target.value })}
                    placeholder="valor-interno"
                    style={{ ...inputStyle, width: 160, fontFamily: 'JetBrains Mono, monospace', fontSize: 12.5 }}
                  />
                  <button
                    type="button"
                    className="btn-mini danger-mini"
                    onClick={() => removeLevel(i)}
                    disabled={levels.length <= 1}
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
              onClick={addLevel}
              disabled={levels.length >= 20}
            >
              + Añadir valor
            </button>
          </div>

          {err ? (
            <div
              style={{
                background: 'var(--danger-bg)',
                color: 'var(--danger)',
                border: '1px solid #e6c4c4',
                borderRadius: 7,
                padding: '9px 12px',
                fontSize: 12.5,
                marginTop: 4,
              }}
            >
              {err}
            </div>
          ) : null}

          <div className="wizard-footer" style={{ marginTop: 18, padding: '12px 0 0' }}>
            <button type="button" className="btn" onClick={onClose} disabled={pending}>
              Cancelar
            </button>
            <div style={{ flex: 1 }} />
            <button
              type="submit"
              className="btn primary"
              disabled={pending || !name.trim()}
              aria-busy={pending}
            >
              {pending ? 'Creando…' : 'Crear escala'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
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
