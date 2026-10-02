import { describe, expect, it } from 'vitest';
import { ROLES, accessTo, canRead, canWrite, type Role } from '../permissions';

describe('reordenar el grafo de dependencias', () => {
  // The drag handle is gated on canWrite('dimensions'), because the order it
  // saves also drives the annotation form. Only the two admin roles get it.
  const canReorder = (role: Role) => canWrite('dimensions', role);

  it('un etiquetador ve el grafo pero no puede reordenarlo', () => {
    expect(canRead('graph-deps', 'annotator')).toBe(true);
    expect(canReorder('annotator')).toBe(false);
  });

  it('tampoco pueden reordenar validadores ni observadores', () => {
    expect(canReorder('validator')).toBe(false);
    expect(canReorder('viewer')).toBe(false);
  });

  it('solo administran el orden superadmin y admin de proyecto', () => {
    expect(ROLES.filter(canReorder)).toEqual(['superadmin', 'projectadmin']);
  });

  it('sin rol no se reordena', () => {
    expect(canWrite('dimensions', null)).toBe(false);
    expect(accessTo('dimensions', null)).toBe('none');
  });
});
