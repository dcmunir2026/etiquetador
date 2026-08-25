/**
 * Unit tests for the dimension CRUD Zod schemas (pure, no DB / next-auth).
 */
import { describe, expect, it } from 'vitest';
import { ArchiveDimensionInput, CreateDimensionInput, UpdateDimensionInput, autoSlug } from './schemas';

const SAMPLE_VALUE = {
  label: 'Bajo',
  value: 'low',
  color: '#1c6e3a',
  order: 0,
};

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
    customValues: [SAMPLE_VALUE],
  };

  it('accepts a minimal valid dimension', () => {
    const r = CreateDimensionInput.safeParse(base);
    expect(r.success).toBe(true);
  });
  it('accepts an explicit null scaleId (custom text-only)', () => {
    const r = CreateDimensionInput.safeParse({ ...base, scaleId: null });
    expect(r.success).toBe(true);
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
  it('rejects empty customValues', () => {
    const r = CreateDimensionInput.safeParse({ ...base, customValues: [] });
    expect(r.success).toBe(false);
  });
  it('rejects too many customValues (>20)', () => {
    const many = Array.from({ length: 21 }, (_, i) => ({
      label: `v${i}`,
      value: `v${i}`,
      color: '#000000',
      order: i,
    }));
    const r = CreateDimensionInput.safeParse({ ...base, customValues: many });
    expect(r.success).toBe(false);
  });
  it('rejects customValues with an empty label', () => {
    const r = CreateDimensionInput.safeParse({
      ...base,
      customValues: [{ ...SAMPLE_VALUE, label: '' }],
    });
    expect(r.success).toBe(false);
  });
  it('rejects customValues with a non-hex color', () => {
    const r = CreateDimensionInput.safeParse({
      ...base,
      customValues: [{ ...SAMPLE_VALUE, color: 'red' }],
    });
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
  const base = {
    id: 'd_abc',
    name: 'Foo',
    kind: 'category' as const,
    scaleId: 's',
    color: 'tk-x',
    customValues: [SAMPLE_VALUE],
  };

  it('rejects when id is missing', () => {
    const { id: _omit, ...rest } = base;
    const r = UpdateDimensionInput.safeParse(rest);
    expect(r.success).toBe(false);
  });
  it('rejects when id is empty', () => {
    const r = UpdateDimensionInput.safeParse({ ...base, id: '' });
    expect(r.success).toBe(false);
  });
  it('accepts a valid update', () => {
    const r = UpdateDimensionInput.safeParse(base);
    expect(r.success).toBe(true);
  });
});

describe('ArchiveDimensionInput', () => {
  it('requires an id', () => {
    expect(ArchiveDimensionInput.safeParse({}).success).toBe(false);
    expect(ArchiveDimensionInput.safeParse({ id: 'd_abc' }).success).toBe(true);
  });
});
