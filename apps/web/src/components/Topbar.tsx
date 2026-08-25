'use client';

import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import type { Project } from '@/db/schema';

const TITLES: Record<string, string> = {
  '/': 'Acceso',
  '/proyectos': 'Proyectos',
  '/upload': 'Cargar Excel',
  '/dimensiones': 'Dimensiones',
  '/taxonomias': 'Taxonomías',
  '/proyecto/taxonomias': 'Taxonomías del proyecto',
  '/proyecto/roles': 'Roles y equipos',
  '/proyecto/paquetes': 'Paquetes',
  '/proyecto/segmentacion': 'Configuración de segmentación',
  '/etiquetar': 'Etiquetar fragmento',
  '/discrepancias': 'Discrepancias',
  '/validacion': 'Validación cualitativa',
  '/reporte': 'Reporte',
  '/kappa': 'Kappa de Fleiss',
};

function projectColor(slug: string): string {
  if (slug.startsWith('epdata-2026q3')) return 'linear-gradient(135deg,#0e4a52,#1d6e75)';
  if (slug.startsWith('epdata-2026q2')) return 'linear-gradient(135deg,#0e4a52,#1d6e75)';
  if (slug.startsWith('epdata-sint')) return 'linear-gradient(135deg,#5a4400,#8a6300)';
  if (slug.startsWith('ods-2026')) return 'linear-gradient(135deg,#7a1a1c,#b04143)';
  return 'linear-gradient(135deg,#3a4250,#6b7280)';
}

function projectTag(slug: string): string {
  if (slug.startsWith('epdata')) return 'E';
  if (slug.startsWith('ods')) return 'O';
  return '?';
}

export function Topbar({ projects, activeProject }: { projects: Project[]; activeProject: Project | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const title = TITLES[pathname] || pathname.split('/').pop() || '';
  const proj = activeProject;

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  async function pickProject(id: string) {
    await fetch('/api/active-project', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: id }),
    });
    setOpen(false);
    router.refresh();
  }

  return (
    <header className="topbar">
      <div className="crumb">
        {proj ? (
          <>
            <span style={{ fontWeight: 500 }}>{proj.name}</span>
            <span style={{ margin: '0 8px', opacity: 0.4 }}>·</span>
            <b>{title}</b>
          </>
        ) : (
          <>
            <b>{title}</b>
            <span style={{ marginLeft: 10, fontSize: 12, color: '#c79d3c' }}>(ningún proyecto)</span>
          </>
        )}
      </div>

      <div ref={ref} style={{ position: 'relative' }}>
        <button
          className="project-switcher"
          onClick={() => setOpen(!open)}
          style={!proj ? { borderColor: '#c79d3c' } : undefined}
        >
          {proj ? (
            <>
              <div className="av" style={{ background: projectColor(proj.slug) }}>{projectTag(proj.slug)}</div>
              <div className="info">
                <b>{proj.name}</b>
                <small>activo</small>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
            </>
          ) : (
            <>
              <div className="av" style={{ background: 'linear-gradient(135deg,#c79d3c,#7d6c4f)' }}>!</div>
              <div className="info">
                <b>Seleccionar proyecto</b>
                <small>ninguno activo</small>
              </div>
            </>
          )}
        </button>

        {open && (
          <div style={{
            position: 'absolute', right: 0, top: 'calc(100% + 6px)',
            background: 'var(--surface)', border: '1px solid var(--line)',
            borderRadius: 8, minWidth: 280, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            padding: 6, zIndex: 50,
          }}>
            {projects.map(p => {
              const isActive = proj?.id === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => pickProject(p.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                    background: isActive ? 'var(--primary-fade)' : 'transparent',
                    border: 0, padding: '8px 10px', borderRadius: 6, cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div className="av-32" style={{ background: projectColor(p.slug) }}>{projectTag(p.slug)}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-1)' }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{p.description || '—'}</div>
                  </div>
                  {isActive && <span className="badge green">activo</span>}
                </button>
              );
            })}
            <Link href="/proyectos" style={{ display: 'block', padding: '8px 10px', fontSize: 12, color: 'var(--ink-3)', borderTop: '1px solid var(--line-soft)', marginTop: 4 }}>
              + Crear o gestionar proyectos
            </Link>
          </div>
        )}
      </div>

      <Link href="/proyectos" className="btn primary">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        Nuevo proyecto
      </Link>
    </header>
  );
}
