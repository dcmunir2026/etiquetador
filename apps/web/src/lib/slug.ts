/**
 * URL-safe slug generator. Lower-case, ASCII, hyphens for separators.
 * Punctuation is dropped. Leading/trailing hyphens are trimmed.
 *
 * Examples:
 *   "EpData 2026-Q3"     → "epdata-2026-q3"
 *   "  Hola, ¿qué tal?"  → "hola-que-tal"
 *   "___test___"          → "test"
 */
export function slugify(input: string): string {
  return input
    .normalize('NFD') // split accents
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/**
 * Append `-2`, `-3`, ... until the slug is unique across all existing
 * projects. Returns the first available slug.
 */
export function dedupeSlug(
  base: string,
  taken: ReadonlySet<string>,
): string {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
