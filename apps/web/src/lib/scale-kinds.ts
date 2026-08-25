/**
 * Pure constants for scale (intensity-scale) kinds. No drizzle / DB
 * imports so this is safe to import from client components.
 *
 * Keep in sync with `SCALE_KINDS` in packages/db/src/index.ts and
 * apps/web/src/db/schema.ts.
 */
export const SCALE_KINDS = [
  'boolean',
  'binary',
  '3-level',
  '5-level',
  'likert',
  'numerical',
  'free-text',
] as const;

export type ScaleKind = (typeof SCALE_KINDS)[number];

export const SCALE_KIND_LABELS: Record<ScaleKind, string> = {
  boolean: 'Booleano (2 valores, Sí/No)',
  binary: 'Binario (2 valores, +/-)',
  '3-level': 'Tres niveles (Bajo / Medio / Alto)',
  '5-level': 'Cinco niveles (1–5)',
  likert: 'Likert (1–7)',
  numerical: 'Numérica libre',
  'free-text': 'Texto libre (sin opciones)',
};
