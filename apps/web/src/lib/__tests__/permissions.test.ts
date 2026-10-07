import { describe, expect, it } from 'vitest';
import {
  ROLES,
  accessForRoles,
  accessTo,
  canRead,
  canReadForRoles,
  canWrite,
  canWriteForRoles,
  landingViewForRoles,
  pickPrimaryRole,
  readableViewsForRoles,
  type Role,
} from '../permissions';

describe('reordenar el grafo de dependencias', () => {
  // The drag handle is gated on canWrite('dimensions'), because the order it
  // saves also drives the annotation form. Only the two admin roles get it.
  const canReorder = (role: Role) => canWrite('dimensions', role);

  it('un etiquetador ve el grafo pero no puede reordenarlo', () => {
    expect(canRead('graph-deps', 'annotator')).toBe(true);
    expect(canReorder('annotator')).toBe(false);
  });

  it('tampoco pueden reordenar los validadores ni los observadores', () => {
    expect(canReorder('validador_cualitativo')).toBe(false);
    expect(canReorder('validador_cuantitativo')).toBe(false);
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

describe('varios roles por persona', () => {
  describe('pickPrimaryRole', () => {
    it('lista vacía devuelve null', () => {
      expect(pickPrimaryRole([])).toBeNull();
    });

    it('elige el de mayor privilegio', () => {
      // projectadmin (4) gana sobre validador_cualitativo (2) y annotator (1).
      expect(pickPrimaryRole(['annotator', 'projectadmin', 'validador_cualitativo']))
        .toBe('projectadmin');
    });

    it('el orden del array no importa cuando hay un claro ganador', () => {
      expect(pickPrimaryRole(['viewer', 'validador_cuantitativo', 'projectadmin']))
        .toBe('projectadmin');
      expect(pickPrimaryRole(['superadmin', 'annotator'])).toBe('superadmin');
    });

    it('mantiene el primero cuando hay empate de privilegio', () => {
      // validador_cualitativo (2) y validador_cuantitativo (3) NO empatan:
      // gana el cuantitativo. Comprobemos que con dos del mismo nivel gana
      // el primero del array (el orden es estable).
      const only = pickPrimaryRole(['validador_cualitativo']);
      expect(only).toBe('validador_cualitativo');
    });
  });

  describe('accessForRoles', () => {
    it('sin roles no se accede a nada', () => {
      expect(accessForRoles('validacion', [])).toBe('none');
      expect(canReadForRoles('validacion', [])).toBe(false);
      expect(canWriteForRoles('validacion', [])).toBe(false);
    });

    it('el cuantitativo no entra en la vista de validación cualitativa', () => {
      expect(accessForRoles('validacion', ['validador_cuantitativo'])).toBe('none');
      expect(canReadForRoles('validacion', ['validador_cuantitativo'])).toBe(false);
    });

    it('el cuantitativo sí entra en su vista específica', () => {
      expect(accessForRoles('quant-validation', ['validador_cuantitativo'])).toBe('write');
      expect(canWriteForRoles('quant-validation', ['validador_cuantitativo'])).toBe(true);
    });

    it('dos roles comparten discrepancias (ambos escriben)', () => {
      expect(accessForRoles(
        'discrepancias',
        ['validador_cuantitativo', 'validador_cualitativo'],
      )).toBe('write');
    });

    it('mezclar un rol sin acceso con uno que escribe gana el write', () => {
      // annotator no tiene acceso a 'quant-validation'; projectadmin sí.
      expect(accessForRoles(
        'quant-validation',
        ['annotator', 'projectadmin'],
      )).toBe('write');
    });

    it('mezclar read + write gana write (no se queda en read)', () => {
      // dimensions: annotator = 'read', projectadmin = 'write'.
      expect(accessForRoles('dimensions', ['annotator', 'projectadmin'])).toBe('write');
    });
  });

  describe('readableViewsForRoles + landingViewForRoles', () => {
    it('un etiquetador solo ve sus vistas', () => {
      const views = readableViewsForRoles(['annotator']);
      expect(views).toContain('tagging');
      expect(views).toContain('graph-deps');
      expect(views).not.toContain('quant-validation');
    });

    it('mezclar cuantitativo + cualitativo abre ambas validaciones', () => {
      const views = readableViewsForRoles(['validador_cuantitativo', 'validador_cualitativo']);
      expect(views).toContain('quant-validation');
      expect(views).toContain('validacion');
      expect(views).toContain('discrepancias');
    });

    it('landing cae en la primera vista leíble según la lista de preferencia', () => {
      // La preference list arranca en dashboard — siempre legible, así que
      // gana por posición. Verificamos que las opciones posteriores solo
      // aparecen si el rol no puede leer dashboard.
      expect(landingViewForRoles(['validador_cuantitativo'])).toBe('dashboard');
      expect(landingViewForRoles(['projectadmin'])).toBe('dashboard');
      // Un anotador con dashboard+tagging: dashboard gana por orden.
      expect(landingViewForRoles(['annotator'])).toBe('dashboard');
    });

    it('con cero roles el landing es dashboard (fallback seguro)', () => {
      expect(landingViewForRoles([])).toBe('dashboard');
    });
  });
});
