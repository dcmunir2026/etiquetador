'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { logoutAction } from '@/lib/logout-action';

type SidebarUser = {
  id: string;
  name: string | null;
  email: string;
  isSuperAdmin: boolean;
  avatarColor?: string | null;
};

const NAV: Array<{ section: string; items: Array<{ href: string; label: string; icon: string; lock?: boolean }> }> = [
  {
    section: 'Proyecto',
    items: [
      { href: '/', label: 'Acceso', icon: 'home' },
      { href: '/proyectos', label: 'Proyectos', icon: 'grid' },
      { href: '/upload', label: 'Cargar Excel', icon: 'upload' },
    ],
  },
  {
    section: 'Catálogo',
    items: [
      { href: '/dimensiones', label: 'Dimensiones', icon: 'list' },
      { href: '/taxonomias', label: 'Taxonomías', icon: 'grid-small' },
    ],
  },
  {
    section: 'Configuración',
    items: [
      { href: '/proyecto/taxonomias', label: 'Taxonomías del proyecto', icon: 'check', lock: true },
      { href: '/proyecto/roles', label: 'Roles y equipos', icon: 'users', lock: true },
      { href: '/proyecto/paquetes', label: 'Paquetes', icon: 'package', lock: true },
      { href: '/proyecto/segmentacion', label: 'Segmentación', icon: 'cut', lock: true },
    ],
  },
  {
    section: 'Etiquetado',
    items: [
      { href: '/etiquetar', label: 'Etiquetar fragmento', icon: 'tag' },
      { href: '/discrepancias', label: 'Discrepancias', icon: 'alert' },
      { href: '/validacion', label: 'Validación cualitativa', icon: 'check-circle' },
    ],
  },
  {
    section: 'Cierre',
    items: [
      { href: '/reporte', label: 'Reporte', icon: 'file' },
      { href: '/kappa', label: 'Kappa de Fleiss', icon: 'chart' },
    ],
  },
];

const ICONS: Record<string, JSX.Element> = {
  home: <path d="M3 12l9-9 9 9M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10" />,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  upload: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></>,
  list: <><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><circle cx="4" cy="6" r="1" fill="currentColor" /><circle cx="4" cy="12" r="1" fill="currentColor" /><circle cx="4" cy="18" r="1" fill="currentColor" /></>,
  'grid-small': <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  check: <><polyline points="20 6 9 17 4 12" /></>,
  users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
  package: <><path d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></>,
  cut: <><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><line x1="20" y1="4" x2="8.12" y2="15.88" /><line x1="14.47" y1="14.48" x2="20" y2="20" /><line x1="8.12" y1="8.12" x2="12" y2="12" /></>,
  tag: <><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><circle cx="7" cy="7" r="1" fill="currentColor" /></>,
  alert: <><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><circle cx="12" cy="17" r="0.5" fill="currentColor" /></>,
  'check-circle': <><circle cx="12" cy="12" r="10" /><polyline points="9 12 12 15 22 7" /></>,
  file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></>,
  chart: <><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></>,
};

export function Sidebar({ user }: { user: SidebarUser }) {
  const pathname = usePathname();
  const initials = (user.name || user.email).split(/[\s@.]/).filter(Boolean).slice(0, 2).map(s => s[0]!.toUpperCase()).join('') || '?';

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="av">D</div>
        <div className="meta">
          <span className="name">DCM Etiquetador</span>
          <span className="sub">EpData · LLM Juez · v0.1</span>
        </div>
      </div>

      {NAV.map((section) => (
        <div key={section.section}>
          <div className="section-title">{section.section}</div>
          <nav>
            {section.items.map((it) => {
              const active = pathname === it.href;
              return (
                <Link key={it.href} href={it.href}>
                  <button className={active ? 'active' : ''}>
                    <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      {ICONS[it.icon]}
                    </svg>
                    <span>{it.label}</span>
                    {it.lock && (
                      <svg className="ic" style={{ width: 11, height: 11, marginLeft: 'auto', opacity: 0.5 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="11" width="18" height="11" rx="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                    )}
                  </button>
                </Link>
              );
            })}
          </nav>
        </div>
      ))}

      <div className="footer">
        <div className="who">
          <div className="av-sm">{initials}</div>
          <div>
            <div style={{ color: '#fff', fontSize: 13 }}>{user.name || user.email}</div>
            <div>{user.isSuperAdmin ? 'Superadmin' : 'Project admin'}</div>
          </div>
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            style={{
              background: 'transparent',
              border: '1px solid var(--sidebar-line)',
              color: 'var(--sidebar-ink)',
              padding: '5px 10px',
              borderRadius: 6,
              fontSize: 12,
              cursor: 'pointer',
              marginTop: 4,
              width: '100%',
            }}
          >
            Cerrar sesión
          </button>
        </form>
      </div>
    </aside>
  );
}
