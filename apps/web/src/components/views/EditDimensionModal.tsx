'use client';

/**
 * Edit one dimension. Two branches:
 *  - annotationCount > 0  → read-only banner explaining why the dimension
 *    is locked. The server-side updateDimension() enforces the same rule,
 *    so this is purely UX guidance.
 *  - annotationCount === 0 → full form: name, slug, descriptions, scale
 *    (via the existing Scale[]), and the value list.
 *
 * The component is intentionally not coupled to DimensionWizard — the
 * wizard is a 5-step create flow and would over-engineer an edit. We
 * reuse the same primitives (PALETTE, slugify, the wiz-row class) where
 * they fit, and the reusable <Modal> for the shell.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateDimension } from '@/app/actions/catalog';
import type { DimensionRow } from '@/lib/queries';
import { Modal } from '@/components/shared/Modal';

type Scale = { id: string; name: string; kind: string; isCustom: boolean };

type Kind = 'category' | 'intensity' | 'flag' | 'free-text';

const PALETTE = ['#d97757', '#a85a35', '#7d6c4f', '#3d8268', '#5b8fb8', '#8b6db5', '#c79d3c', '#9c5b8b'];

function slugify(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Synthetic scale id used to render "Texto libre" as a select option. */
const FREE_TEXT_SCALE_ID = '__free_text__';

export function EditDimensionModal({
  dimension, scales, onClose,
}: {
  dimension: DimensionRow; scales: Scale[]; onClose: () => void;
}) {
  const router = useRouter();
  const locked = dimension.annotationCount > 0;

  // Initial state from the loaded row.
  const [formName, setFormName] = useState(dimension.name);
  const [formSlug, setFormSlug] = useState(dimension.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(false);
  const [formShort, setFormShort] = useState(dimension.shortDescription ?? '');
  const [formLong, setFormLong] = useState(dimension.longDescription ?? '');

  // kind is what controls the UI (free-text hides the values editor).
  // The scaleId selector drives scaleId in the payload; for free-text we
  // send null and the server treats it as 'free-text'.
  const initialKind: Kind = (dimension.kind as Kind) ?? 'category';
  const [formKind, setFormKind] = useState<Kind>(initialKind);
  const [formScaleId, setFormScaleId] = useState<string>(
    initialKind === 'free-text' ? FREE_TEXT_SCALE_ID : (dimension.scaleId ?? ''),
  );
  const [formValues, setFormValues] = useState<Array<{ label: string; color: string }>>(() => {
    return dimension.values.map((label, i) => ({
      label,
      color: PALETTE[i % PALETTE.length] ?? '#777',
    }));
  });

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Slug follows the name until the user edits it directly.
  useEffect(() => {
    if (!slugTouched) setFormSlug(slugify(formName));
  }, [formName, slugTouched]);

  // Picking "Texto libre" in the scale <select> flips the kind; picking
  // any preset scale derives the kind from it. We can't go the other way
  // (kind → scale) here without round-tripping the wizard's mapping, so
  // we just keep scaleId as the source of truth and recompute kind.
  const selectedScale = useMemo(
    () => scales.find((s) => s.id === formScaleId) ?? null,
    [scales, formScaleId],
  );

  function onScaleChange(next: string) {
    setFormScaleId(next);
    if (next === FREE_TEXT_SCALE_ID) {
      setFormKind('free-text');
      setFormValues([]);
    } else {
      const s = scales.find((x) => x.id === next);
      if (s) {
        // Mirror the wizard's preset.kind → dimension.kind mapping
        // (apps/web/src/components/views/DimensionWizard.tsx:121-124).
        const kind: Kind =
          s.kind === 'boolean' || s.kind === 'binary' ? 'flag'
          : s.kind === '3-level' || s.kind === '5-level' || s.kind === 'likert' ? 'intensity'
          : 'category';
        setFormKind(kind);
      }
    }
  }

  function setValueAt(i: number, patch: Partial<{ label: string; color: string }>) {
    setFormValues((prev) => prev.map((v, j) => (j === i ? { ...v, ...patch } : v)));
  }

  function removeValue(i: number) {
    setFormValues((prev) => prev.filter((_, j) => j !== i));
  }

  function addValue() {
    setFormValues((prev) => [...prev, { label: '', color: PALETTE[prev.length % PALETTE.length] ?? '#777' }]);
  }

  async function submit() {
    if (locked) { onClose(); return; }
    if (!formName.trim()) { setError('El nombre es obligatorio.'); return; }
    if (formKind !== 'free-text' && formValues.filter((v) => v.label.trim()).length === 0) {
      setError('Al menos un valor debe tener nombre.'); return;
    }

    setSaving(true);
    setError(null);

    // Diff against the loaded row — only send keys that actually changed.
    const patch: Parameters<typeof updateDimension>[1] = {};
    if (formName.trim() !== dimension.name) patch.name = formName.trim();
    if ((formSlug.trim() || '') !== (dimension.slug ?? '')) patch.slug = formSlug.trim();
    const newShort = formShort.trim() || null;
    if ((newShort ?? null) !== (dimension.shortDescription ?? null)) patch.shortDescription = newShort ?? undefined;
    const newLong = formLong.trim() || null;
    if ((newLong ?? null) !== (dimension.longDescription ?? null)) patch.longDescription = newLong ?? undefined;
    const newScaleId = formKind === 'free-text' ? null : formScaleId || null;
    if (newScaleId !== (dimension.scaleId ?? null)) patch.scaleId = newScaleId;
    if (formKind !== initialKind) patch.kind = formKind;
    if (formKind !== 'free-text') {
      const nextValues = formValues
        .filter((v) => v.label.trim())
        .map((v) => ({ label: v.label.trim(), color: v.color }));
      const prevValues = dimension.values;
      const valuesChanged =
        nextValues.length !== prevValues.length
        || nextValues.some((v, i) => v.label !== prevValues[i] || (v.color ?? null) !== null);
      // Compare colors loosely — server doesn't preserve colors through
      // DimensionRow (it ships only labels), so any color change triggers
      // a re-write. Cheap and avoids a separate queries.ts migration.
      if (valuesChanged) patch.values = nextValues;
    }

    const res = await updateDimension(dimension.id, patch);
    setSaving(false);
    if (!res.ok) { setError(res.error); return; }
    onClose();
    router.refresh();
  }

  return (
    <Modal
      title="Editar dimensión"
      subtitle={dimension.name}
      right={locked
        ? `${dimension.annotationCount.toLocaleString('es-ES')} anotaciones`
        : `${scales.length} escalas disponibles`}
      onClose={onClose}
      maxWidth={680}
    >
      {locked ? (
        <div data-testid="edit-locked">
          <div style={{
            background: '#fdf3da', border: '1px solid #e8d49c', borderLeft: '3px solid #b58300',
            padding: '12px 14px', borderRadius: '0 6px 6px 0', marginBottom: 14,
            fontSize: 13, color: '#5a3e00',
          }}>
            <b>Bloqueada por datos existentes.</b>{' '}
            Esta dimensión tiene <b>{dimension.annotationCount.toLocaleString('es-ES')}</b> anotaciones
            registradas. Cambiar la escala o los valores dejaría etiquetas apuntando a textos que ya
            no existen en el catálogo — los reportes y métricas perderían trazabilidad.
          </div>
          <div style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 18 }}>
            Para poder editar esta dimensión primero archívala (botón "Archivar" en la card). Si
            lo que quieres es reemplazar la escala, crea una dimensión nueva y reasígnala en las
            taxonomías correspondientes.
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button className="btn" onClick={onClose}>Cerrar</button>
          </div>
        </div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); submit(); }} data-testid="edit-form">
          <div className="wiz-row">
            <label>Nombre de la dimensión <span className="req">*</span></label>
            <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} />
          </div>

          <div className="wiz-row">
            <label>Slug (identificador interno)</label>
            <input
              type="text"
              value={formSlug}
              onChange={(e) => { setSlugTouched(true); setFormSlug(e.target.value); }}
            />
            <div className="wiz-hint">Solo letras, números y guiones. Se usa en URLs y en la API.</div>
          </div>

          <div className="wiz-row">
            <label>Descripción breve</label>
            <textarea
              value={formShort} maxLength={200}
              onChange={(e) => setFormShort(e.target.value)}
              placeholder="Una línea que aparecerá en el catálogo."
            />
            <div className="wiz-hint">Opcional. Hasta 200 caracteres.</div>
          </div>

          <div className="wiz-row">
            <label>Descripción completa</label>
            <textarea
              value={formLong} min-height="100" style={{ minHeight: 100 }}
              onChange={(e) => setFormLong(e.target.value)}
              placeholder="Define el criterio editorial, ejemplos, casos límite…"
            />
          </div>

          <div className="wiz-row">
            <label>Tipo de escala <span className="req">*</span></label>
            <select
              value={formScaleId}
              onChange={(e) => onScaleChange(e.target.value)}
              style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--line)',
                       borderRadius: 6, fontSize: 13, background: 'var(--surface-2)' }}
            >
              <option value="">— elige una escala —</option>
              {scales.map((s) => (
                <option key={s.id} value={s.id}>{s.name}{s.isCustom ? ' (personalizada)' : ''}</option>
              ))}
              <option value={FREE_TEXT_SCALE_ID}>Texto libre (anotador escribe)</option>
            </select>
            <div className="wiz-hint">
              Cambiar la escala está permitido solo porque esta dimensión aún no tiene anotaciones.
            </div>
          </div>

          {formKind !== 'free-text' && (
            <div className="wiz-row">
              <label>Valores de la dimensión</label>
              <div className="wiz-hint" style={{ marginTop: 0, marginBottom: 10 }}>
                Cada valor tiene un nombre visible y un color. Aparecen como opciones al anotar.
              </div>
              <div>
                {formValues.map((v, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                    <input
                      type="color" value={v.color}
                      style={{ width: 34, height: 32, padding: 2, border: '1px solid var(--line)', borderRadius: 6 }}
                      onChange={(e) => setValueAt(i, { color: e.target.value })}
                    />
                    <input
                      type="text" value={v.label} placeholder={`Valor ${i + 1}`}
                      style={{ flex: 1 }}
                      onChange={(e) => setValueAt(i, { label: e.target.value })}
                    />
                    <button type="button" className="btn-mini" onClick={() => removeValue(i)}>
                      Quitar
                    </button>
                  </div>
                ))}
              </div>
              <button type="button" className="btn-mini" onClick={addValue}>
                + Añadir valor
              </button>
              <div className="wiz-hint" style={{ marginTop: 8 }}>
                {formValues.filter((v) => v.label.trim()).length} valores con nombre.
              </div>
            </div>
          )}

          {error && (
            <div style={{
              marginTop: 14, padding: '9px 12px', background: '#fbe6e6', border: '1px solid #e8c5c5',
              borderLeft: '3px solid var(--bad)', borderRadius: '0 6px 6px 0',
              fontSize: 12.5, color: '#5a2222',
            }}>
              {error}
            </div>
          )}

          <div style={{
            display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18,
            paddingTop: 14, borderTop: '1px solid var(--line-soft)',
          }}>
            <button type="button" className="btn" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button type="submit" className="btn primary" disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}