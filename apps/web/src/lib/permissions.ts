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

export const ROLES = ['superadmin', 'projectadmin', 'validador_cualitativo', 'validador_cuantitativo', 'annotator', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  superadmin: 'Superadministrador',
  projectadmin: 'Administrador de proyecto',
  validador_cualitativo: 'Validador cualitativo',
  validador_cuantitativo: 'Validador cuantitativo',
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
  dashboard: { superadmin: 'write', projectadmin: 'write',
               validador_cualitativo: 'read', validador_cuantitativo: 'read',
               annotator: 'read', viewer: 'read' },

  // Corpus ingestion is an administrative act.
  upload: { superadmin: 'write', projectadmin: 'write' },

  // The global catalogue: only the super admin may create, edit or archive.
  taxonomies: { superadmin: 'write', projectadmin: 'read',
                validador_cualitativo: 'read', validador_cuantitativo: 'read' },
  'taxonomy-groups': { superadmin: 'write', projectadmin: 'read',
                       validador_cualitativo: 'read', validador_cuantitativo: 'read' },

  // Project configuration.
  dimensions: { superadmin: 'write', projectadmin: 'write', annotator: 'read' },
  roles: { superadmin: 'write', projectadmin: 'write' },
  paquetes: { superadmin: 'write', projectadmin: 'write' },
  segmentation: { superadmin: 'write', projectadmin: 'write' },

  // Annotation is the annotator's job; admins keep access to test the flow.
  tagging: { superadmin: 'write', annotator: 'write' },

  // Agreement and validation belong to validators and admins. Each
  // specific validator only sees their own write target; they share the
  // disagreement list.
  discrepancias: { superadmin: 'write', projectadmin: 'write',
                   validador_cualitativo: 'write', validador_cuantitativo: 'write',
                   viewer: 'read' },
  'quant-validation': { superadmin: 'write', projectadmin: 'write', validador_cuantitativo: 'write' },
  validacion:          { superadmin: 'write', projectadmin: 'write', validador_cualitativo: 'write' },

  // The dependency graph explains the cascade, so annotators need it too.
  'graph-deps': { superadmin: 'write', projectadmin: 'write', annotator: 'read', viewer: 'read' },

  // Closing artefacts.
  reporte: { superadmin: 'write', projectadmin: 'write', viewer: 'read' },
  kappa:   { superadmin: 'write', projectadmin: 'write', viewer: 'read' },
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

// ─── Multi-role support ──────────────────────────────────────────────
//
// A person can wear several hats in the same project (the unique index on
// `project_members` is on (projectId, userId, role), not (projectId, userId)).
// Each row below preserves the existing single-role API for callers that
// only care about one label, and adds the multi-role versions the gate and
// the UI use.

/** Higher = more privilege. Used to pick the "primary" role for display. */
const ROLE_PRIVILEGE: Record<Role, number> = {
  superadmin: 5,
  projectadmin: 4,
  validador_cuantitativo: 3,
  validador_cualitativo: 2,
  annotator: 1,
  viewer: 0,
};

/**
 * The role we surface when a person has several. Best privilege wins, ties
 * keep the first in the array. Returns null for an empty array — callers
 * treat that as "no access at all".
 */
export function pickPrimaryRole(roles: Role[]): Role | null {
  return roles.reduce<Role | null>((best, cur) =>
    best === null || ROLE_PRIVILEGE[cur] > ROLE_PRIVILEGE[best] ? cur : best,
  null);
}

/** Effective access for someone with N roles: the best per view wins. */
export function accessForRoles(view: string, roles: Role[]): Access {
  let best: Access = 'none';
  for (const r of roles) {
    const a = MATRIX[view]?.[r] ?? 'none';
    if (a === 'write') return 'write';
    if (a === 'read' && best === 'none') best = 'read';
  }
  return best;
}

/** Can this combination of roles open the screen at all? */
export function canReadForRoles(view: string, roles: Role[]): boolean {
  return accessForRoles(view, roles) !== 'none';
}

/** Can this combination of roles perform the screen's actions? */
export function canWriteForRoles(view: string, roles: Role[]): boolean {
  return accessForRoles(view, roles) === 'write';
}

/** Views this combination of roles may open, in no particular order. */
export function readableViewsForRoles(roles: Role[]): string[] {
  return Object.keys(MATRIX).filter((v) => canReadForRoles(v, roles));
}

/** Landing view: first entry in the preference list the roles can actually read. */
export function landingViewForRoles(roles: Role[]): string {
  const preference = ['dashboard', 'tagging', 'quant-validation', 'validacion', 'reporte', 'taxonomies'];
  return preference.find((v) => canReadForRoles(v, roles)) ?? 'dashboard';
}

/** Every view named in the matrix — used to assert it stays in sync. */
export const PERMISSIONED_VIEWS = Object.keys(MATRIX);
