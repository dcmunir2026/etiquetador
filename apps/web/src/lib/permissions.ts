/**
 * Who can see and do what.
 *
 * Roles are scoped to a project (`project_members.role`), except for
 * `superadmin`, which is a property of the user and applies everywhere. So a
 * person can administer one project and merely annotate in another: the
 * effective role is always resolved against the *active* project.
 *
 * This file is the single place the matrix lives. Changing a cell here
 * changes the sidebar, the route guard and the server actions at once.
 */

export const ROLES = ['superadmin', 'projectadmin', 'validator', 'annotator', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  superadmin: 'Superadministrador',
  projectadmin: 'Administrador de proyecto',
  validator: 'Validador',
  annotator: 'Etiquetador',
  viewer: 'Observador',
};

/** `read` shows the screen; `write` also enables its actions. */
export type Access = 'write' | 'read' | 'none';

/**
 * Per view, the access each role gets.
 *
 * A role absent from a view's record has no access, so adding a view
 * without thinking about permissions fails closed rather than open.
 */
const MATRIX: Record<string, Partial<Record<Role, Access>>> = {
  // Always reachable — the landing screen lists the projects you belong to.
  dashboard: { superadmin: 'write', projectadmin: 'write', validator: 'read', annotator: 'read', viewer: 'read' },

  // Corpus ingestion is an administrative act.
  upload: { superadmin: 'write', projectadmin: 'write' },

  // The global catalogue: only the super admin may create, edit or archive.
  taxonomies: { superadmin: 'write', projectadmin: 'read', validator: 'read' },
  'taxonomy-groups': { superadmin: 'write', projectadmin: 'read', validator: 'read' },

  // Project configuration.
  dimensions: { superadmin: 'write', projectadmin: 'write', annotator: 'read' },
  roles: { superadmin: 'write', projectadmin: 'write' },
  paquetes: { superadmin: 'write', projectadmin: 'write' },
  segmentation: { superadmin: 'write', projectadmin: 'write' },

  // Annotation is the annotator's job; admins keep access to test the flow.
  tagging: { superadmin: 'write', annotator: 'write' },

  // Agreement and validation belong to validators and admins.
  discrepancias: { superadmin: 'write', projectadmin: 'write', validator: 'write', viewer: 'read' },
  'discrepancias-equipos': { superadmin: 'write', projectadmin: 'write', validator: 'write', viewer: 'read' },
  'quant-validation': { superadmin: 'write', projectadmin: 'write', validator: 'write', viewer: 'read' },
  validacion: { superadmin: 'write', projectadmin: 'write', validator: 'write', viewer: 'read' },

  // The dependency graph explains the cascade, so annotators need it too.
  'graph-deps': { superadmin: 'write', projectadmin: 'write', validator: 'write', annotator: 'read', viewer: 'read' },

  // Closing artefacts.
  reporte: { superadmin: 'write', projectadmin: 'write', validator: 'write', viewer: 'read' },
  kappa: { superadmin: 'write', projectadmin: 'write', validator: 'write', viewer: 'read' },
};

export function accessTo(view: string, role: Role | null): Access {
  if (!role) return 'none';
  return MATRIX[view]?.[role] ?? 'none';
}

/** Can this role open the screen at all? */
export function canRead(view: string, role: Role | null): boolean {
  return accessTo(view, role) !== 'none';
}

/** Can this role perform the screen's actions? */
export function canWrite(view: string, role: Role | null): boolean {
  return accessTo(view, role) === 'write';
}

/** Views this role may open, in no particular order. */
export function readableViews(role: Role | null): string[] {
  if (!role) return [];
  return Object.keys(MATRIX).filter((v) => canRead(v, role));
}

/**
 * Where to send someone after signing in, or when they hit a screen they
 * cannot open: the first screen their role can actually use.
 */
export function landingViewFor(role: Role | null): string {
  if (!role) return 'dashboard';
  const preference = ['dashboard', 'tagging', 'quant-validation', 'validacion', 'reporte', 'taxonomies'];
  return preference.find((v) => canRead(v, role)) ?? 'dashboard';
}

/** Every view named in the matrix — used to assert it stays in sync. */
export const PERMISSIONED_VIEWS = Object.keys(MATRIX);
