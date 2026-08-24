import { describe, expect, it } from 'vitest';
import { dedupeSlug, slugify } from './slug';

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('EpData 2026-Q3')).toBe('epdata-2026-q3');
  });
  it('strips diacritics', () => {
    expect(slugify('Sesgo de Odio')).toBe('sesgo-de-odio');
    expect(slugify('Género')).toBe('genero');
  });
  it('replaces punctuation with hyphens', () => {
    expect(slugify('Hola, ¿qué tal?')).toBe('hola-que-tal');
  });
  it('trims leading/trailing hyphens', () => {
    expect(slugify('___test___')).toBe('test');
  });
  it('caps length at 80 chars', () => {
    const long = 'a'.repeat(200);
    expect(slugify(long).length).toBeLessThanOrEqual(80);
  });
  it('returns empty string for pure-punctuation input', () => {
    expect(slugify('!!!')).toBe('');
  });
});

describe('dedupeSlug', () => {
  it('returns base when not taken', () => {
    expect(dedupeSlug('epdata-q3', new Set())).toBe('epdata-q3');
    expect(dedupeSlug('epdata-q3', new Set(['other']))).toBe('epdata-q3');
  });
  it('appends -2 when base is taken', () => {
    expect(dedupeSlug('epdata-q3', new Set(['epdata-q3']))).toBe('epdata-q3-2');
  });
  it('keeps incrementing until free', () => {
    expect(dedupeSlug('a', new Set(['a', 'a-2', 'a-3']))).toBe('a-4');
  });
});
