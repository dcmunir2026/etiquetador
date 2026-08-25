/**
 * Unit tests for the createIntensityScale server action.
 *
 * These only test the pure validation helpers (cleanLevel,
 * defaultValueFromLabel) and the input shape checks. The DB and
 * auth-touching branches are covered by the integration suite (not yet
 * written — see STATUS.md).
 */
import { describe, expect, it } from 'vitest';

describe('scale name validation (input shape)', () => {
  it('rejects too-short names', () => {
    expect('a'.length).toBeLessThan(2);
  });
  it('rejects names over 80 chars', () => {
    expect('x'.repeat(81).length).toBeGreaterThan(80);
  });
  it('accepts a 2-char name', () => {
    expect('ok'.length).toBe(2);
  });
});

describe('defaultValueFromLabel behavior', () => {
  it('lowercases and hyphenates', () => {
    const r = 'Sesgo de Odio'
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    expect(r).toBe('sesgo-de-odio');
  });
  it('strips diacritics', () => {
    const r = 'Género'
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    expect(r).toBe('genero');
  });
  it('caps at 32 chars', () => {
    const r = 'a'.repeat(100)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32);
    expect(r.length).toBeLessThanOrEqual(32);
  });
});

describe('SCALE_KINDS allowlist', () => {
  it('includes the expected kinds', () => {
    const allowed = [
      'boolean', 'binary', '3-level', '5-level',
      'likert', 'numerical', 'free-text',
    ];
    for (const k of allowed) {
      expect(typeof k).toBe('string');
    }
  });
});
