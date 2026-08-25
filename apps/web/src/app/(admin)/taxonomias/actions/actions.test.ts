import { describe, expect, it } from 'vitest';
import {
  AddDimensionToTaxonomyInput,
  ArchiveTaxonomyInput,
  CreateTaxonomyInput,
  RemoveDimensionFromTaxonomyInput,
  TAXONOMY_COLOR_OPTIONS,
  UpdateTaxonomyInput,
  autoSlug,
} from './schemas';

describe('CreateTaxonomyInput', () => {
  const base = {
    name: 'Sesgo y toxicidad',
    shortDescription: 'Grupo de dimensiones relacionadas con sesgos.',
    longDescription: 'Descripción larga opcional.',
    color: 'cyan' as const,
  };

  it('acepta un payload mínimo válido', () => {
    const r = CreateTaxonomyInput.safeParse({ name: 'Sesgo', color: 'rose' });
    expect(r.success).toBe(true);
  });

  it('acepta el payload completo', () => {
    const r = CreateTaxonomyInput.safeParse(base);
    expect(r.success).toBe(true);
  });

  it('rechaza nombre demasiado corto', () => {
    const r = CreateTaxonomyInput.safeParse({ name: 'A', color: 'rose' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toContain('al menos 2 caracteres');
    }
  });

  it('rechaza nombre demasiado largo', () => {
    const r = CreateTaxonomyInput.safeParse({ name: 'x'.repeat(81), color: 'rose' });
    expect(r.success).toBe(false);
  });

  it('rechaza color inválido', () => {
    const r = CreateTaxonomyInput.safeParse({ name: 'OK', color: 'red' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toContain('Color no válido');
    }
  });

  it('coacciona string vacío a undefined en shortDescription', () => {
    const r = CreateTaxonomyInput.safeParse({ ...base, shortDescription: '' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.shortDescription).toBeUndefined();
    }
  });

  it('rechaza shortDescription > 160 chars', () => {
    const r = CreateTaxonomyInput.safeParse({ ...base, shortDescription: 'x'.repeat(161) });
    expect(r.success).toBe(false);
  });

  it('rechaza longDescription > 2000 chars', () => {
    const r = CreateTaxonomyInput.safeParse({ ...base, longDescription: 'x'.repeat(2001) });
    expect(r.success).toBe(false);
  });

  it('los 4 colores del enum son los esperados', () => {
    expect(TAXONOMY_COLOR_OPTIONS.map((c) => c.id)).toEqual(['rose', 'amber', 'cyan', 'violet']);
  });
});

describe('UpdateTaxonomyInput', () => {
  it('requiere id además de los campos del base', () => {
    const r = UpdateTaxonomyInput.safeParse({ name: 'OK', color: 'rose' });
    expect(r.success).toBe(false);
  });

  it('acepta id + payload válido', () => {
    const r = UpdateTaxonomyInput.safeParse({
      id: 't_abc',
      name: 'Sesgo',
      color: 'amber',
    });
    expect(r.success).toBe(true);
  });

  it('rechaza id vacío', () => {
    const r = UpdateTaxonomyInput.safeParse({ id: '', name: 'OK', color: 'rose' });
    expect(r.success).toBe(false);
  });
});

describe('ArchiveTaxonomyInput', () => {
  it('acepta un id', () => {
    const r = ArchiveTaxonomyInput.safeParse({ id: 't_abc' });
    expect(r.success).toBe(true);
  });
  it('rechaza id vacío', () => {
    const r = ArchiveTaxonomyInput.safeParse({ id: '' });
    expect(r.success).toBe(false);
  });
});

describe('AddDimensionToTaxonomyInput / RemoveDimensionFromTaxonomyInput', () => {
  it('add requiere taxonomyId y dimensionId', () => {
    const r = AddDimensionToTaxonomyInput.safeParse({});
    expect(r.success).toBe(false);
  });
  it('add acepta un par válido', () => {
    const r = AddDimensionToTaxonomyInput.safeParse({
      taxonomyId: 't_tx',
      dimensionId: 't_dim',
    });
    expect(r.success).toBe(true);
  });
  it('remove requiere ambos ids', () => {
    const r = RemoveDimensionFromTaxonomyInput.safeParse({ taxonomyId: 't_tx' });
    expect(r.success).toBe(false);
  });
});

describe('autoSlug', () => {
  it('normaliza acentos y espacios', () => {
    expect(autoSlug('Sesgo de Odio')).toBe('sesgo-de-odio');
  });
  it('elimina caracteres no alfanuméricos', () => {
    expect(autoSlug('Toxicidad & Emotividad!')).toBe('toxicidad-emotividad');
  });
  it('recorta a 80 chars', () => {
    const long = 'a'.repeat(100);
    expect(autoSlug(long).length).toBe(80);
  });
  it('devuelve string vacío para string vacío', () => {
    expect(autoSlug('')).toBe('');
  });
});
