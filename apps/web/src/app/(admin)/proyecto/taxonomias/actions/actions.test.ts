import { describe, expect, it } from 'vitest';
import {
  AddProjectTaxonomyInput,
  RemoveProjectTaxonomyInput,
  SetProjectTaxonomiesInput,
} from './schemas';

describe('AddProjectTaxonomyInput', () => {
  it('acepta un par válido', () => {
    const r = AddProjectTaxonomyInput.safeParse({
      projectId: 't_proj',
      taxonomyId: 't_tx',
    });
    expect(r.success).toBe(true);
  });
  it('rechaza projectId vacío', () => {
    const r = AddProjectTaxonomyInput.safeParse({
      projectId: '',
      taxonomyId: 't_tx',
    });
    expect(r.success).toBe(false);
  });
  it('rechaza taxonomyId vacío', () => {
    const r = AddProjectTaxonomyInput.safeParse({
      projectId: 't_proj',
      taxonomyId: '',
    });
    expect(r.success).toBe(false);
  });
  it('rechaza falta de campos', () => {
    const r = AddProjectTaxonomyInput.safeParse({});
    expect(r.success).toBe(false);
  });
});

describe('RemoveProjectTaxonomyInput', () => {
  it('acepta un par válido', () => {
    const r = RemoveProjectTaxonomyInput.safeParse({
      projectId: 't_proj',
      taxonomyId: 't_tx',
    });
    expect(r.success).toBe(true);
  });
  it('rechaza falta de campos', () => {
    const r = RemoveProjectTaxonomyInput.safeParse({ projectId: 't_proj' });
    expect(r.success).toBe(false);
  });
});

describe('SetProjectTaxonomiesInput', () => {
  it('acepta un set con varios ids', () => {
    const r = SetProjectTaxonomiesInput.safeParse({
      projectId: 't_proj',
      taxonomyIds: ['t_a', 't_b', 't_c'],
    });
    expect(r.success).toBe(true);
  });
  it('acepta un set vacío (limpieza)', () => {
    const r = SetProjectTaxonomiesInput.safeParse({
      projectId: 't_proj',
      taxonomyIds: [],
    });
    expect(r.success).toBe(true);
  });
  it('rechaza más de 50 ids', () => {
    const r = SetProjectTaxonomiesInput.safeParse({
      projectId: 't_proj',
      taxonomyIds: Array.from({ length: 51 }, (_, i) => `t_${i}`),
    });
    expect(r.success).toBe(false);
  });
  it('rechaza ids vacíos', () => {
    const r = SetProjectTaxonomiesInput.safeParse({
      projectId: 't_proj',
      taxonomyIds: ['t_a', ''],
    });
    expect(r.success).toBe(false);
  });
});
