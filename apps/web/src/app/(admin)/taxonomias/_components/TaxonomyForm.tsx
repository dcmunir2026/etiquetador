'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { createTaxonomy, updateTaxonomy } from '../actions/actions';
import { TAXONOMY_COLOR_OPTIONS, type TaxonomyColor, autoSlug } from '../actions/schemas';

export type TaxonomyInitial = {
  id: string;
  name: string;
  shortDescription: string | null;
  longDescription: string | null;
  color: TaxonomyColor;
};

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
        border: kind === 'error' ? '1px solid #e6c4c4' : '1px solid #c5e3d2',
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

export default function TaxonomyForm({
  initial,
  onClose,
  compact = false,
}: {
  initial?: TaxonomyInitial;
  onClose: () => void;
  /** When true, the cancel button just calls onClose (used in modal). */
  compact?: boolean;
}) {
  const router = useRouter();
  const isEdit = !!initial;
  const [name, setName] = useState(initial?.name ?? '');
  const [shortDesc, setShortDesc] = useState(initial?.shortDescription ?? '');
  const [longDesc, setLongDesc] = useState(initial?.longDescription ?? '');
  const [color, setColor] = useState<TaxonomyColor>(initial?.color ?? 'cyan');
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [submitOk, setSubmitOk] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const slugPreview = useMemo(() => autoSlug(name), [name]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  function validate(): string | null {
    if (name.trim().length < 2) return 'El nombre debe tener al menos 2 caracteres.';
    if (name.trim().length > 80) return 'El nombre no puede superar 80 caracteres.';
    return null;
  }

  function onSubmit() {
    setSubmitErr(null);
    setSubmitOk(null);
    const err = validate();
    if (err) {
      setSubmitErr(err);
      return;
    }
    const payload = {
      name: name.trim(),
      shortDescription: shortDesc.trim() || undefined,
      longDescription: longDesc.trim() || undefined,
      color,
    };
    startTransition(async () => {
      const res = isEdit
        ? await updateTaxonomy({ ...payload, id: initial!.id })
        : await createTaxonomy(payload);
      if (res.ok) {
        setSubmitOk(isEdit ? 'Cambios guardados.' : 'Taxonomía creada.');
        router.refresh();
        setTimeout(() => onClose(), 350);
      } else {
        setSubmitErr(res.error);
      }
    });
  }

  const title = isEdit ? 'Editar taxonomía' : 'Nueva taxonomía';

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-card" style={{ maxWidth: 560 }}>
        <div className="modal-head">
          <div>
            <h2 className="modal-title">{title}</h2>
            <p className="modal-lead">
              Las taxonomías agrupan dimensiones para asignarlas como conjunto a los proyectos.
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
        <div className="modal-body">
          <Field label="Nombre" required help="Visible para todos los anotadores al elegir taxonomía.">
            <input
              type="text"
              required
              minLength={2}
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={inputStyle}
              placeholder="Ej. Sesgo y toxicidad"
              autoFocus
            />
          </Field>
          {slugPreview ? (
            <div className="wizard-field__help" style={{ marginTop: -8 }}>
              <b>Identificador interno:</b> <code>{slugPreview}</code>
              <span style={{ color: 'var(--ink-4)' }}> (se genera automáticamente)</span>
            </div>
          ) : null}
          <Field label="Descripción breve" help="Opcional. Hasta 160 caracteres.">
            <textarea
              rows={2}
              maxLength={160}
              value={shortDesc}
              onChange={(e) => setShortDesc(e.target.value)}
              style={{ ...inputStyle, resize: 'vertical' }}
              placeholder="Una línea que aparece en la lista."
            />
          </Field>
          <Field label="Descripción larga" help="Opcional. Hasta 2000 caracteres.">
            <textarea
              rows={4}
              maxLength={2000}
              value={longDesc}
              onChange={(e) => setLongDesc(e.target.value)}
              style={{ ...inputStyle, resize: 'vertical' }}
              placeholder="Criterios, ejemplos, contexto. Aparece en la página de detalle."
            />
          </Field>
          <Field label="Color de la tarjeta" help="Solo visual. Aparecerá en la lista.">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {TAXONOMY_COLOR_OPTIONS.map((c) => {
                const sel = c.id === color;
                return (
                  <button
                    type="button"
                    key={c.id}
                    onClick={() => setColor(c.id)}
                    title={c.label}
                    aria-label={c.label}
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 9,
                      border: sel ? '2px solid var(--ink-1)' : '1px solid var(--line)',
                      background: c.preview,
                      cursor: 'pointer',
                      padding: 0,
                      position: 'relative',
                    }}
                  >
                    {sel ? (
                      <span
                        aria-hidden
                        style={{
                          position: 'absolute',
                          inset: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#fff',
                          fontSize: 18,
                          fontWeight: 700,
                        }}
                      >
                        ✓
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </Field>
          {submitErr ? <Alert kind="error" message={submitErr} /> : null}
          {submitOk ? <Alert kind="success" message={submitOk} /> : null}
        </div>
        <div className="wizard-footer">
          {compact ? (
            <button type="button" className="btn" onClick={onClose} disabled={pending}>
              Cancelar
            </button>
          ) : (
            <button type="button" className="btn" onClick={onClose} disabled={pending}>
              Cancelar
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button
            type="button"
            className="btn primary"
            onClick={onSubmit}
            disabled={pending}
            aria-busy={pending}
          >
            {pending ? (isEdit ? 'Guardando…' : 'Creando…') : isEdit ? 'Guardar cambios' : 'Crear taxonomía'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
