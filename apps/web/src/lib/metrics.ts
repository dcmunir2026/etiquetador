/**
 * Inter-rater agreement.
 *
 * Everything here is computed from the `annotations` table — no stored
 * aggregates — so the discrepancy and kappa screens always reflect the
 * annotations as they stand.
 */

/** One annotator's answer for one (fragment, dimension) pair. */
export type RatingRow = {
  fragmentId: string;
  dimensionId: string;
  userId: string;
  /** null when the cascade skipped this dimension for this annotator. */
  value: string | null;
  skipped: boolean;
};

/** Skipped answers are a meaningful, comparable outcome, not missing data. */
const SKIP_CATEGORY = '§skip';

function categoryOf(r: RatingRow): string {
  return r.skipped || r.value === null ? SKIP_CATEGORY : r.value;
}

/**
 * Fleiss' kappa, generalised to a variable number of raters per item.
 *
 * Items rated by fewer than two annotators carry no agreement information
 * and are dropped.
 */
export function fleissKappa(items: string[][]): number | null {
  const usable = items.filter((raters) => raters.length >= 2);
  if (usable.length === 0) return null;

  const categories = Array.from(new Set(usable.flat()));
  if (categories.length <= 1) return 1; // everyone agreed on everything

  const k = categories.length;
  const index = new Map(categories.map((c, i) => [c, i]));

  let sumPi = 0;
  const categoryTotals = new Array(k).fill(0);
  let totalRatings = 0;

  for (const raters of usable) {
    const counts = new Array(k).fill(0);
    for (const r of raters) counts[index.get(r)!]++;
    const n = raters.length;
    totalRatings += n;
    for (let j = 0; j < k; j++) categoryTotals[j] += counts[j];

    const sumSquares = counts.reduce((acc, c) => acc + c * c, 0);
    sumPi += (sumSquares - n) / (n * (n - 1));
  }

  const pBar = sumPi / usable.length;
  const pE = categoryTotals.reduce((acc, total) => {
    const p = total / totalRatings;
    return acc + p * p;
  }, 0);

  if (pE >= 1) return 1; // degenerate: a single category was ever used
  return (pBar - pE) / (1 - pE);
}

/** Landis & Koch interpretation bands. */
export function kappaLabel(k: number | null): string {
  if (k === null) return 'sin datos';
  if (k < 0) return 'sin acuerdo';
  if (k <= 0.2) return 'leve';
  if (k <= 0.4) return 'aceptable';
  if (k <= 0.6) return 'moderado';
  if (k <= 0.8) return 'sustancial';
  return 'casi perfecto';
}

/** Group ratings into `fragmentId → dimensionId → answers`. */
function groupRatings(rows: RatingRow[]): Map<string, Map<string, string[]>> {
  const byFragment = new Map<string, Map<string, string[]>>();
  for (const r of rows) {
    let dims = byFragment.get(r.fragmentId);
    if (!dims) { dims = new Map(); byFragment.set(r.fragmentId, dims); }
    const bucket = dims.get(r.dimensionId) ?? [];
    bucket.push(categoryOf(r));
    dims.set(r.dimensionId, bucket);
  }
  return byFragment;
}

export type DimensionDiscrepancy = {
  dimensionId: string;
  /** Fragments where at least two annotators disagreed. */
  disagreed: number;
  /** Fragments rated by 2+ annotators on this dimension. */
  comparable: number;
  pct: number;
  kappa: number | null;
};

export type DiscrepancyReport = {
  /** Fragments where at least one dimension drew disagreement. */
  discrepantFragments: number;
  comparableFragments: number;
  /** Share of fragments with any disagreement. Grows with dimension count. */
  pct: number;
  /** (fragment, dimension) pairs where annotators diverged. */
  disagreedRatings: number;
  comparableRatings: number;
  /**
   * Share of individual ratings in disagreement. This is the figure to
   * threshold on: unlike `pct`, it does not saturate as a project adds
   * dimensions, so it stays comparable across projects.
   */
  ratingPct: number;
  byDimension: DimensionDiscrepancy[];
  overallKappa: number | null;
};

/**
 * Per-dimension and overall disagreement for a set of ratings.
 *
 * `excludeDimensions` is for free-text dimensions, where two annotators
 * phrasing the same idea differently is not a discrepancy.
 */
export function computeDiscrepancies(
  rows: RatingRow[],
  excludeDimensions: Set<string> = new Set(),
): DiscrepancyReport {
  const scored = rows.filter((r) => !excludeDimensions.has(r.dimensionId));
  const byFragment = groupRatings(scored);

  const perDimension = new Map<string, { disagreed: number; comparable: number; items: string[][] }>();
  let discrepantFragments = 0;
  let comparableFragments = 0;
  let disagreedRatings = 0;
  let comparableRatings = 0;

  for (const dims of byFragment.values()) {
    let fragmentComparable = false;
    let fragmentDisagreed = false;

    for (const [dimensionId, answers] of dims) {
      const entry = perDimension.get(dimensionId) ?? { disagreed: 0, comparable: 0, items: [] };
      if (answers.length >= 2) {
        entry.comparable++;
        entry.items.push(answers);
        comparableRatings++;
        fragmentComparable = true;
        if (new Set(answers).size > 1) {
          entry.disagreed++;
          disagreedRatings++;
          fragmentDisagreed = true;
        }
      }
      perDimension.set(dimensionId, entry);
    }

    if (fragmentComparable) comparableFragments++;
    if (fragmentDisagreed) discrepantFragments++;
  }

  const byDimension: DimensionDiscrepancy[] = Array.from(perDimension.entries())
    .map(([dimensionId, e]) => ({
      dimensionId,
      disagreed: e.disagreed,
      comparable: e.comparable,
      pct: e.comparable ? e.disagreed / e.comparable : 0,
      kappa: fleissKappa(e.items),
    }))
    .sort((a, b) => b.pct - a.pct);

  return {
    discrepantFragments,
    comparableFragments,
    pct: comparableFragments ? discrepantFragments / comparableFragments : 0,
    disagreedRatings,
    comparableRatings,
    ratingPct: comparableRatings ? disagreedRatings / comparableRatings : 0,
    byDimension,
    overallKappa: meanKappa(byDimension),
  };
}

/**
 * Overall kappa as the item-weighted mean of the per-dimension kappas.
 *
 * Pooling every dimension's ratings into a single kappa would be wrong:
 * each dimension has its own category set, so pooling inflates the number
 * of categories, drives expected-by-chance agreement down and reports an
 * agreement far higher than any individual dimension achieves. Averaging
 * per dimension keeps the figure comparable with the per-dimension chart.
 */
export function meanKappa(byDimension: DimensionDiscrepancy[]): number | null {
  const usable = byDimension.filter((d) => d.kappa !== null && d.comparable > 0);
  if (usable.length === 0) return null;
  const weight = usable.reduce((a, d) => a + d.comparable, 0);
  if (weight === 0) return null;
  return usable.reduce((a, d) => a + d.kappa! * d.comparable, 0) / weight;
}

/**
 * Majority answer per (fragment, dimension), with how many annotators
 * backed it. Ties resolve to the first value seen, which keeps the result
 * stable for a given query order.
 */
export function consensusOf(answers: string[]): { value: string; agree: number; total: number } {
  const counts = new Map<string, number>();
  for (const a of answers) counts.set(a, (counts.get(a) ?? 0) + 1);
  let best = answers[0] ?? '';
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) { best = value; bestCount = count; }
  }
  return { value: best, agree: bestCount, total: answers.length };
}

export { SKIP_CATEGORY };
