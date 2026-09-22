import { ROLE_LABELS, landingViewFor, type Role } from '@/lib/permissions';
import { PATH_FROM_VIEW } from '@/lib/views';

const VIEW_LABELS: Record<string, string> = {
  upload: 'Cargar corpus',
  taxonomies: 'Dimensiones',
  'taxonomy-groups': 'Taxonomías',
  dimensions: 'Taxonomías del proyecto',
  roles: 'Roles y equipos',
  paquetes: 'Paquetes',
  segmentation: 'Segmentación',
  tagging: 'Etiquetar fragmento',
  discrepancias: 'Discrepancias',
  'discrepancias-equipos': 'Discrepancias de equipos',
  'graph-deps': 'Grafo de dependencias',
  'quant-validation': 'Validación cuantitativa',
  validacion: 'Validación cualitativa',
  reporte: 'Reporte',
  kappa: 'Kappa de Fleiss',
};

/**
 * Shown when a signed-in user opens a screen their role cannot use.
 *
 * It names the role and offers a way out, rather than a bare 403: being
 * the wrong role is a normal state here, not an error.
 */
export function forbidden(view: string, role: Role | null) {
  const label = VIEW_LABELS[view] ?? view;
  const back = PATH_FROM_VIEW[landingViewFor(role)] ?? '/';

  return (
    <div className="page">
      <div className="picker-card" style={{ maxWidth: 560 }}>
        <svg className="ic-big" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <h2>No tienes acceso a «{label}»</h2>
        <p className="lead">
          {role
            ? <>Tu rol en este proyecto es <b>{ROLE_LABELS[role]}</b>, y esta sección no forma parte
                de tu trabajo. Si crees que deberías verla, pídelo a un administrador del proyecto.</>
            : <>No eres miembro de este proyecto. Pide acceso a un administrador, o cambia de
                proyecto en la barra superior.</>}
        </p>
        <a className="btn primary" href={back}>Volver a lo que sí puedes hacer</a>
      </div>
    </div>
  );
}
