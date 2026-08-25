/**
 * Pure constants for dimension types. No drizzle / DB imports so this
 * is safe to import from both server and client components.
 */
export const DIMENSION_KINDS = [
  'category',
  'intensity',
  'flag',
  'free-text',
] as const;

export type DimensionKind = (typeof DIMENSION_KINDS)[number];

export const DIMENSION_KIND_LABELS: Record<DimensionKind, string> = {
  category: 'Categoría (valores discretos)',
  intensity: 'Intensidad (escala numérica)',
  flag: 'Flag (presencia / ausencia)',
  'free-text': 'Texto libre',
};
