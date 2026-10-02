import { describe, expect, it } from 'vitest';
import { isComplete, missingAnswers, type CascadeDimension } from '../cascade';

const bool = (id: string, name: string, dependency: CascadeDimension['dependency'] = null): CascadeDimension =>
  ({ id, name, kind: 'boolean', values: ['Sí', 'No'], dependency });

const odio = bool('odio', 'Sesgo de Odio');
const intensidad = bool('int', 'Intensidad', { parentId: 'odio', operator: '=', values: ['Sí'], label: 'Sesgo de Odio = Sí' });
const notas: CascadeDimension = { id: 'notas', name: 'Notas', kind: 'free-text', values: [], dependency: null };
const dims = [odio, intensidad, notas];

describe('missingAnswers', () => {
  it('pide las visibles sin responder', () => {
    expect(missingAnswers(dims, {}).map((d) => d.name)).toEqual(['Sesgo de Odio']);
  });

  it('no pide la hija mientras su puerta no se abre', () => {
    expect(missingAnswers(dims, { odio: 'No' })).toEqual([]);
    expect(isComplete(dims, { odio: 'No' })).toBe(true);
  });

  it('pide la hija en cuanto la puerta se abre', () => {
    expect(missingAnswers(dims, { odio: 'Sí' }).map((d) => d.name)).toEqual(['Intensidad']);
    expect(isComplete(dims, { odio: 'Sí' })).toBe(false);
    expect(isComplete(dims, { odio: 'Sí', int: 'Insulto' })).toBe(true);
  });

  it('el texto libre nunca bloquea: es opcional', () => {
    expect(missingAnswers([notas], {})).toEqual([]);
    expect(isComplete(dims, { odio: 'No' })).toBe(true);
  });

  it('una cadena en blanco no cuenta como respuesta', () => {
    expect(missingAnswers(dims, { odio: '   ' }).map((d) => d.name)).toEqual(['Sesgo de Odio']);
  });

  it('un fragmento sin tocar está incompleto', () => {
    expect(isComplete(dims, {})).toBe(false);
  });
});

describe('dependencia huérfana', () => {
  // The parent was archived or never reached the project through a taxonomy.
  const huerfana = bool('int', 'Intensidad', {
    parentId: 'no-esta-en-el-proyecto', operator: '=', values: ['Sí'], label: 'Sesgo de Odio = Sí',
  });

  it('se exige como raíz en vez de esperar un padre que no llegará', () => {
    expect(missingAnswers([huerfana], {}).map((d) => d.name)).toEqual(['Intensidad']);
    expect(isComplete([huerfana], {})).toBe(false);
    expect(isComplete([huerfana], { int: 'Insulto' })).toBe(true);
  });

  it('no deja pasar un paquete con su subárbol en blanco', () => {
    const nieta = bool('n', 'Nieta', { parentId: 'int', operator: '=', values: ['Insulto'], label: null });
    expect(isComplete([huerfana, nieta], {})).toBe(false);
    expect(isComplete([huerfana, nieta], { int: 'Insulto' })).toBe(false);
    expect(isComplete([huerfana, nieta], { int: 'Insulto', n: 'Sí' })).toBe(true);
  });
});
