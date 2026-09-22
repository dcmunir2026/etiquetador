/**
 * The single source of truth for the path ↔ view mapping.
 *
 * Shared by the Shell (which pushes paths when the sidebar is clicked) and
 * by the routes that render them, so the two can never drift apart.
 */

export const VIEW_FROM_PATH: Record<string, string> = {
  '/': 'dashboard',
  '/proyectos': 'dashboard',
  '/cargar-excel': 'upload',
  '/dimensiones': 'taxonomies',
  '/taxonomias': 'taxonomy-groups',
  '/proyecto/taxonomias': 'dimensions',
  '/proyecto/roles': 'roles',
  '/proyecto/paquetes': 'paquetes',
  '/proyecto/segmentacion': 'segmentation',
  '/etiquetar': 'tagging',
  '/discrepancias': 'discrepancias',
  '/discrepancias-equipos': 'discrepancias-equipos',
  '/grafo-dependencias': 'graph-deps',
  '/validacion-cuantitativa': 'quant-validation',
  '/validacion': 'validacion',
  '/reporte': 'reporte',
  '/kappa': 'kappa',
};

/** First path listed for each view — the canonical URL we navigate to. */
export const PATH_FROM_VIEW: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const [path, view] of Object.entries(VIEW_FROM_PATH)) {
    if (!(view in out)) out[view] = path;
  }
  return out;
})();

/** Every view the app can render, whether reached by path or by `?view=`. */
export const KNOWN_VIEWS = new Set(Object.values(VIEW_FROM_PATH));

export function viewFromPath(pathname: string): string | null {
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return VIEW_FROM_PATH[clean] ?? null;
}

/** Views that cannot render anything meaningful without an active project. */
export const REQUIRES_PROJECT = new Set([
  'dimensions', 'roles', 'paquetes', 'segmentation', 'upload', 'tagging',
  'discrepancias', 'discrepancias-equipos', 'graph-deps', 'quant-validation',
  'validacion', 'reporte', 'kappa',
]);
