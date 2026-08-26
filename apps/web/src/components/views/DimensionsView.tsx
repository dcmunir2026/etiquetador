'use client';
import { useState, useEffect } from 'react';
import type { ViewData } from './ViewRouter';

const TK_COLOR: Record<string, string> = {
  'tk-odio':'#d97757','tk-emot':'#a85a35','tk-tend':'#7d6c4f','tk-semi':'#3d8268',
  'tk-gen':'#5b8fb8','tk-race':'#8b6db5','tk-rel':'#c79d3c','tk-demo':'#9c5b8b',
  'tk-stat':'#5a7d8f','tk-toxic':'#7a1a1c','tk-fact':'#1c6e3a',
};
function tkToHex(tk: string | null | undefined): string {
  if (!tk) return '#7d6c4f';
  return TK_COLOR[tk] || '#7d6c4f';
}

export function DimensionsView({ data }: { data: ViewData }) {
  const [search, setSearch] = useState('');
  const [dims, setDims] = useState<any[]>(data.dimensions);

  useEffect(() => {
    setDims(data.dimensions);
  }, [data.dimensions]);

  const filtered = search ? dims.filter(d => d.name.toLowerCase().includes(search.toLowerCase())) : dims;
  const archiveCount = data.dimensions.filter((d: any) => d.status === 'archived').length;

  return (
    <div className="page">
      <h1>Dimensiones</h1>
      <p className="lead">Listado global de dimensiones disponibles. Cada dimensión es un atributo anotable. Agrúpala en una <a href="/?view=taxonomy-groups" style={{ color: 'var(--primary-2)', fontWeight: 500 }}>taxonomía</a> y asígnala a los proyectos. Solo el super admin puede crear, editar o archivar.</p>

      <div className="grid g-2" style={{ marginBottom: 20 }}>
        <div className="kpi">
          <div className="label">Dimensiones activas</div>
          <div className="value">{dims.length}</div>
          <div className="delta">{archiveCount} archivada(s)</div>
        </div>
        <div className="kpi">
          <div className="label">Asignaciones totales</div>
          <div className="value">{data.totalTaxonomyDimensions}</div>
          <div className="delta">a taxonomías</div>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="tax-toolbar">
          <input type="search" placeholder="Buscar dimensión..." value={search} onChange={e => setSearch(e.target.value)} />
          <select>
            <option>Todas las escalas</option>
            <option>3 niveles</option>
            <option>5 niveles</option>
            <option>Likert</option>
            <option>Binario</option>
          </select>
          <select>
            <option>Estado: activas</option>
            <option>Estado: archivadas</option>
            <option>Todas</option>
          </select>
          <button className="btn primary" style={{ marginLeft: 'auto' }} onClick={() => window.dispatchEvent(new CustomEvent('open-dimension-wizard'))}>+ Nueva dimensión</button>
        </div>

        <div className="dim-grid">
          {filtered.map((d: any) => {
            const tCount = data.txCountByDim[d.id] || 0;
            return (
              <div key={d.id} className="dim-card">
                <div className="dim-card-head">
                  <div className="av-lg" style={{ background: tkToHex('tk-' + (d.slug?.split('-')[0] || 'stat')) }}>
                    {(d.name || '?').charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <b>{d.name}</b>
                    <small>{d.shortDescription ? '' : '3 niveles · 3 valores'}</small>
                  </div>
                </div>
                <p>{d.shortDescription || 'Sin descripción breve.'}</p>
                <div className="chips">
                  <span className="chip">3 niveles</span>
                  <span className="chip">3 valores</span>
                  <span className="chip blue">{tCount} {tCount === 1 ? 'taxonomía' : 'taxonomías'}</span>
                </div>
                <div className="meta">
                  <span>Creada por <b>{d.createdBy || '—'}</b> · hace 12 días</span>
                </div>
                <div className="dim-card-actions">
                  <button className="btn sm">Ver usos</button>
                  <button className="btn sm" style={{ marginLeft: 'auto' }}>Editar</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
