import { describe, expect, it } from 'vitest';
import {
  buildTeamComparison, labelText, ownLabel, peerLabel,
  type ComparisonRow,
} from '../teamComparison';

function row(over: Partial<ComparisonRow> & { dimensionId: string }): ComparisonRow {
  return {
    userId: over.userId ?? 'u2',
    name: over.name ?? 'Daniel Romero',
    color: over.color ?? '#3b6cb0',
    value: over.value ?? null,
    skipped: over.skipped ?? false,
    dimensionId: over.dimensionId,
  };
}

describe('comparación con el equipo', () => {
  it('si todos coinciden no dice nada', () => {
    const out = buildTeamComparison({
      peers: [row({ dimensionId: 'd1', value: 'Sí' })],
      mine: [row({ dimensionId: 'd1', userId: 'u1', value: 'Sí' })],
    });
    expect(out).toEqual([]);
  });

  it('señala la pregunta en la que discrepo del equipo', () => {
    const out = buildTeamComparison({
      peers: [row({ dimensionId: 'd1', value: 'No' })],
      mine: [row({ dimensionId: 'd1', userId: 'u1', value: 'Sí' })],
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.dimensionId).toBe('d1');
    expect(out[0]!.discrepant).toBe(true);
    expect(out[0]!.mine).toBe('Sí');
    expect(out[0]!.peers[0]!.value).toBe('No');
    expect(ownLabel(out[0]!)).toEqual({ text: 'Sí', kind: 'value' });
    expect(peerLabel(out[0]!.peers[0]!)).toEqual({ text: 'No', kind: 'value' });
  });

  it('también la señala cuando el equipo discrepa entre sí y yo aún no he etiquetado', () => {
    const out = buildTeamComparison({
      peers: [
        row({ dimensionId: 'd1', userId: 'u2', value: 'Sí' }),
        row({ dimensionId: 'd1', userId: 'u3', name: 'Augusto Salazar', value: 'No' }),
      ],
      mine: [],
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.mineMissing).toBe(true);
    expect(ownLabel(out[0]!)).toEqual({ text: 'sin etiquetar', kind: 'missing' });
    expect(out[0]!.peers).toHaveLength(2);
  });

  it('un salto cuenta como respuesta distinta', () => {
    // A un compañero la pregunta le quedó oculta (su padre dio otro
    // valor): no es lo mismo que responder.
    const out = buildTeamComparison({
      peers: [row({ dimensionId: 'd1', userId: 'u2', skipped: true, value: null })],
      mine: [row({ dimensionId: 'd1', userId: 'u1', value: 'Incívico' })],
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.peers[0]!.skipped).toBe(true);
    expect(peerLabel(out[0]!.peers[0]!)).toEqual({ text: 'la saltó', kind: 'skipped' });
  });

  it('un compañero que todavía no ha contestado no genera discrepancia', () => {
    const out = buildTeamComparison({
      peers: [row({ dimensionId: 'd1', userId: 'u2', value: null, skipped: false })],
      mine: [row({ dimensionId: 'd1', userId: 'u1', value: 'Sí' })],
    });
    expect(out).toEqual([]);
  });

  it('devuelve una entrada por cada dimensión discrepante', () => {
    const out = buildTeamComparison({
      peers: [
        row({ dimensionId: 'd1', value: 'No' }),
        row({ dimensionId: 'd2', value: 'Igual' }),
        row({ dimensionId: 'd3', value: 'X' }),
      ],
      mine: [
        row({ dimensionId: 'd1', userId: 'u1', value: 'Sí' }),
        row({ dimensionId: 'd2', userId: 'u1', value: 'Igual' }),
        row({ dimensionId: 'd3', userId: 'u1', value: 'Y' }),
      ],
    });
    expect(out.map((c) => c.dimensionId).sort()).toEqual(['d1', 'd3']);
  });
});

describe('las etiquetas en pantalla', () => {
  it('la etiqueta de verdad va entrecomillada; las ausencias, tal cual', () => {
    expect(labelText({ text: 'Sí', kind: 'value' })).toBe('«Sí»');
    expect(labelText({ text: 'la saltó', kind: 'skipped' })).toBe('la saltó');
    expect(labelText({ text: 'sin responder', kind: 'missing' })).toBe('sin responder');
  });
});
