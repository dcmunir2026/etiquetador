import { describe, expect, it } from 'vitest';
import { KNOWN_VIEWS, PATH_FROM_VIEW, VIEW_FROM_PATH, viewFromPath, REQUIRES_PROJECT } from '../views';
import { NAV_VIEW_IDS } from '@/components/Sidebar';

describe('routing table', () => {
  it('gives every sidebar entry a real path', () => {
    // Regression guard: the sidebar pushed paths like /dimensiones while the
    // app only served `/`, so every link but the dashboard answered 404.
    const missing = NAV_VIEW_IDS.filter((id) => !(id in PATH_FROM_VIEW));
    expect(missing).toEqual([]);
  });

  it('resolves each path back to its view', () => {
    for (const [path, view] of Object.entries(VIEW_FROM_PATH)) {
      expect(viewFromPath(path)).toBe(view);
    }
  });

  it('round-trips every view through its canonical path', () => {
    for (const view of KNOWN_VIEWS) {
      const path = PATH_FROM_VIEW[view];
      expect(path, `sin ruta para ${view}`).toBeDefined();
      expect(viewFromPath(path!)).toBe(view);
    }
  });

  it('ignores a trailing slash', () => {
    expect(viewFromPath('/dimensiones/')).toBe('taxonomies');
    expect(viewFromPath('/')).toBe('dashboard');
  });

  it('returns null for an unknown path, so it can 404', () => {
    expect(viewFromPath('/no-existe')).toBeNull();
    expect(viewFromPath('/proyecto')).toBeNull();
  });

  it('only gates views that actually exist', () => {
    for (const view of REQUIRES_PROJECT) expect(KNOWN_VIEWS.has(view)).toBe(true);
  });

  it('leaves the global catalogue and login ungated', () => {
    // Dimensions and taxonomies are global; login must stay reachable.
    expect(REQUIRES_PROJECT.has('taxonomies')).toBe(false);
    expect(REQUIRES_PROJECT.has('taxonomy-groups')).toBe(false);
    expect(REQUIRES_PROJECT.has('dashboard')).toBe(false);
    expect(REQUIRES_PROJECT.has('login')).toBe(false);
  });
});
