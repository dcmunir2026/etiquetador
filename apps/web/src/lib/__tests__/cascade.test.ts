import { describe, expect, it } from 'vitest';
import {
  buildCascade, depthOf, flattenCascade, pruneAnswers, resolveVisibility, wouldCycle,
  type CascadeDimension,
} from '../cascade';

/** The mockup's hate-speech cascade, which this port has to reproduce. */
const HAY_ODIO: CascadeDimension = {
  id: 'hay-odio', name: '¿Hay odio?', kind: 'flag', values: ['Sí', 'No'], dependency: null,
};
const TIPO_ODIO: CascadeDimension = {
  id: 'tipo-odio', name: 'Tipo de odio', kind: 'category',
  values: ['Político', 'Religioso', 'Xenófobo'],
  dependency: { parentId: 'hay-odio', operator: '=', values: ['Sí'], label: '¿Hay odio? = Sí' },
};
const TIPO_RELIGION: CascadeDimension = {
  id: 'tipo-religion', name: 'Tipo de religión', kind: 'category',
  values: ['Antisemita', 'Antimusulmán'],
  dependency: { parentId: 'tipo-odio', operator: '=', values: ['Religioso'], label: 'Tipo de odio = Religioso' },
};
const SARCASMO: CascadeDimension = {
  id: 'sarcasmo', name: 'Sarcasmo', kind: 'flag', values: ['Sí', 'No'], dependency: null,
};
const DIMS = [HAY_ODIO, TIPO_ODIO, TIPO_RELIGION, SARCASMO];
const byId = new Map(DIMS.map((d) => [d.id, d]));

describe('resolveVisibility', () => {
  it('always shows a root dimension', () => {
    expect(resolveVisibility(HAY_ODIO, {}, byId)).toBe('visible');
  });

  it('waits on an unanswered parent rather than skipping', () => {
    expect(resolveVisibility(TIPO_ODIO, {}, byId)).toBe('pending-parent');
  });

  it('skips when the parent answer does not match', () => {
    expect(resolveVisibility(TIPO_ODIO, { 'hay-odio': 'No' }, byId)).toBe('skipped');
  });

  it('shows when the parent answer matches', () => {
    expect(resolveVisibility(TIPO_ODIO, { 'hay-odio': 'Sí' }, byId)).toBe('visible');
  });

  it('propagates a skip down the chain', () => {
    // Grandparent says No, so the grandchild is skipped even though its own
    // parent was never answered.
    expect(resolveVisibility(TIPO_RELIGION, { 'hay-odio': 'No' }, byId)).toBe('skipped');
  });

  it('reveals the grandchild only on the full matching path', () => {
    expect(resolveVisibility(TIPO_RELIGION, { 'hay-odio': 'Sí', 'tipo-odio': 'Religioso' }, byId)).toBe('visible');
    expect(resolveVisibility(TIPO_RELIGION, { 'hay-odio': 'Sí', 'tipo-odio': 'Político' }, byId)).toBe('skipped');
  });

  it('honours a negated rule', () => {
    const notNo: CascadeDimension = {
      ...TIPO_ODIO,
      dependency: { parentId: 'hay-odio', operator: '!=', values: ['No'], label: '≠ No' },
    };
    expect(resolveVisibility(notNo, { 'hay-odio': 'Sí' }, byId)).toBe('visible');
    expect(resolveVisibility(notNo, { 'hay-odio': 'No' }, byId)).toBe('skipped');
  });
});

describe('buildCascade', () => {
  it('nests each dimension under the one that gates it', () => {
    const tree = buildCascade(DIMS, { 'hay-odio': 'Sí', 'tipo-odio': 'Religioso' });
    expect(tree.map((n) => n.dim.id)).toEqual(['hay-odio', 'sarcasmo']);
    const odio = tree[0]!;
    expect(odio.children.map((c) => c.dim.id)).toEqual(['tipo-odio']);
    expect(odio.children[0]!.children.map((c) => c.dim.id)).toEqual(['tipo-religion']);
  });

  it('indents by depth so parents render above their children', () => {
    const flat = flattenCascade(buildCascade(DIMS, {}));
    expect(flat.map((n) => [n.dim.id, n.depth])).toEqual([
      ['hay-odio', 0], ['tipo-odio', 1], ['tipo-religion', 2], ['sarcasmo', 0],
    ]);
  });

  it('treats a dimension whose parent is absent as a root', () => {
    const orphan = buildCascade([TIPO_ODIO], {});
    expect(orphan).toHaveLength(1);
    expect(orphan[0]!.dim.id).toBe('tipo-odio');
  });
});

describe('pruneAnswers', () => {
  it('drops answers that the cascade no longer asks for', () => {
    const answers = { 'hay-odio': 'Sí', 'tipo-odio': 'Religioso', 'tipo-religion': 'Antisemita' };
    // The annotator changes their mind: there is no hate after all.
    const pruned = pruneAnswers(DIMS, { ...answers, 'hay-odio': 'No' });
    expect(pruned['tipo-odio']).toBeUndefined();
    expect(pruned['tipo-religion']).toBeUndefined();
    expect(pruned['hay-odio']).toBe('No');
  });

  it('prunes a grandchild when only the middle answer changes', () => {
    const pruned = pruneAnswers(DIMS, {
      'hay-odio': 'Sí', 'tipo-odio': 'Político', 'tipo-religion': 'Antisemita',
    });
    expect(pruned['tipo-religion']).toBeUndefined();
    expect(pruned['tipo-odio']).toBe('Político');
  });

  it('leaves a still-valid branch untouched', () => {
    const answers = { 'hay-odio': 'Sí', 'tipo-odio': 'Religioso', 'tipo-religion': 'Antisemita' };
    expect(pruneAnswers(DIMS, answers)).toEqual(answers);
  });
});

describe('depthOf and wouldCycle', () => {
  it('measures the chain length', () => {
    expect(depthOf(HAY_ODIO, byId)).toBe(0);
    expect(depthOf(TIPO_ODIO, byId)).toBe(1);
    expect(depthOf(TIPO_RELIGION, byId)).toBe(2);
  });

  it('rejects self-dependency and loops', () => {
    expect(wouldCycle('hay-odio', 'hay-odio', DIMS)).toBe(true);
    // hay-odio → tipo-odio would close the existing tipo-odio → hay-odio edge.
    expect(wouldCycle('hay-odio', 'tipo-odio', DIMS)).toBe(true);
    expect(wouldCycle('hay-odio', 'tipo-religion', DIMS)).toBe(true);
  });

  it('allows an edge that introduces no loop', () => {
    expect(wouldCycle('sarcasmo', 'hay-odio', DIMS)).toBe(false);
  });
});
