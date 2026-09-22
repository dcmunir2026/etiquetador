'use client';

import { logoutAction } from '@/app/(auth)/login/actions';
import { canRead, ROLE_LABELS, type Role } from '@/lib/permissions';
import type { ShellUser } from './Shell';

const NAV: Array<{ section: string; items: Array<{ id: string; label: string; icon: JSX.Element; lock?: boolean; badge?: string; trailing?: JSX.Element }> }> = [
  {
    section: 'Proyecto',
    items: [
      {
        id: 'dashboard', label: 'Proyectos',
        icon: <><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></>,
        trailing: <svg style={{ marginLeft: 'auto', width: 14, height: 14 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>,
      },
      { id: 'upload', label: 'Cargar Excel', icon: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></> },
    ],
  },
  {
    section: 'Catálogo',
    items: [
      { id: 'taxonomies', label: 'Dimensiones', icon: <><path d="M3 7h18M3 12h18M3 17h18" /><circle cx="6" cy="7" r="1.5" fill="currentColor" /><circle cx="6" cy="12" r="1.5" fill="currentColor" /><circle cx="6" cy="17" r="1.5" fill="currentColor" /></> },
      { id: 'taxonomy-groups', label: 'Taxonomías', icon: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></> },
    ],
  },
  {
    section: 'Configuración',
    items: [
      { id: 'dimensions', label: 'Taxonomías del proyecto', lock: true, icon: <><path d="M4 6h16M4 12h16M4 18h16" /><circle cx="8" cy="6" r="1.5" fill="currentColor" /><circle cx="8" cy="12" r="1.5" fill="currentColor" /><circle cx="8" cy="18" r="1.5" fill="currentColor" /><circle cx="16" cy="6" r="1.5" fill="currentColor" /><circle cx="16" cy="12" r="1.5" fill="currentColor" /><circle cx="16" cy="18" r="1.5" fill="currentColor" /></> },
      { id: 'roles', label: 'Roles y equipos', lock: true, icon: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></> },
      { id: 'paquetes', label: 'Paquetes', lock: true, icon: <><path d="M16 3h5v5" /><path d="M21 16v5h-5" /><path d="M8 21H3v-5" /><path d="M3 8V3h5" /><rect x="6" y="6" width="12" height="12" /></> },
      { id: 'segmentation', label: 'Segmentación', lock: true, icon: <><path d="M3 6h18M3 12h18M3 18h18" /><path d="M9 3v18M15 3v18" strokeDasharray="2 2" opacity="0.4" /><circle cx="6" cy="6" r="1" fill="currentColor" /><circle cx="6" cy="12" r="1" fill="currentColor" /><circle cx="6" cy="18" r="1" fill="currentColor" /><circle cx="18" cy="6" r="1" fill="currentColor" /><circle cx="18" cy="12" r="1" fill="currentColor" /><circle cx="18" cy="18" r="1" fill="currentColor" /></> },
    ],
  },
  {
    section: 'Etiquetado',
    items: [
      { id: 'tagging', label: 'Etiquetar fragmento', badge: '3/50', icon: <><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></> },
      { id: 'discrepancias', label: 'Discrepancias', icon: <><path d="M16 3h5v5" /><path d="M3 21l8-8" /><path d="M21 16v5h-5" /><path d="M15 15l6 6" /><path d="M3 8V3h5" /></> },
      { id: 'discrepancias-equipos', label: 'Discrepancias de equipos', icon: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /><path d="M12 8L8 12l4 4" stroke="#b58300" strokeWidth="2.5" /></> },
      { id: 'graph-deps', label: 'Grafo de dependencias', icon: <><circle cx="6" cy="6" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="12" cy="18" r="2.5" /><path d="M7.5 7.5L11 16" /><path d="M16.5 7.5L13 16" /><path d="M8.5 6h7" /></> },
      { id: 'quant-validation', label: 'Validación cuantitativa', icon: <><path d="M3 3v18h18" /><path d="M7 14l4-4 4 4 5-5" /><circle cx="7" cy="14" r="1.5" fill="currentColor" /><circle cx="11" cy="10" r="1.5" fill="currentColor" /><circle cx="15" cy="14" r="1.5" fill="currentColor" /><circle cx="20" cy="9" r="1.5" fill="currentColor" /></> },
      { id: 'validacion', label: 'Validación cualitativa', icon: <><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></> },
    ],
  },
  {
    section: 'Cierre',
    items: [
      { id: 'reporte', label: 'Reporte', icon: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></> },
      { id: 'kappa', label: 'Kappa de Fleiss', icon: <><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></> },
    ],
  },
];

const LOCK_SVG = (
  <svg className="lock" style={{ marginLeft: 'auto', width: 11, height: 11, opacity: 0.5 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

export function Sidebar({
  currentView, onNavigate, user, role, project,
}: {
  currentView: string;
  onNavigate: (v: string) => void;
  user: ShellUser;
  role: Role | null;
  project?: { name: string } | null;
}) {
  const initials = user.name.split(/\s+/).slice(0, 2).map((w) => w[0] ?? '').join('').toUpperCase();

  // Hide what this role cannot open, and drop a section left empty by that.
  const sections = NAV
    .map((section) => ({ ...section, items: section.items.filter((it) => canRead(it.id, role)) }))
    .filter((section) => section.items.length > 0);

  return (
    <aside className="side">
      <div className="brand">
        <div className="logo">D</div>
        <div className="meta">
          DCM Etiquetador
          <small>EpData · LLM Juez · v0.4</small>
        </div>
      </div>

      {sections.map((section) => (
        <div key={section.section}>
          <div className="section-title">{section.section}</div>
          <nav className="nav">
            {section.items.map((it) => (
              <button
                key={it.id}
                className={currentView === it.id ? 'active' : ''}
                onClick={() => onNavigate(it.id)}
              >
                <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  {it.icon}
                </svg>
                <span>{it.label}</span>
                {it.lock ? LOCK_SVG : it.trailing ?? null}
                {it.badge ? <span className="badge">{it.badge}</span> : null}
              </button>
            ))}
          </nav>
        </div>
      ))}

      <div className="footer">
        <div className="who">
          <div className="avatar" style={{ background: user.color ?? undefined }}>{initials}</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user.name}
            </div>
            <small style={{ opacity: 0.75 }}>
              {role ? ROLE_LABELS[role] : 'Sin rol en este proyecto'}
            </small>
          </div>
        </div>
        <div>
          Proyecto activo:<br />
          <b style={{ color: '#cfd8db' }}>{project?.name ?? 'ninguno'}</b>
        </div>
        <form action={logoutAction} style={{ marginTop: 10 }}>
          <button type="submit" className="btn ghost"
                  style={{ width: '100%', justifyContent: 'center', color: '#cfd8db', fontSize: 12 }}>
            <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Cerrar sesión
          </button>
        </form>
      </div>
    </aside>
  );
}

/** Every view the sidebar can navigate to — asserted against the route table. */
export const NAV_VIEW_IDS: string[] = NAV.flatMap((section) => section.items.map((i) => i.id));
