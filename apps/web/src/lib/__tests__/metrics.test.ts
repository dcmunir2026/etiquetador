import { describe, expect, it } from 'vitest';
import { computeDiscrepancies, fleissKappa, kappaLabel, meanKappa, type RatingRow } from '../metrics';

describe('fleissKappa', () => {
  it('returns 1 when every rater always agrees', () => {
    expect(fleissKappa([['a', 'a'], ['b', 'b'], ['a', 'a']])).toBe(1);
  });

  it('returns null without any item rated twice', () => {
    expect(fleissKappa([['a'], ['b']])).toBeNull();
  });

  it('is near zero when raters agree only as often as chance predicts', () => {
    // Two categories used equally, raters split at random on every item.
    const items = Array.from({ length: 100 }, (_, i) =>
      i % 2 === 0 ? ['a', 'b'] : ['b', 'a']);
    const k = fleissKappa(items)!;
    expect(k).toBeLessThan(0.05);
    expect(k).toBeGreaterThan(-1.05);
  });

  it('matches the textbook worked example', () => {
    // Fleiss (1971): 10 items, 3 raters, agreement well above chance.
    const items = [
      ['a', 'a', 'a'], ['b', 'b', 'b'], ['a', 'a', 'b'], ['c', 'c', 'c'],
      ['a', 'a', 'a'], ['b', 'b', 'c'], ['c', 'c', 'c'], ['b', 'b', 'b'],
      ['a', 'a', 'a'], ['c', 'c', 'b'],
    ];
    const k = fleissKappa(items)!;
    expect(k).toBeGreaterThan(0.6);
    expect(k).toBeLessThan(0.9);
  });

  it('copes with a varying number of raters per item', () => {
    const k = fleissKappa([['a', 'a'], ['b', 'b', 'b'], ['a', 'a', 'b', 'a']]);
    expect(k).not.toBeNull();
    expect(Number.isFinite(k!)).toBe(true);
  });
});

describe('kappaLabel', () => {
  it('maps onto the Landis & Koch bands', () => {
    expect(kappaLabel(null)).toBe('sin datos');
    expect(kappaLabel(-0.2)).toBe('sin acuerdo');
    expect(kappaLabel(0.15)).toBe('leve');
    expect(kappaLabel(0.5)).toBe('moderado');
    expect(kappaLabel(0.75)).toBe('sustancial');
    expect(kappaLabel(0.95)).toBe('casi perfecto');
  });
});

function rating(fragmentId: string, dimensionId: string, userId: string, value: string | null, skipped = false): RatingRow {
  return { fragmentId, dimensionId, userId, value, skipped };
}

describe('computeDiscrepancies', () => {
  it('counts a fragment once however many dimensions disagree', () => {
    const rows = [
      rating('f1', 'd1', 'u1', 'Sí'), rating('f1', 'd1', 'u2', 'No'),
      rating('f1', 'd2', 'u1', 'Alto'), rating('f1', 'd2', 'u2', 'Bajo'),
      rating('f2', 'd1', 'u1', 'Sí'), rating('f2', 'd1', 'u2', 'Sí'),
    ];
    const r = computeDiscrepancies(rows);
    expect(r.comparableFragments).toBe(2);
    expect(r.discrepantFragments).toBe(1);
    // Rating level counts each (fragment, dimension) pair separately.
    expect(r.comparableRatings).toBe(3);
    expect(r.disagreedRatings).toBe(2);
    expect(r.ratingPct).toBeCloseTo(2 / 3);
  });

  it('treats a skip as a category, so skip-vs-answer is a disagreement', () => {
    const rows = [
      rating('f1', 'd1', 'u1', null, true),
      rating('f1', 'd1', 'u2', 'Sí'),
    ];
    const r = computeDiscrepancies(rows);
    expect(r.disagreedRatings).toBe(1);
  });

  it('agrees when both annotators skipped', () => {
    const rows = [
      rating('f1', 'd1', 'u1', null, true),
      rating('f1', 'd1', 'u2', null, true),
    ];
    expect(computeDiscrepancies(rows).disagreedRatings).toBe(0);
  });

  it('excludes the dimensions it is told to ignore', () => {
    const rows = [
      rating('f1', 'free', 'u1', 'una nota'), rating('f1', 'free', 'u2', 'otra nota'),
      rating('f1', 'd1', 'u1', 'Sí'), rating('f1', 'd1', 'u2', 'Sí'),
    ];
    const r = computeDiscrepancies(rows, new Set(['free']));
    expect(r.disagreedRatings).toBe(0);
    expect(r.comparableRatings).toBe(1);
  });

  it('ignores ratings made by a single annotator', () => {
    const r = computeDiscrepancies([rating('f1', 'd1', 'u1', 'Sí')]);
    expect(r.comparableFragments).toBe(0);
    expect(r.overallKappa).toBeNull();
  });
});

describe('meanKappa', () => {
  it('weights each dimension by how many items it was measured on', () => {
    const k = meanKappa([
      { dimensionId: 'a', disagreed: 0, comparable: 90, pct: 0, kappa: 1 },
      { dimensionId: 'b', disagreed: 5, comparable: 10, pct: 0.5, kappa: 0 },
    ]);
    expect(k).toBeCloseTo(0.9);
  });

  it('stays below the best dimension when others disagree more', () => {
    // Guards the bug this replaced: pooling every dimension into one kappa
    // reported near-perfect agreement while individual dimensions were poor.
    const k = meanKappa([
      { dimensionId: 'a', disagreed: 0, comparable: 50, pct: 0, kappa: 0.82 },
      { dimensionId: 'b', disagreed: 20, comparable: 50, pct: 0.4, kappa: 0.30 },
    ])!;
    expect(k).toBeLessThan(0.82);
    expect(k).toBeCloseTo(0.56);
  });
});
