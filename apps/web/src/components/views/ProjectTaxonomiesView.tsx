'use client';
import { useState } from 'react';
import type { ViewData } from './ViewRouter';

const TK_COLOR: Record<string, string> = {
  'tk-odio':'#d97757','tk-emot':'#a85a35','tk-tend':'#7d6c4f','tk-semi':'#3d8268',
  'tk-gen':'#5b8fb8','tk-race':'#8b6db5','tk-rel':'#c79d3c','tk-demo':'#9c5b8b',
  'tk-stat':'#5a7d8f','tk-toxic':'#7a1a1c','tk-fact':'#1c6e3a',
};

export function ProjectTaxonomiesView({ data }: { data: ViewData }) {
  const [tab, setTab] = useState<'all' | 'assigned'>('all');
  // Simulación: en producción esto viene del server
  const [assignedIds, setAssignedIds] = useState<Set<string>>(new Set(['tx-sociodemo', 'tx-calidad', 'tx-formal']));

  const allTaxonomies = data.taxonomies;
  const dimsByTx = data.dimsByTx;
  const assignedTaxonomies = allTaxonomies.filter(t => assignedIds.has(t.id));

  function toggle(id: string) {
    setAssignedIds(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  const list = tab === 'all' ? allTaxonomies : assignedTaxonomies;

  return (
    <div className="page">
      <h1>Taxonomías del proyecto</h1>
      <p className="lead">Elige qué <b>taxonomías</b> (grupos de dimensiones) quieres usar en este proyecto. Cada taxonomía carga sus dimensiones automáticamente. Las taxonomías se gestionan en el <a href="/?view=taxonomy-groups" style={{ color: 'var(--primary-2)', fontWeight: 500 }}>catálogo de taxonomías</a>.</p>

      <div className="tabs-bar">
        <div className={`tab ${tab === 'all' ? 'active' : ''}`} onClick={() => setTab('all')}>
          Todas las taxonomías <span className="tab-count">{allTaxonomies.length}</span>
        </div>
        <div className={`tab ${tab === 'assigned' ? 'active' : ''}`} onClick={() => setTab('assigned')}>
          Asignadas a este proyecto <span className="tab-count">{assignedTaxonomies.length}</span>
        </div>
      </div>

      {tab === 'assigned' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 13px', background: '#e3eef5', border: '1px solid #c5d8e8', borderRadius: 8, marginBottom: 14, fontSize: 12.5, color: '#1d4a72' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
            <span>Estas son las taxonomías que se cargarán al anotar en <b>este proyecto</b>. Para añadir más, ve a la pestaña <b>Todas las taxonomías</b>.</span>
          </div>
        </div>
      )}

      <div className="dim-list">
        {list.map((t: any) => {
          const dims = dimsByTx[t.id] || [];
          const assigned = assignedIds.has(t.id);
          return (
            <div key={t.id} className="dim-row">
              <div className="dim-color" style={{ background: t.color === 'rose' ? 'linear-gradient(135deg,#7a1a1c,#b04143)' : t.color === 'amber' ? 'linear-gradient(135deg,#5a4400,#8a6300)' : t.color === 'violet' ? 'linear-gradient(135deg,#3d2a4d,#5a4080)' : 'linear-gradient(135deg,#0d4a5a,#1a7088)' }}>
                {(t.name || '?').charAt(0).toUpperCase()}
              </div>
              <div className="dim-info">
                <div className="dim-name">{t.name}</div>
                <div className="dim-desc">{t.shortDescription}</div>
                <div className="dim-meta">
                  {dims.map((d: any) => (
                    <span key={d.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, background: '#f0ede4', color: 'var(--ink-2)', padding: '1.5px 8px', borderRadius: 9, fontWeight: 500 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: TK_COLOR[d.kind || ''] || '#7d6c4f' }}></span>
                      {d.name}
                    </span>
                  ))}
                  {assigned ? (
                    <span className="assigned-pill">
                      <svg style={{ width: 9, height: 9 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                      Asignada
                    </span>
                  ) : (
                    <span className="unassigned-pill">No asignada</span>
                  )}
                  <span className="scale-pill">{(t.assignedTo || []).length} {(t.assignedTo || []).length === 1 ? 'proyecto' : 'proyectos'}</span>
                </div>
              </div>
              <div className="dim-actions">
                <div className="used"><b>{dims.length}</b><small>dimensiones</small></div>
                {assigned ? (
                  <button className="danger-btn" onClick={() => toggle(t.id)}>Desasignar</button>
                ) : (
                  <button className="assign-btn" onClick={() => toggle(t.id)}>Asignar</button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
        <button className="btn">Restablecer a valores por defecto</button>
        <button className="btn primary">Guardar y continuar →</button>
      </div>
    </div>
  );
}
