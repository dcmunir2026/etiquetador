'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createDimension, updateDimension, archiveDimension } from '../actions/actions';
import { DIMENSION_KINDS, DIMENSION_KIND_LABELS, type DimensionKind } from '@/lib/dimension-kinds';

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

type Scale = {
  id: string;
  name: string;
  kind: string;
  levels: { label: string; value: string; order: number }[];
};

export type DimensionInitial = {
  id: string;
  name: string;
  kind: DimensionKind;
  scaleId: string;
  shortDescription: string | null;
  longDescription: string | null;
};

export default function DimensionForm({
  initial,
  scales,
  isSuperAdmin,
}: {
  initial?: DimensionInitial;
  scales: Scale[];
  isSuperAdmin: boolean;
}) {
  const router = useRouter();
  const isEdit = !!initial;
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState(initial?.name ?? '');
  const [kind, setKind] = useState<DimensionKind>(initial?.kind ?? 'category');
  const [scaleId, setScaleId] = useState(initial?.scaleId ?? scales[0]?.id ?? '');
  const [color, setColor] = useState(TK_COLORS[0]!.id);
  const [shortDesc, setShortDesc] = useState(initial?.shortDescription ?? '');
  const [longDesc, setLongDesc] = useState(initial?.longDescription ?? '');

  if (!isSuperAdmin) {
    return (
      <div className="card" style={{ background: 'var(--warn-bg)', color: '#5a4400' }}>
        Solo el superadmin puede crear o editar dimensiones.
      </div>
    );
  }

  const selectedScale = scales.find((s) => s.id === scaleId);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    setOk(null);
    const payload = {
      name,
      kind,
      scaleId,
      shortDescription: shortDesc || undefined,
      longDescription: longDesc || undefined,
      color,
    };
    startTransition(async () => {
      const res = isEdit
        ? await updateDimension({ ...payload, id: initial!.id })
        : await createDimension(payload);
      if (res.ok) {
        setOk(isEdit ? 'Cambios guardados.' : 'Dimensión creada.');
        router.refresh();
      } else {
        setErr(res.error);
      }
    });
  }

  function onArchive() {
    if (!initial) return;
    if (!confirm(`¿Archivar la dimensión "${initial.name}"?\nDejará de aparecer en los selectores activos.`)) {
      return;
    }
    setErr(null);
    startTransition(async () => {
      const res = await archiveDimension({ id: initial.id });
      if (res.ok) {
        router.push('/dimensiones');
      } else {
        setErr(res.error);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="card" style={{ display: 'grid', gap: 16 }}>
      <div>
        <label style={labelStyle}>Nombre</label>
        <input
          name="name"
          type="text"
          required
          minLength={2}
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={inputStyle}
          placeholder="p.ej. Sesgo de odio"
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={labelStyle}>Tipo de dimensión</label>
          <select
            name="kind"
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
        </div>
        <div>
          <label style={labelStyle}>Color (etiqueta visual)</label>
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
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    border: sel ? '2px solid var(--ink-1)' : '1px solid var(--line)',
                    background: c.hex,
                    cursor: 'pointer',
                    padding: 0,
                  }}
                />
              );
            })}
          </div>
        </div>
      </div>

      <div>
        <label style={labelStyle}>Escala de intensidad</label>
        <select
          name="scaleId"
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
        {selectedScale && selectedScale.levels.length > 0 ? (
          <div
            style={{
              marginTop: 8,
              padding: 10,
              border: '1px dashed var(--line)',
              borderRadius: 7,
              fontSize: 12.5,
              color: 'var(--ink-2)',
              background: 'var(--surface-2)',
            }}
          >
            <b>Valores al crear:</b>{' '}
            {selectedScale.levels.map((l) => l.label).join(' · ')}
          </div>
        ) : null}
      </div>

      <div>
        <label style={labelStyle}>Descripción corta (≤ 160 caracteres)</label>
        <input
          name="shortDescription"
          type="text"
          maxLength={160}
          value={shortDesc}
          onChange={(e) => setShortDesc(e.target.value)}
          style={inputStyle}
          placeholder="Resumen en una línea que se ve en la tarjeta"
        />
      </div>

      <div>
        <label style={labelStyle}>Descripción larga (≤ 2000 caracteres)</label>
        <textarea
          name="longDescription"
          maxLength={2000}
          rows={4}
          value={longDesc}
          onChange={(e) => setLongDesc(e.target.value)}
          style={{ ...inputStyle, resize: 'vertical' }}
          placeholder="Contexto, criterios, ejemplos. Aparece en la página de detalle."
        />
      </div>

      {err ? <Alert kind="error" message={err} /> : null}
      {ok ? <Alert kind="success" message={ok} /> : null}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          type="submit"
          className="btn primary"
          disabled={pending}
          aria-busy={pending}
        >
          {pending ? (isEdit ? 'Guardando…' : 'Creando…') : isEdit ? 'Guardar cambios' : 'Crear dimensión'}
        </button>
        <a href="/dimensiones" className="btn" style={{ marginLeft: 4 }}>
          Cancelar
        </a>
        {isEdit ? (
          <button
            type="button"
            className="btn"
            onClick={onArchive}
            disabled={pending}
            style={{ color: 'var(--danger)', marginLeft: 'auto' }}
          >
            Archivar
          </button>
        ) : null}
      </div>
    </form>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: 12.5,
  fontWeight: 500,
  display: 'block',
  marginBottom: 5,
  color: 'var(--ink-2)',
};

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
      }}
    >
      {message}
    </div>
  );
}
