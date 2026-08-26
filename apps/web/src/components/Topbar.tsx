'use client';

import { useState, useEffect, useRef } from 'react';

type Project = { id: string; name: string; slug: string; description: string | null; color?: string };

const TITLES: Record<string, string> = {
  login: 'Acceso',
  dashboard: 'Proyectos',
  upload: 'Cargar Excel maestro',
  dimensions: 'Dimensiones y categorías',
  roles: 'Roles y equipos',
  paquetes: 'Paquetes espejo',
  tagging: 'Etiquetar fragmento',
  discrepancias: 'Discrepancias',
  taxonomies: 'Dimensiones',
  'taxonomy-groups': 'Taxonomías',
  segmentation: 'Configuración de segmentación',
  validacion: 'Validación cualitativa',
  reporte: 'Reporte',
  kappa: 'Kappa de Fleiss',
};

function projectColor(slug: string): string {
  if (slug.startsWith('epdata-2026q3') || slug.startsWith('epdata-2026q2')) return 'linear-gradient(135deg,#0e4a52,#1d6e75)';
  if (slug.startsWith('epdata-sint')) return 'linear-gradient(135deg,#5a4400,#8a6300)';
  if (slug.startsWith('ods-2026')) return 'linear-gradient(135deg,#7a1a1c,#b04143)';
  return 'linear-gradient(135deg,#3a4256,#6b6f7d)';
}

function projectTag(slug: string): string {
  if (slug.startsWith('epdata')) return 'E';
  if (slug.startsWith('ods')) return 'O';
  return '?';
}

export function Topbar({ currentView, projects, activeProject, onPickProject }: { currentView: string; projects: Project[]; activeProject: Project | null; onPickProject: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const title = TITLES[currentView] || currentView;
  const proj = activeProject;

  return (
    <div className="top">
      <div className="crumbs">
        {proj ? proj.name : 'EpData'} · <b>{title}</b>
      </div>
      <div className="right">
        <span className="pill"><span className="dot"></span>3.662 fragmentos cargados</span>
        <div ref={ref} style={{ position: 'relative' }}>
          <div
            className={`proj-switcher ${!proj ? 'is-empty' : ''}`}
            onClick={() => setOpen(!open)}
            title="Selecciona un proyecto"
          >
            <div className="av" style={{ background: proj ? projectColor(proj.slug) : 'var(--ink-3)' }}>
              {proj ? projectTag(proj.slug) : '·'}
            </div>
            {proj ? (
              <b>{proj.name}<small>activo</small></b>
            ) : (
              <b>Seleccionar proyecto<small>ninguno activo</small></b>
            )}
            <svg className="chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
          {open && (
            <div className="proj-dropdown">
              {projects.map(p => (
                <div
                  key={p.id}
                  className={`proj-row ${p.id === proj?.id ? 'is-active' : ''}`}
                  onClick={() => { onPickProject(p.id); setOpen(false); }}
                >
                  <div className="av" style={{ background: projectColor(p.slug), width: 28, height: 28, fontSize: 12 }}>{projectTag(p.slug)}</div>
                  <div className="info">
                    <b>{p.name}</b>
                    {p.description && <small>{p.description}</small>}
                  </div>
                  {p.id === proj?.id && <span style={{ fontSize: 11, color: 'var(--ok)' }}>activo</span>}
                </div>
              ))}
            </div>
          )}
        </div>
        <button className="btn ghost">
          <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>
        <button className="btn primary">
          <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Nuevo proyecto
        </button>
      </div>
    </div>
  );
}
