import { describe, expect, it } from 'vitest';
import {
  fragmentUrl, previewBaseUrl, previewUrlWithDiscrep,
  TAGGING_PATH, TAGGING_PREVIEW_PATH,
} from '../preview';

describe('direcciones de la pantalla de etiquetado', () => {
  it('la del anotador lleva sólo el fragmento', () => {
    expect(fragmentUrl(TAGGING_PATH, 5)).toBe('/etiquetar?fragment=5');
  });

  it('la del preview conserva persona y paquete al cambiar de fragmento', () => {
    const base = previewBaseUrl({ userId: 'u1', packageId: 'p1' });
    expect(base).toBe('/etiquetar-vista?user=u1&pkg=p1');
    expect(fragmentUrl(base, 3)).toBe('/etiquetar-vista?user=u1&pkg=p1&fragment=3');
  });

  it('acepta un ID de fragmento, no sólo una posición', () => {
    expect(fragmentUrl(TAGGING_PATH, 'ABC-456#2')).toBe('/etiquetar?fragment=ABC-456%232');
  });

  it('el filtro de discrepantes vive en la URL, porque tiene que sobrevivir a la navegación', () => {
    const base = previewBaseUrl({ userId: 'u1', packageId: 'p1', discrepOnly: true });
    expect(base).toContain('discrep=1');

    const off = previewUrlWithDiscrep(base, false);
    expect(off).not.toContain('discrep');
    // Quitar el filtro no puede borrar de quién y de qué paquete es la vista.
    expect(off).toContain('user=u1');
    expect(off).toContain('pkg=p1');

    expect(previewUrlWithDiscrep(off, true)).toContain('discrep=1');
  });

  it('sin persona no hay nada que enseñar', () => {
    expect(previewBaseUrl({ userId: null })).toBe(TAGGING_PREVIEW_PATH);
    expect(previewBaseUrl({ userId: null, packageId: 'p1' })).toBe('/etiquetar-vista?pkg=p1');
  });
});
