'use client';
import { useState } from 'react';
import type { ViewData } from './ViewRouter';

const COLORS: Record<string, string> = {
  rose: 'linear-gradient(135deg,#7a1a1c,#b04143)',
  amber: 'linear-gradient(135deg,#5a4400,#8a6300)',
  cyan: 'linear-gradient(135deg,#0d4a5a,#1a7088)',
  violet: 'linear-gradient(135deg,#3d2a4d,#5a4080)',
};

const TK_COLOR: Record<string, string> = {
  'tk-odio':'#d97757','tk-emot':'#a85a35','tk-tend':'#7d6c4f','tk-semi':'#3d8268',
  'tk-gen':'#5b8fb8','tk-race':'#8b6db5','tk-rel':'#c79d3c','tk-demo':'#9c5b8b',
  'tk-stat':'#5a7d8f','tk-toxic':'#7a1a1c','tk-fact':'#1c6e3a',
};

export function TaxonomyGroupsView({ data }: { data: ViewData }) {
  const [taxonomies, setTaxonomies] = useState<any[]>(data.taxonomies);
  const [dimsByTx, setDimsByTx] = useState<Record<string, any[]>>(data.dimsByTx);

  return (
    <div className="page">
      <h1>Taxonomías</h1>
      <p className="lead">Agrupa dimensiones en paquetes conceptuales y asígnalas como conjunto a los proyectos. Una dimensión puede vivir en varias taxonomías.</p>

      <div className="grid g-2" style={{ marginBottom: 20 }}>
        <div className="kpi"><div className="label">Taxonomías activas</div><div className="value">{taxonomies.length}</div><div className="delta">0 archivadas</div></div>
        <div className="kpi"><div className="label">Asignaciones totales</div><div className="value">{data.totalTaxonomyDimensions}</div><div className="delta">dimensión × taxonomía</div></div>
      </div>

      <div className="card" style={{ padding: 0, marginBottom: 12 }}>
        <div className="tax-toolbar">
          <input type="search" placeholder="Buscar taxonomía..." />
          <button className="btn primary" style={{ marginLeft: 'auto' }} onClick={() => window.dispatchEvent(new CustomEvent('open-taxonomy-group-wizard'))}>+ Nueva taxonomía</button>
        </div>
      </div>

      <div>
        {taxonomies.map((t: any) => {
          const dims = dimsByTx[t.id] || [];
          return (
            <div key={t.id} className="tx-grp-card">
              <div className="tx-grp-head">
                <div className="grp-avatar" style={{ background: COLORS[t.color || 'cyan'] }}>{(t.name || '?').charAt(0).toUpperCase()}</div>
                <div className="grp-info">
                  <div className="grp-name">{t.name}</div>
                  <div className="grp-desc">{t.shortDescription || ''}</div>
                </div>
                <div className="count" style={{ textAlign: 'right' }}>
                  <b style={{ color: 'var(--ink-1)', fontSize: 18, display: 'block' }}>{dims.length}</b>
                  <small style={{ fontSize: 11, color: 'var(--ink-3)' }}>dimensiones</small>
                </div>
                <div className="count" style={{ textAlign: 'right' }}>
                  <b style={{ color: 'var(--ink-1)', fontSize: 18, display: 'block' }}>0</b>
                  <small style={{ fontSize: 11, color: 'var(--ink-3)' }}>proyectos</small>
                </div>
                <button className="btn sm">Archivar</button>
                <button className="btn primary sm">Asignar a proyecto</button>
              </div>
              <div className="tx-grp-body">
                {dims.map((d: any) => (
                  <span key={d.id} className="dim-pill">
                    <span className="dot" style={{ background: TK_COLOR[d.kind || ''] || '#7d6c4f' }} />
                    {d.name}
                  </span>
                ))}
                {dims.length === 0 && <span style={{ fontSize: 11.5, color: 'var(--ink-4)', fontStyle: 'italic' }}>Sin dimensiones todavía. Añade alguna.</span>}
                <div className="grp-add-dim">
                  <select>
                    <option value="">+ Añadir dimensión existente…</option>
                    {data.dimensions.filter((d: any) => !dims.some((x: any) => x.id === d.id)).map((d: any) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                  <button>Añadir</button>
                </div>
              </div>
            </div>
          );
        })}
        {taxonomies.length === 0 && (
          <div className="empty">No hay taxonomías. Crea la primera con el botón "+ Nueva taxonomía".</div>
        )}
      </div>
    </div>
  );
}
