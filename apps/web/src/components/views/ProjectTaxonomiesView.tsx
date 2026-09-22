'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { DimensionRow, TaxonomyRow } from '@/lib/queries';
import { assignTaxonomyToProject, unassignTaxonomyFromProject } from '@/app/actions/catalog';
import { dimColor } from './shared';

/** Which taxonomies this project uses — the tabbed assignment screen. */
export function ProjectTaxonomiesView({
  projectId, projectName, taxonomies, dimensions, readOnly = false,
}: {
  projectId: string; projectName: string; taxonomies: TaxonomyRow[];
  dimensions: DimensionRow[]; readOnly?: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<'all' | 'assigned'>('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const active = taxonomies.filter((t) => t.status === 'active');
  const assigned = active.filter((t) => t.projectIds.includes(projectId));
  const dimById = new Map(dimensions.map((d) => [d.id, d]));

  async function toggle(t: TaxonomyRow, on: boolean) {
    setBusy(t.id);
    setError(null);
    const res = on
      ? await assignTaxonomyToProject(projectId, t.id)
      : await unassignTaxonomyFromProject(projectId, t.id);
    setBusy(null);
    if (!res.ok) { setError(res.error); return; }
    router.refresh();
  }

  const list = tab === 'all' ? active : assigned;

  return (
    <div className="page">
      <h1>Taxonomías del proyecto</h1>
      <p className="lead">
        Elige qué <b>taxonomías</b> (grupos de dimensiones) quieres usar en <b>{projectName}</b>.
        Cada taxonomía carga sus dimensiones automáticamente. Se gestionan en el{' '}
        <a href="/taxonomias" style={{ color: 'var(--primary-2)', fontWeight: 500 }}>
          catálogo de taxonomías
        </a>.
      </p>

      {readOnly && (
        <div style={{ marginBottom: 14, padding: '9px 13px', background: 'var(--surface-2)',
                      border: '1px solid var(--line)', borderLeft: '3px solid var(--ink-3)',
                      borderRadius: '0 7px 7px 0', fontSize: 12.5, color: 'var(--ink-3)' }}>
          Solo lectura: tu rol puede consultar esta pantalla, pero no modificarla.
        </div>
      )}

      <div className="tabs-bar">
        <div className={`tab${tab === 'all' ? ' active' : ''}`} onClick={() => setTab('all')}>
          Todas las taxonomías
          <span className="tab-count">{active.length}</span>
        </div>
        <div className={`tab${tab === 'assigned' ? ' active' : ''}`} onClick={() => setTab('assigned')}>
          Asignadas a este proyecto
          <span className="tab-count">{assigned.length}</span>
        </div>
      </div>

      {tab === 'assigned' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 13px',
                      background: '#e3eef5', border: '1px solid #c5d8e8', borderRadius: 8, marginBottom: 14,
                      fontSize: 12.5, color: '#1d4a72' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            <span>
              Estas son las dimensiones que se cargarán al anotar en <b>{projectName}</b>.
              Para añadir más, ve a la pestaña <b>Todas las taxonomías</b>.
            </span>
          </div>
        </div>
      )}

      {error && (
        <div style={{ padding: '10px 13px', background: '#fbe6e6', border: '1px solid #e8c5c5',
                      borderLeft: '3px solid var(--bad)', borderRadius: '0 8px 8px 0', marginBottom: 14,
                      fontSize: 12.5, color: '#5a2222' }}>
          {error}
        </div>
      )}

      <div className="dim-list">
        {list.map((t) => {
          const on = t.projectIds.includes(projectId);
          return (
            <div key={t.id} className={`dim-row${on ? ' is-assigned' : ''}`}>
              <div className="dim-main">
                <div className="tax-color" style={{ background: dimColor(t.name), color: '#fff' }}>
                  {t.name.charAt(0).toUpperCase()}
                </div>
                <div className="dim-info">
                  <b>{t.name}</b>
                  <small>{t.shortDescription ?? 'Sin descripción.'}</small>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 7 }}>
                    {t.dimensions.map((d) => {
                      const full = dimById.get(d.id);
                      return (
                        <span key={d.id} className="scale-pill" style={{ borderLeft: `3px solid ${dimColor(d.name)}` }}
                              title={full?.shortDescription ?? undefined}>
                          {d.name}
                          {full?.dependencyLabel && <span style={{ color: '#8a6300' }}> ⊘</span>}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div className="dim-meta">
                <span className="scale-pill">{t.dimensions.length} dimensiones</span>
                {on && <span className="av-extra">✓ Asignada</span>}
              </div>
              {!readOnly && (
                <div className="dim-actions">
                  <button className={`btn-mini${on ? '' : ' primary-mini'}`} disabled={busy === t.id}
                          onClick={() => toggle(t, !on)}>
                    {busy === t.id ? '…' : on ? 'Quitar del proyecto' : 'Asignar'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {list.length === 0 && (
          <div className="empty-state">
            <h4>{tab === 'assigned' ? 'Ninguna taxonomía asignada' : 'No hay taxonomías activas'}</h4>
            {tab === 'assigned'
              ? 'Asigna al menos una para que los anotadores tengan algo que etiquetar.'
              : 'Crea una taxonomía en el catálogo global.'}
          </div>
        )}
      </div>

      {!readOnly && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
          <a className="btn primary" href="/proyecto/roles">Continuar a roles →</a>
        </div>
      )}
    </div>
  );
}
