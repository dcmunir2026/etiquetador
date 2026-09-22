import { describe, expect, it } from 'vitest';
import { segCount, segSlice, segTokenize, segment, type SegmentationParams } from '../segmentation';

const base: SegmentationParams = {
  unit: 'word', maxSize: 10, overlap: 0, respectBoundaries: false, tolerance: 0,
};

describe('segTokenize', () => {
  it('splits into words', () => {
    expect(segTokenize('uno dos  tres', 'word')).toEqual(['uno', 'dos', 'tres']);
  });

  it('splits into sentences, keeping terminators', () => {
    expect(segTokenize('Uno. Dos! ¿Tres?', 'sentence')).toEqual(['Uno.', 'Dos!', '¿Tres?']);
  });

  it('splits into paragraphs on blank lines', () => {
    expect(segTokenize('Uno\n\nDos', 'paragraph')).toEqual(['Uno', 'Dos']);
  });

  it('drops empty tokens around punctuation', () => {
    expect(segTokenize('hola, mundo', 'token')).not.toContain('');
  });
});

describe('segCount', () => {
  it('counts each unit', () => {
    expect(segCount('uno dos tres', 'word')).toBe(3);
    expect(segCount('Uno. Dos.', 'sentence')).toBe(2);
    expect(segCount('abc', 'character')).toBe(3);
  });
});

describe('segSlice', () => {
  const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i + 1}`);

  it('returns a single fragment when the text fits', () => {
    expect(segSlice(words(5), base)).toEqual(['w1 w2 w3 w4 w5']);
  });

  it('returns nothing for no input', () => {
    expect(segSlice([], base)).toEqual([]);
  });

  it('cuts into windows of the requested size', () => {
    const out = segSlice(words(25), base);
    expect(out).toHaveLength(3);
    expect(segCount(out[0]!, 'word')).toBe(10);
    expect(segCount(out[2]!, 'word')).toBe(5);
  });

  it('repeats the overlap between consecutive fragments', () => {
    const out = segSlice(words(20), { ...base, overlap: 3 });
    expect(out[0]!.split(' ').slice(-3)).toEqual(out[1]!.split(' ').slice(0, 3));
  });

  it('terminates even when the overlap is larger than the window', () => {
    // The mockup's cursor guard compared an index against a string length and
    // could stall here; the cursor must always move forward.
    const out = segSlice(words(40), { ...base, overlap: 99 });
    expect(out.length).toBeGreaterThan(0);
    expect(out.length).toBeLessThan(100);
  });

  it('covers the whole input with no overlap', () => {
    const out = segSlice(words(37), base);
    expect(out.join(' ').split(' ')).toHaveLength(37);
  });

  it('pulls the cut back to a sentence boundary when asked', () => {
    // A sentence ends at index 11; the window would otherwise cut at 15.
    const units = Array.from({ length: 20 }, (_, i) => (i === 11 ? 'fin.' : `w${i}`));
    const strict = segSlice(units, { ...base, maxSize: 15, respectBoundaries: false, tolerance: 0 });
    const boundary = segSlice(units, { ...base, maxSize: 15, respectBoundaries: true, tolerance: 50 });
    expect(strict[0]!.endsWith('w14')).toBe(true);
    expect(boundary[0]!.endsWith('fin.')).toBe(true);
  });

  it('never shrinks a fragment below the 10-unit floor to find a boundary', () => {
    // The only sentence end sits at index 1, far below the minimum size, so
    // the cut stays where the window put it.
    const units = Array.from({ length: 20 }, (_, i) => (i === 1 ? 'fin.' : `w${i}`));
    const out = segSlice(units, { ...base, maxSize: 15, respectBoundaries: true, tolerance: 90 });
    expect(segCount(out[0]!, 'word')).toBe(15);
  });

  it('joins characters without spaces', () => {
    const out = segSlice('abcdefghijkl'.split(''), { ...base, unit: 'character', maxSize: 5 });
    expect(out[0]).toBe('abcde');
  });
});

describe('segment', () => {
  it('summarises the fragments it produced', () => {
    const stats = segment(Array.from({ length: 25 }, (_, i) => `w${i}`).join(' '), base);
    expect(stats.count).toBe(3);
    expect(stats.max).toBe(10);
    expect(stats.min).toBe(5);
    expect(stats.avg).toBeGreaterThan(0);
  });

  it('reports zeroes for empty text', () => {
    const stats = segment('', base);
    expect(stats.count).toBe(0);
    expect(stats.avg).toBe(0);
  });
});
