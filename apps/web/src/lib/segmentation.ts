/**
 * Text segmentation — ported from the gh-pages mockup (`segTokenize`,
 * `segSlice`, `segCount`).
 *
 * Kept deliberately dependency-free so it runs identically on the server
 * (splitting an uploaded corpus) and in the browser (the live preview on
 * the segmentation screen).
 */

export type SegmentationUnit = 'token' | 'word' | 'sentence' | 'paragraph' | 'character';

export type SegmentationParams = {
  unit: SegmentationUnit;
  /** Maximum fragment size, counted in `unit`s. */
  maxSize: number;
  /** Units repeated between consecutive fragments, to preserve context. */
  overlap: number;
  /** Never cut mid-word/sentence when true. */
  respectBoundaries: boolean;
  /** Percent of `maxSize` a fragment may shrink by to land on a boundary. */
  tolerance: number;
};

export const UNIT_LABELS: Record<SegmentationUnit, string> = {
  token: 'tokens',
  word: 'palabras',
  sentence: 'frases',
  paragraph: 'párrafos',
  character: 'caracteres',
};

/** Split text into the atoms that fragments are measured in. */
export function segTokenize(text: string, unit: SegmentationUnit): string[] {
  switch (unit) {
    case 'token':
      return text.split(/(\s+|[.,;:!?¿¡])/g).filter((t) => t && t.trim().length > 0);
    case 'word':
      return text.split(/\s+/g).filter((w) => w.length > 0);
    case 'sentence':
      return text.split(/(?<=[.!?])\s+/g).filter((s) => s.trim().length > 0);
    case 'paragraph':
      return text.split(/\n\s*\n+/g).filter((p) => p.trim().length > 0);
    case 'character':
      return text.split('');
    default:
      return [text];
  }
}

/** Count how many `unit`s a piece of text contains. */
export function segCount(text: string, unit: SegmentationUnit): number {
  switch (unit) {
    case 'token':
      return text.split(/\s+/).filter((t) => t.length).length;
    case 'word':
      return text.split(/\s+/).filter((w) => w.length).length;
    case 'sentence':
      return text.split(/(?<=[.!?])\s+/).filter((s) => s.trim()).length;
    case 'paragraph':
      return text.split(/\n\s*\n+/).filter((p) => p.trim()).length;
    case 'character':
      return text.length;
    default:
      return 1;
  }
}

/** The smallest fragment the mockup allows, in units. */
export const MIN_FRAGMENT_UNITS = 10;

/**
 * Slide a window of `maxSize` units across `units`, stepping forward by
 * `maxSize - overlap` so consecutive fragments share context.
 *
 * The mockup's loop guarded its cursor with `i <= fragments[…]?.length`,
 * comparing an index against a *string length*; that could stall or skip
 * unpredictably. Here the cursor is simply forced to make progress, which
 * is what that guard was reaching for.
 */
export function segSlice(units: string[], params: SegmentationParams): string[] {
  const { unit, maxSize, overlap, respectBoundaries, tolerance } = params;
  const joiner = unit === 'character' ? '' : ' ';

  if (units.length === 0) return [];
  if (units.length <= maxSize) return [units.join(joiner)];

  const size = Math.max(1, maxSize);
  const toleranceAbs = Math.floor((size * (tolerance || 0)) / 100);
  const minSize = Math.max(Math.min(MIN_FRAGMENT_UNITS, size), size - toleranceAbs);
  // Overlap must stay below the window, otherwise the cursor never advances.
  const effectiveOverlap = Math.max(0, Math.min(overlap, size - 1));

  const fragments: string[] = [];
  let i = 0;

  while (i < units.length) {
    let end = Math.min(i + size, units.length);

    // Pull the cut back to a sentence boundary when asked to, but never
    // shrink the fragment below `minSize`.
    if (respectBoundaries && end < units.length && (unit === 'word' || unit === 'token')) {
      let candidate = end;
      while (candidate > i + minSize && !/[.!?;:]$/.test(units[candidate - 1] ?? '')) candidate--;
      if (candidate > i + minSize) end = candidate;
    }

    fragments.push(units.slice(i, end).join(joiner));
    if (end >= units.length) break;

    const next = end - effectiveOverlap;
    i = next > i ? next : end; // always move forward
  }

  return fragments;
}

export type FragmentStats = {
  fragments: string[];
  count: number;
  avg: number;
  min: number;
  max: number;
};

/** Segment a text and summarise the result, for the live preview. */
export function segment(text: string, params: SegmentationParams): FragmentStats {
  const units = segTokenize(text, params.unit);
  const fragments = segSlice(units, params);
  const sizes = fragments.map((f) => segCount(f, params.unit));
  return {
    fragments,
    count: fragments.length,
    avg: sizes.length ? Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length) : 0,
    min: sizes.length ? Math.min(...sizes) : 0,
    max: sizes.length ? Math.max(...sizes) : 0,
  };
}
