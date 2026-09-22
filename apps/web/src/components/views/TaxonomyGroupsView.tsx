'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { DimensionRow, TaxonomyRow } from '@/lib/queries';
import { createTaxonomy, setTaxonomyDimensions, setTaxonomyStatus } from '@/app/actions/catalog';
import { Kpi, ago, dimColor } from './shared';

type Project = { id: string; name: string; slug: string };

const COLORS = ['rose', 'amber', 'cyan', 'violet'];

/** Global taxonomy catalogue — named groups of dimensions. */
export function TaxonomyGroupsView({
  taxonomies, dimensions, projects, readOnly = false,
}: {
  taxonomies: TaxonomyRow[]; dimensions: DimensionRow[]; projects: Project[]; readOnly?: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<TaxonomyRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const visible = taxonomies.filter((t) => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    if (query.trim() && !t.name.toLowerCase().includes(query.trim().toLowerCase())) return false;
    return true;
  });

  const activeCount = taxonomies.filter((t) => t.status === 'active').length;
  const assignments = taxonomies.reduce((a, t) => a + t.projectIds.length, 0);
  const projectsTouched = new Set(taxonomies.flatMap((t) => t.projectIds)).size;

  async function toggle(t: TaxonomyRow) {
    setBusy(t.id);
    await setTaxonomyStatus(t.id, t.status === 'archived' ? 'active' : 'archived');
    setBusy(null);
    router.refresh();
  }

  return (
    <div className="page">
      <h1>Taxonomías</h1>
      <p className="lead">
        Agrupa dimensiones en paquetes conceptuales y asígnalas como conjunto a los proyectos.
        Una dimensión puede vivir en varias taxonomías.
      </p>

      <div className="grid g-2" style={{ marginBottom: 18 }}>
        <Kpi label="Taxonomías activas" value={activeCount}
             delta={`${taxonomies.length - activeCount} archivadas`} />
        <Kpi label="Asignaciones a proyectos" value={assignments}
             delta={`${projectsTouched} proyectos · ${activeCount ? (assignments / activeCount).toFixed(2) : '0'} por taxonomía`} />
      </div>

      {readOnly && (
        <div style={{ marginBottom: 14, padding: '9px 13px', background: 'var(--surface-2)',
                      border: '1px solid var(--line)', borderLeft: '3px solid var(--ink-3)',
                      borderRadius: '0 7px 7px 0', fontSize: 12.5, color: 'var(--ink-3)' }}>
          Solo lectura: tu rol puede consultar esta pantalla, pero no modificarla.
        </div>
      )}

      <div className="tax-toolbar" style={{ marginBottom: 14 }}>
        <input type="search" placeholder="Buscar taxonomía..." value={query} onChange={(e) => setQuery(e.target.value)} />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="active">Estado: activas</option>
          <option value="archived">Estado: archivadas</option>
          <option value="all">Todas</option>
        </select>
        {!readOnly && (
          <button className="btn primary" style={{ marginLeft: 'auto' }} onClick={() => setCreating(true)}>
            + Nueva taxonomía
          </button>
        )}
      </div>

      <div>
        {visible.map((t) => (
          <div key={t.id} className="dim-row" style={{ opacity: t.status === 'archived' ? 0.6 : 1 }}>
            <div className="dim-main">
              <div className={`tax-color ${t.color ?? ''}`} style={{ background: dimColor(t.name), color: '#fff' }}>
                {t.name.charAt(0).toUpperCase()}
              </div>
              <div className="dim-info">
                <b>{t.name}</b>
                <small>{t.shortDescription ?? 'Sin descripción.'}</small>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 7 }}>
                  {t.dimensions.map((d) => (
                    <span key={d.id} className="scale-pill" style={{ borderLeft: `3px solid ${dimColor(d.name)}` }}>
                      {d.name}
                    </span>
                  ))}
                  {t.dimensions.length === 0 && (
                    <span style={{ fontSize: 11.5, color: 'var(--ink-4)', fontStyle: 'italic' }}>sin dimensiones</span>
                  )}
                </div>
              </div>
            </div>
            <div className="dim-meta">
              <span className="scale-pill">{t.dimensions.length} dimensiones</span>
              <span className="tax-used-pill">
                {t.projectIds.length} {t.projectIds.length === 1 ? 'proyecto' : 'proyectos'}
              </span>
            </div>
            {!readOnly && (
              <div className="dim-actions">
                <button className="btn-mini" onClick={() => setEditing(t)}>Editar dimensiones</button>
                <button className="btn-mini" disabled={busy === t.id} onClick={() => toggle(t)}>
                  {t.status === 'archived' ? 'Restaurar' : 'Archivar'}
                </button>
              </div>
            )}
            <div style={{ gridColumn: '1 / -1', fontSize: 11, color: 'var(--ink-4)', marginTop: 4 }}>
              Creada por {t.createdByName ?? '—'} · {ago(t.createdAt)}
            </div>
          </div>
        ))}
        {visible.length === 0 && (
          <div className="empty-state">
            <h4>Sin resultados</h4>
            Ninguna taxonomía coincide con los filtros actuales.
          </div>
        )}
      </div>

      {creating && (
        <TaxonomyDialog
          dimensions={dimensions}
          onClose={() => setCreating(false)}
          onDone={() => { setCreating(false); router.refresh(); }}
        />
      )}
      {editing && (
        <TaxonomyDialog
          dimensions={dimensions}
          existing={editing}
          onClose={() => setEditing(null)}
          onDone={() => { setEditing(null); router.refresh(); }}
        />
      )}
    </div>
  );
}

/** Create a taxonomy, or re-pick the dimensions of an existing one. */
function TaxonomyDialog({
  dimensions, existing, onClose, onDone,
}: {
  dimensions: DimensionRow[]; existing?: TaxonomyRow; onClose: () => void; onDone: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? '');
  const [desc, setDesc] = useState(existing?.shortDescription ?? '');
  const [color, setColor] = useState(existing?.color ?? 'cyan');
  const [picked, setPicked] = useState<string[]>(existing?.dimensions.map((d) => d.id) ?? []);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const options = dimensions.filter(
    (d) => d.status === 'active' && (!query.trim() || d.name.toLowerCase().includes(query.trim().toLowerCase())),
  );

  async function save() {
    setSaving(true);
    setError(null);
    const res = existing
      ? await setTaxonomyDimensions(existing.id, picked)
      : await createTaxonomy({ name, shortDescription: desc, color, dimensionIds: picked });
    setSaving(false);
    if (!res.ok) { setError(res.error); return; }
    onDone();
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,23,30,0.45)', zIndex: 60,
                  backdropFilter: 'blur(2px)', overflowY: 'auto' }}>
      <div className="picker-card" style={{ marginTop: 24, textAlign: 'left', maxWidth: 620 }}>
        <h2 style={{ textAlign: 'center' }}>{existing ? `Dimensiones de "${existing.name}"` : 'Nueva taxonomía'}</h2>
        <p className="lead" style={{ textAlign: 'center' }}>
          {existing
            ? 'Marca las dimensiones que forman parte de esta taxonomía.'
            : 'Agrupa dimensiones bajo un nombre para asignarlas juntas a un proyecto.'}
        </p>

        {!existing && (
          <>
            <div className="wiz-row">
              <label>Nombre <span style={{ color: '#c0392b' }}>*</span></label>
              <input type="text" placeholder="Ej. Sesgos sociodemográficos" value={name}
                     onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="wiz-row">
              <label>Descripción breve</label>
              <textarea placeholder="Qué agrupa esta taxonomía." value={desc}
                        onChange={(e) => setDesc(e.target.value)} style={{ minHeight: 50 }} />
            </div>
            <div className="wiz-row">
              <label>Color</label>
              <select value={color} onChange={(e) => setColor(e.target.value)}>
                {COLORS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </>
        )}

        <div className="tax-toolbar" style={{ marginBottom: 14 }}>
          <input type="search" placeholder="Buscar dimensión..." value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>

        <div className="picker-list" style={{ maxHeight: 300, overflowY: 'auto' }}>
          {options.map((d) => {
            const on = picked.includes(d.id);
            return (
              <div key={d.id} className={`picker-row${on ? ' is-assigned' : ''}`}
                   onClick={() => setPicked(on ? picked.filter((x) => x !== d.id) : [...picked, d.id])}>
                <div className="av" style={{ background: dimColor(d.name), width: 34, height: 34, fontSize: 12 }}>
                  {d.name.charAt(0).toUpperCase()}
                </div>
                <div className="meta" style={{ flex: 1 }}>
                  <b>{d.name}</b>
                  <small>{d.scaleName ?? d.kind} · {d.values.length} valores</small>
                </div>
                {on ? <span className="av-extra">✓ Incluida</span> : <span className="btn-mini">Añadir</span>}
              </div>
            );
          })}
        </div>

        {error && <div style={{ fontSize: 12.5, color: 'var(--bad)', marginTop: 10 }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16,
                      paddingTop: 14, borderTop: '1px solid var(--line-soft)' }}>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn primary" onClick={save} disabled={saving}>
            {saving ? 'Guardando…' : existing ? 'Guardar' : 'Crear taxonomía'}
          </button>
        </div>
      </div>
    </div>
  );
}
