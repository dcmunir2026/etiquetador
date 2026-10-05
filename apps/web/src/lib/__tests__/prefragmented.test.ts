import { describe, expect, it } from 'vitest';
import {
  csvLooksPrefragmented, groupPrefragmented, joinFragments,
  parsePrefragmented, parsePrefragmentedCsv, prefragmentedStats,
} from '../prefragmented';

const piece = (over: Record<string, unknown> = {}) => ({
  idGlobal: 0, id: 'banco__economia__a', indiceTurno: 0, indiceFragmento: 0,
  preguntaOriginal: '¿Cómo ha evolucionado el PIB?', fragmento: 'El PIB creció un 21,6%.',
  palabras: 5, spacyScore: 5, fusionado: false, respuestaHash: '0e7c8d81ade7', ...over,
});

const file = (fragmentos: unknown[], extra: Record<string, unknown> = {}) =>
  JSON.stringify({ algoritmo: { niveles: [] }, rubrica: { maximo: 5 }, fragmentos, ...extra });

describe('parsePrefragmented', () => {
  it('reads the full export shape', () => {
    const res = parsePrefragmented(file([piece(), piece({ idGlobal: 1, indiceFragmento: 1 })]));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.doc.pieces).toHaveLength(2);
    expect(res.doc.pieces[0]).toMatchObject({
      conversationId: 'banco__economia__a', turn: 0, index: 0, score: 5, merged: false,
      hash: '0e7c8d81ade7', question: '¿Cómo ha evolucionado el PIB?',
    });
    expect(res.doc.algoritmo).not.toBeNull();
    expect(res.doc.rubrica).not.toBeNull();
  });

  it('reads a bare array of fragments', () => {
    const res = parsePrefragmented(JSON.stringify([piece()]));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.doc.pieces).toHaveLength(1);
    expect(res.doc.algoritmo).toBeNull();
  });

  it('counts words itself when the file omits them', () => {
    const res = parsePrefragmented(JSON.stringify([piece({ palabras: undefined, fragmento: 'uno dos tres' })]));
    expect(res.ok && res.doc.pieces[0]!.words).toBe(3);
  });

  it('skips entries without text instead of failing', () => {
    const res = parsePrefragmented(file([piece(), { idGlobal: 1, fragmento: '   ' }, null]));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.doc.pieces).toHaveLength(1);
    expect(res.doc.skipped).toBe(2);
  });

  it('rejects invalid JSON, wrong shapes and empty files', () => {
    expect(parsePrefragmented('{nope')).toMatchObject({ ok: false });
    expect(parsePrefragmented('{"otra":[]}')).toMatchObject({ ok: false });
    expect(parsePrefragmented(file([]))).toMatchObject({ ok: false });
    expect(parsePrefragmented(file([{ idGlobal: 0 }]))).toMatchObject({ ok: false });
  });
});

describe('groupPrefragmented', () => {
  it('groups by answer hash and rebuilds the source text', () => {
    const res = parsePrefragmented(file([
      piece({ fragmento: 'Primera frase.' }),
      piece({ idGlobal: 1, indiceFragmento: 1, fragmento: 'Segunda frase.' }),
      piece({ idGlobal: 2, id: 'otra__b', respuestaHash: 'ffff', fragmento: 'Otra respuesta.' }),
    ]));
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const groups = groupPrefragmented(res.doc.pieces);
    expect(groups).toHaveLength(2);
    expect(groups[0]!.pieces).toHaveLength(2);
    expect(groups[0]!.sourceText).toBe('Primera frase. Segunda frase.');
    expect(groups[0]!.conversationId).toBe('banco__economia__a');
  });

  it('orders fragments by turn and index, not by file position', () => {
    const res = parsePrefragmented(file([
      piece({ indiceFragmento: 2, fragmento: 'C.' }),
      piece({ indiceFragmento: 0, fragmento: 'A.' }),
      piece({ indiceFragmento: 1, fragmento: 'B.' }),
    ]));
    if (!res.ok) throw new Error(res.error);
    expect(groupPrefragmented(res.doc.pieces)[0]!.sourceText).toBe('A. B. C.');
  });

  it('separates turns of the same conversation when there is no hash', () => {
    const res = parsePrefragmented(file([
      piece({ respuestaHash: undefined, indiceTurno: 0 }),
      piece({ respuestaHash: undefined, indiceTurno: 1 }),
    ]));
    if (!res.ok) throw new Error(res.error);
    expect(groupPrefragmented(res.doc.pieces)).toHaveLength(2);
  });
});

describe('prefragmentedStats', () => {
  it('summarises fragments, answers and duplicates', () => {
    // Two conversations carrying the identical answer: one collapses.
    const res = parsePrefragmented(file([
      piece({ fragmento: 'Una frase de cinco palabras.', spacyScore: 4 }),
      piece({ idGlobal: 1, id: 'copia__b', fusionado: true, spacyScore: 5,
              fragmento: 'Una frase de cinco palabras.' }),
    ]));
    if (!res.ok) throw new Error(res.error);

    const stats = prefragmentedStats(res.doc.pieces, groupPrefragmented(res.doc.pieces));
    expect(stats).toMatchObject({
      fragments: 2, answers: 1, duplicates: 1, splitAnswers: 1, merged: 1, avgScore: 4.5,
    });
  });
});

describe('joinFragments', () => {
  it('joins with a single space and respects existing newlines', () => {
    expect(joinFragments(['Uno.', 'Dos.'])).toBe('Uno. Dos.');
    expect(joinFragments(['Uno.\n', 'Dos.'])).toBe('Uno.\nDos.');
    expect(joinFragments([])).toBe('');
  });
});

describe('csvLooksPrefragmented', () => {
  it('detects the three required columns regardless of order', () => {
    expect(csvLooksPrefragmented(['pregunta', 'fragmento', 'fragmento_anterior', 'fragmento_posterior']))
      .toBe(true);
    expect(csvLooksPrefragmented(['id', 'fragmento_anterior', 'fragmento', 'posterior', 'pregunta']))
      .toBe(true);
  });

  it('rejects headers missing any of the three required columns', () => {
    expect(csvLooksPrefragmented(['pregunta', 'fragmento', 'fragmento_anterior'])).toBe(false);
    expect(csvLooksPrefragmented(['id', 'question', 'anterior', 'posterior'])).toBe(false);
  });
});

describe('parsePrefragmentedCsv', () => {
  const headers = ['pregunta', 'fragmento', 'fragmento_anterior', 'fragmento_posterior'];

  it('returns one piece per row with a stable per-row hash', () => {
    const res = parsePrefragmentedCsv(headers, [
      ['¿Qué es el PIB?', 'El PIB es el producto interno.', '', ''],
      ['¿Qué es el PIB?', 'Mide el valor de la producción.', 'El PIB es el producto interno.', ''],
    ]);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.doc.pieces).toHaveLength(2);
    expect(res.doc.pieces[0]).toMatchObject({
      text: 'El PIB es el producto interno.',
      question: '¿Qué es el PIB?',
      turn: 0,
      merged: false,
      score: null,
    });
    // The hash is derived from pregunta+fragmento, so each row has its own.
    expect(res.doc.pieces[0]!.hash).not.toBeNull();
    expect(res.doc.pieces[0]!.hash).not.toEqual(res.doc.pieces[1]!.hash);
    // Words counted from the response itself.
    expect(res.doc.pieces[0]!.words).toBe(6);
  });

  it('skips rows with empty fragments and reports the count', () => {
    const res = parsePrefragmentedCsv(headers, [
      ['Pregunta A', 'Texto válido.', '', ''],
      ['Pregunta B', '   ', '', ''],
      ['', '', '', ''],
    ]);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.doc.pieces).toHaveLength(1);
    expect(res.doc.skipped).toBe(2);
  });

  it('rejects when the fragmento column is missing', () => {
    const res = parsePrefragmentedCsv(
      ['id', 'question', 'anterior', 'posterior'],
      [['a', 'b', '', '']],
    );
    expect(res).toMatchObject({ ok: false });
  });

  it('rejects when every row is empty', () => {
    const res = parsePrefragmentedCsv(headers, [
      ['a', '   ', '', ''],
      ['b', '', '', ''],
    ]);
    expect(res).toMatchObject({ ok: false });
  });
});
