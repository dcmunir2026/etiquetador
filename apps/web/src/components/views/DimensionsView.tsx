'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { DimensionRow } from '@/lib/queries';
import { setDimensionStatus } from '@/app/actions/catalog';
import { DimensionWizard } from './DimensionWizard';
import { Kpi, ago, dimColor } from './shared';

type Scale = { id: string; name: string; kind: string; isCustom: boolean };

/** Global dimension catalogue — the atoms every project draws from. */
export function DimensionsView({ dimensions, scales, readOnly = false }: { dimensions: DimensionRow[]; scales: Scale[]; readOnly?: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [scaleFilter, setScaleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('active');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const scaleNames = useMemo(
    () => Array.from(new Set(dimensions.map((d) => d.scaleName).filter(Boolean))) as string[],
    [dimensions],
  );

  const visible = dimensions.filter((d) => {
    if (statusFilter !== 'all' && d.status !== statusFilter) return false;
    if (scaleFilter !== 'all' && d.scaleName !== scaleFilter) return false;
    if (query.trim() && !d.name.toLowerCase().includes(query.trim().toLowerCase())) return false;
    return true;
  });

  const activeCount = dimensions.filter((d) => d.status === 'active').length;
  const archivedCount = dimensions.filter((d) => d.status === 'archived').length;
  const totalAssignments = dimensions.reduce((a, d) => a + d.taxonomyCount, 0);

  async function toggleStatus(d: DimensionRow) {
    setBusy(d.id);
    await setDimensionStatus(d.id, d.status === 'archived' ? 'active' : 'archived');
    setBusy(null);
    router.refresh();
  }

  return (
    <div className="page">
      <h1>Dimensiones</h1>
      <p className="lead">
        Listado global de dimensiones disponibles. Cada dimensión es un atributo anotable que se
        carga en los proyectos al anotar. Agrupa varias en una{' '}
        <a href="/taxonomias" style={{ color: 'var(--primary-2)', fontWeight: 500 }}>taxonomía</a>{' '}
        para asignarlas como conjunto.
      </p>

      <div className="grid g-2" style={{ marginBottom: 18 }}>
        <Kpi label="Dimensiones activas" value={activeCount} delta={`${archivedCount} archivadas`} />
        <Kpi label="Usos en taxonomías" value={totalAssignments}
             delta={`${activeCount ? (totalAssignments / activeCount).toFixed(2) : '0'} por dimensión`} />
      </div>

      {readOnly && (
        <div style={{ marginBottom: 14, padding: '9px 13px', background: 'var(--surface-2)',
                      border: '1px solid var(--line)', borderLeft: '3px solid var(--ink-3)',
                      borderRadius: '0 7px 7px 0', fontSize: 12.5, color: 'var(--ink-3)' }}>
          Solo lectura: tu rol puede consultar esta pantalla, pero no modificarla.
        </div>
      )}

      <div className="tax-toolbar">
        <input type="search" placeholder="Buscar dimensión..." value={query} onChange={(e) => setQuery(e.target.value)} />
        <select value={scaleFilter} onChange={(e) => setScaleFilter(e.target.value)}>
          <option value="all">Todas las escalas</option>
          {scaleNames.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="active">Estado: activas</option>
          <option value="archived">Estado: archivadas</option>
          <option value="all">Estado: todas</option>
        </select>
        {!readOnly && (
          <button className="btn primary" style={{ marginLeft: 'auto' }} onClick={() => setWizardOpen(true)}>
            + Nueva dimensión
          </button>
        )}
      </div>

      <div className="tax-grid">
        {visible.map((d) => (
          <div key={d.id} className={`tax-card${d.status === 'archived' ? ' is-archived' : ''}`}>
            <div className="tax-card-head">
              <div className="tax-color" style={{ background: d.status === 'archived' ? '#e6e3dc' : dimColor(d.name), color: d.status === 'archived' ? 'var(--ink-3)' : '#fff' }}>
                {d.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <h4 style={d.status === 'archived' ? { textDecoration: 'line-through', color: 'var(--ink-3)' } : undefined}>
                  {d.name}
                </h4>
                <p>{d.shortDescription ?? 'Sin descripción.'}</p>
              </div>
            </div>

            <div className="tax-card-meta">
              <span className="scale-pill">{d.scaleName ?? d.kind}</span>
              {d.kind === 'free-text'
                ? <span className="scale-pill">texto libre</span>
                : <span className="scale-pill">{d.values.length} valores</span>}
              {d.taxonomyCount > 0 && (
                <span className="tax-used-pill">
                  {d.taxonomyCount} {d.taxonomyCount === 1 ? 'taxonomía' : 'taxonomías'}
                </span>
              )}
              {d.projectCount > 0 && (
                <span className="tax-used-pill">
                  {d.projectCount} {d.projectCount === 1 ? 'proyecto' : 'proyectos'}
                </span>
              )}
            </div>

            {d.dependencyLabel && (
              <div style={{ fontSize: 11.5, color: '#8a6300', background: '#fdf3da', border: '1px solid #e8d49c',
                            borderRadius: 6, padding: '5px 9px', margin: '0 0 8px' }}>
                ⊘ Solo visible cuando <b>{d.dependencyLabel}</b>
              </div>
            )}

            {d.values.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
                {d.values.slice(0, 7).map((v) => <span key={v} className="scale-pill">{v}</span>)}
                {d.values.length > 7 && <span className="scale-pill">+{d.values.length - 7}</span>}
              </div>
            )}

            <div className="tax-card-foot">
              <small>
                {d.status === 'archived' ? 'Archivada' : 'Creada'} por{' '}
                <b style={{ color: 'var(--ink-2)' }}>{d.createdByName ?? '—'}</b> · {ago(d.createdAt)}
                {d.annotationCount > 0 && <> · {d.annotationCount.toLocaleString('es-ES')} anotaciones</>}
              </small>
              {!readOnly && (
                <div className="actions-mini">
                  <button className="btn-mini" disabled={busy === d.id} onClick={() => toggleStatus(d)}>
                    {d.status === 'archived' ? 'Restaurar' : 'Archivar'}
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        {visible.length === 0 && (
          <div className="empty-state" style={{ gridColumn: '1 / -1' }}>
            <h4>Sin resultados</h4>
            Ninguna dimensión coincide con los filtros actuales.
          </div>
        )}
      </div>

      {wizardOpen && (
        <DimensionWizard dimensions={dimensions} scales={scales} onClose={() => setWizardOpen(false)} />
      )}
    </div>
  );
}
