import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ComponentProps } from 'react';
import { TaggingEmptyState } from '../TaggingEmptyState';

type Props = ComponentProps<typeof TaggingEmptyState>;

const base: Props = {
  packageCode: 'PK-A-001',
  userName: 'Pedro Gómez',
  round: 3,
  saving: false,
  hasUnsavedAnswers: false,
  onSave: () => {},
  onResend: () => {},
};

const html = (over: Partial<Props> = {}) =>
  renderToStaticMarkup(<TaggingEmptyState {...base} {...over} />);

describe('estado vacío del anotador (paquete devuelto sin discrepantes)', () => {
  it('explica que no quedan fragmentos discrepantes', () => {
    const out = html();
    expect(out).toContain('No quedan fragmentos discrepantes');
    expect(out).toContain('PK-A-001');
    expect(out).toContain('Pedro Gómez');
  });

  it('ofrece el reenvío con la ronda en curso', () => {
    const out = html();
    expect(out).toContain('Reenviar paquete (ronda 3)');
    expect(out).toContain('data-testid="forced-empty"');
  });

  it('muestra el motivo de la devolución cuando el supervisor lo dejó escrito', () => {
    expect(html({ notes: 'Discrepancia del 60.9%' })).toContain('Discrepancia del 60.9%');
  });

  it('sólo ofrece «Guardar» si quedan respuestas sin guardar', () => {
    expect(html()).not.toContain('Guardar<');
    expect(html({ hasUnsavedAnswers: true })).toContain('Guardar');
  });

  it('muestra el error del reenvío cuando el servidor lo rechaza', () => {
    expect(html({ notice: 'Quedan 2 fragmentos sin etiquetar por completo.' }))
      .toContain('Quedan 2 fragmentos sin etiquetar por completo.');
  });
});
