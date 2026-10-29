import { describe, expect, it } from 'vitest';
import {
  discrepancyCounters,
  mustWorkOnlyDiscrepant,
  type DiscrepancyContext,
} from '../discrepancy';

const ctx = (over: Partial<DiscrepancyContext> = {}): DiscrepancyContext => ({
  isSuperAdmin: false,
  roles: ['annotator'],
  returnCount: 1,
  status: 'returned',
  hasTeam: true,
  ...over,
});

describe('navegación forzada a los fragmentos discrepantes', () => {
  it('un anotador con un paquete devuelto trabaja sólo los discrepantes', () => {
    expect(mustWorkOnlyDiscrepant(ctx())).toBe(true);
  });

  it('el estado «returned» basta aunque el contador siga a cero', () => {
    expect(mustWorkOnlyDiscrepant(ctx({ returnCount: 0, status: 'returned' }))).toBe(true);
  });

  it('un paquete que nunca volvió no fuerza nada', () => {
    expect(mustWorkOnlyDiscrepant(ctx({ returnCount: 0, status: 'in_progress' }))).toBe(false);
    expect(mustWorkOnlyDiscrepant(ctx({ returnCount: 0, status: 'submitted' }))).toBe(false);
  });

  it('el superadmin conserva el interruptor aunque tenga el rol annotator', () => {
    expect(mustWorkOnlyDiscrepant(ctx({ isSuperAdmin: true }))).toBe(false);
  });

  it('los que no son anotadores no ven el filtro forzado', () => {
    for (const role of ['projectadmin', 'validador_cualitativo',
      'validador_cuantitativo', 'viewer'] as const) {
      expect(mustWorkOnlyDiscrepant(ctx({ roles: [role] }))).toBe(false);
    }
  });

  it('quien reúne varios roles sigue forzándose por el de anotador', () => {
    expect(mustWorkOnlyDiscrepant(ctx({
      roles: ['annotator', 'validador_cualitativo'],
    }))).toBe(true);
  });

  it('un paquete devuelto sin equipo no se puede comparar: no hay lista', () => {
    expect(mustWorkOnlyDiscrepant(ctx({ hasTeam: false }))).toBe(false);
  });

  it('sin roles en el proyecto no hay filtro forzado', () => {
    expect(mustWorkOnlyDiscrepant(ctx({ roles: [] }))).toBe(false);
  });
});

describe('los números que ve el anotador', () => {
  const base = {
    filterActive: true,
    currentIsDiscrepant: true,
    filteredIdx: 2,          // el 3º discrepante
    discrepantTotal: 18,
    position: 4,             // el 4º fragmento del paquete
    packageTotal: 23,
  };

  it('con el filtro activo sólo enseña la lista de discrepantes', () => {
    const out = discrepancyCounters(base);
    expect(out.counter).toBe('3 / 18');
    expect(out.badge).toBe('discrep. 3/18');
    // Nada del total del paquete: no es lo que tiene que recorrer.
    expect(out.counter).not.toContain('23');
    expect(out.badge).not.toContain('23');
  });

  it('sin filtro enseña la posición dentro del paquete', () => {
    const out = discrepancyCounters({ ...base, filterActive: false });
    expect(out.counter).toBe('4 / 23');
    expect(out.badge).toBe('4/23');
  });

  it('si el fragmento no es discrepante lo dice, sin inventar un número', () => {
    const out = discrepancyCounters({ ...base, currentIsDiscrepant: false });
    expect(out.counter).toBe('no discrepante');
    expect(out.badge).toContain('no discrepante');
  });
});
