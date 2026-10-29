/**
 * Addresses of the tagging screen and of the admin's preview of it.
 *
 * Both screens navigate by pushing a URL with a `fragment` parameter, so
 * the URL builders live here, away from the components: they are pure,
 * and the rules they encode (which parameter survives a navigation, what
 * happens when the package changes) are worth a test.
 */

/** Path of the annotator's own screen. */
export const TAGGING_PATH = '/etiquetar';

/** Path of the admin's preview of the annotator's screen. */
export const TAGGING_PREVIEW_PATH = '/etiquetar-vista';

/**
 * The address of a fragment inside a tagging screen.
 *
 * `base` is the screen's address without the fragment: '/etiquetar' for
 * the annotator, '/etiquetar-vista?user=…&pkg=…' for the preview. Every
 * parameter already in `base` survives, so the preview keeps the person
 * and the package it is showing while the fragment changes.
 *
 * The fragment is a position ('5') or an ID ('ABC-456#2') — both are
 * accepted by the screen, so both belong here.
 */
export function fragmentUrl(base: string, fragment: number | string): string {
  const [path = '', query] = base.split('?');
  const params = new URLSearchParams(query ?? '');
  params.set('fragment', String(fragment));
  return `${path}?${params.toString()}`;
}

/**
 * The preview's own address: who is being watched, in which package, and
 * whether the navigation is restricted to the discrepant fragments.
 *
 * Without a person there is nothing to show, so the address carries no
 * parameters at all.
 */
export function previewBaseUrl(input: {
  userId: string | null;
  packageId?: string | null;
  discrepOnly?: boolean;
}): string {
  const params = new URLSearchParams();
  if (input.userId) params.set('user', input.userId);
  if (input.packageId) params.set('pkg', input.packageId);
  if (input.discrepOnly) params.set('discrep', '1');
  const qs = params.toString();
  return qs ? `${TAGGING_PREVIEW_PATH}?${qs}` : TAGGING_PREVIEW_PATH;
}

/**
 * The preview's address with the discrepant-only filter turned on or off.
 *
 * The filter lives in the URL because it has to survive the navigation
 * between fragments: without it, every arrow press would reset the
 * filter and the admin would lose the annotator's restricted view.
 */
export function previewUrlWithDiscrep(base: string, on: boolean): string {
  const [path = '', query] = base.split('?');
  const params = new URLSearchParams(query ?? '');
  if (on) params.set('discrep', '1');
  else params.delete('discrep');
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}
