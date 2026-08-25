'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  addDimensionToTaxonomy,
  removeDimensionFromTaxonomy,
} from '../actions/actions';

export type DimSummary = {
  id: string;
  name: string;
  kind: string | null;
  status: 'active' | 'archived';
};

export default function DimensionAssignment({
  taxonomyId,
  assigned,
  available,
}: {
  taxonomyId: string;
  assigned: DimSummary[];
  available: DimSummary[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pickedId, setPickedId] = useState<string>(available[0]?.id ?? '');
  const [err, setErr] = useState<string | null>(null);

  function onAdd() {
    if (!pickedId) return;
    setErr(null);
    startTransition(async () => {
      const res = await addDimensionToTaxonomy({ taxonomyId, dimensionId: pickedId });
      if (res.ok) {
        router.refresh();
      } else {
        setErr(res.error);
      }
    });
  }

  function onRemove(d: DimSummary) {
    if (!confirm(`¿Quitar "${d.name}" de esta taxonomía?`)) return;
    setErr(null);
    startTransition(async () => {
      const res = await removeDimensionFromTaxonomy({ taxonomyId, dimensionId: d.id });
      if (res.ok) {
        router.refresh();
      } else {
        setErr(res.error);
      }
    });
  }

  return (
    <div className="card" style={{ padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14 }}>
        <h3 style={{ margin: 0, fontSize: 14, color: 'var(--ink-1)' }}>
          Dimensiones en esta taxonomía
        </h3>
        <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{assigned.length} asignadas</span>
      </div>

      {assigned.length > 0 ? (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
          {assigned.map((d, i) => (
            <li
              key={d.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 12px',
                background: 'var(--surface-2)',
                border: '1px solid var(--line-soft)',
                borderRadius: 7,
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  color: 'var(--ink-3)',
                  width: 22,
                  textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {i + 1}.
              </span>
              <span style={{ flex: 1, color: 'var(--ink-1)', fontSize: 13.5 }}>{d.name}</span>
              {d.status === 'archived' ? (
                <span style={{ fontSize: 11, color: 'var(--ink-4)', fontStyle: 'italic' }}>
                  archivada
                </span>
              ) : null}
              <button
                type="button"
                className="btn-mini danger-mini"
                onClick={() => onRemove(d)}
                disabled={pending}
                aria-label={`Quitar ${d.name}`}
                title="Quitar"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty" style={{ marginBottom: 14 }}>
          Sin dimensiones todavía. Usa el formulario de abajo para añadir.
        </div>
      )}

      <div
        style={{
          marginTop: 18,
          paddingTop: 14,
          borderTop: '1px solid var(--line-soft)',
        }}
      >
        <div className="wizard-field">
          <label className="wizard-field__label">Añadir dimensión</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <select
              value={pickedId}
              onChange={(e) => setPickedId(e.target.value)}
              disabled={pending || available.length === 0}
              style={{
                flex: 1,
                padding: '9px 11px',
                border: '1px solid var(--line)',
                borderRadius: 7,
                font: 'inherit',
                fontSize: 13.5,
                background: 'var(--surface)',
                color: 'var(--ink-1)',
              }}
            >
              {available.length === 0 ? (
                <option value="">No quedan dimensiones por añadir</option>
              ) : (
                available.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))
              )}
            </select>
            <button
              type="button"
              className="btn primary"
              onClick={onAdd}
              disabled={pending || !pickedId || available.length === 0}
              aria-busy={pending}
            >
              {pending ? 'Añadiendo…' : 'Añadir'}
            </button>
          </div>
          <div className="wizard-field__help" style={{ marginTop: 6 }}>
            Solo aparecen las dimensiones que aún no están en la taxonomía.
          </div>
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
              marginTop: 10,
            }}
          >
            {err}
          </div>
        ) : null}
      </div>
    </div>
  );
}
