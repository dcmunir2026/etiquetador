/**
 * Unit tests for the dimension CRUD Zod schemas (pure, no DB / next-auth).
 */
import { describe, expect, it } from 'vitest';
import { ArchiveDimensionInput, CreateDimensionInput, UpdateDimensionInput, autoSlug } from './schemas';

describe('autoSlug', () => {
  it('lowercases and hyphenates', () => {
    expect(autoSlug('Sesgo de Odio')).toBe('sesgo-de-odio');
  });
  it('strips diacritics', () => {
    expect(autoSlug('Género')).toBe('genero');
  });
  it('caps length', () => {
    expect(autoSlug('a'.repeat(200)).length).toBeLessThanOrEqual(80);
  });
});

describe('CreateDimensionInput', () => {
  const base = {
    name: 'Sesgo de odio',
    kind: 'category' as const,
    scaleId: 'scale_abc',
    color: 'tk-odio',
  };

  it('accepts a minimal valid dimension', () => {
    const r = CreateDimensionInput.safeParse(base);
    expect(r.success).toBe(true);
  });
  it('accepts an explicit slug', () => {
    const r = CreateDimensionInput.safeParse({ ...base, slug: 'my-custom-slug' });
    expect(r.success).toBe(true);
  });
  it('rejects an invalid slug (uppercase)', () => {
    const r = CreateDimensionInput.safeParse({ ...base, slug: 'My-Slug' });
    expect(r.success).toBe(false);
  });
  it('rejects an invalid color (not tk-*)', () => {
    const r = CreateDimensionInput.safeParse({ ...base, color: 'red-500' });
    expect(r.success).toBe(false);
  });
  it('rejects an invalid kind', () => {
    const r = CreateDimensionInput.safeParse({ ...base, kind: 'mystery' });
    expect(r.success).toBe(false);
  });
  it('rejects too-short names', () => {
    const r = CreateDimensionInput.safeParse({ ...base, name: 'a' });
    expect(r.success).toBe(false);
  });
  it('rejects empty scaleId', () => {
    const r = CreateDimensionInput.safeParse({ ...base, scaleId: '' });
    expect(r.success).toBe(false);
  });
  it('treats empty shortDescription as undefined', () => {
    const r = CreateDimensionInput.safeParse({ ...base, shortDescription: '' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.shortDescription).toBeUndefined();
  });
  it('trims whitespace on names', () => {
    const r = CreateDimensionInput.safeParse({ ...base, name: '  Foo  ' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.name).toBe('Foo');
  });
});

describe('UpdateDimensionInput', () => {
  it('requires an id', () => {
    const r = UpdateDimensionInput.safeParse({
      name: 'Foo', kind: 'category', scaleId: 's', color: 'tk-x',
    });
    expect(r.success).toBe(false);
  });
  it('accepts a valid update', () => {
    const r = UpdateDimensionInput.safeParse({
      id: 'd_abc', name: 'Foo', kind: 'category', scaleId: 's', color: 'tk-x',
    });
    expect(r.success).toBe(true);
  });
});

describe('ArchiveDimensionInput', () => {
  it('requires an id', () => {
    expect(ArchiveDimensionInput.safeParse({}).success).toBe(false);
    expect(ArchiveDimensionInput.safeParse({ id: 'd_abc' }).success).toBe(true);
  });
});
