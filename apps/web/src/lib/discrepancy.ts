/**
 * Reglas de la navegación "sólo discrepantes" de la pantalla de
 * etiquetado, en forma pura para poder testearlas sin base de datos.
 *
 * Contexto: cuando el supervisor devuelve un paquete, los anotadores
 * vuelven a él para corregir los fragmentos en los que discreparon. En
 * ese segundo turno no tiene sentido recorrer el corpus entero: lo que
 * queda por hacer son exactamente los fragmentos discrepantes.
 *
 * La regla se aplica al rol `annotator`:
 *  - un superadmin que abre /etiquetar lo hace para inspeccionar el
 *    flujo, no para hacer la ronda, así que conserva el interruptor;
 *  - quien no tiene el rol `annotator` en el proyecto (validador,
 *    observador, admin de proyecto) no ve el filtro forzado.
 *
 * Una persona puede reunir varios roles en un mismo proyecto
 * (`project_members` admite una fila por rol). Si además de `annotator`
 * tiene otro —típicamente `validador_cualitativo`—, sigue siendo
 * anotadora de este paquete, así que el filtro le aplica igual.
 */

/** Roles de proyecto. */
export type DiscrepancyRole =
  | 'projectadmin' | 'annotator' | 'validador_cualitativo'
  | 'validador_cuantitativo' | 'viewer';

export type DiscrepancyContext = {
  /** `users.is_super_admin` del usuario. */
  isSuperAdmin: boolean;
  /** Roles que tiene en el proyecto concreto. */
  roles: DiscrepancyRole[];
  /** `packages.return_count` del paquete. */
  returnCount: number;
  /** `packages.status` del paquete. */
  status: string | null;
  /** ¿El paquete pertenece a un equipo? Sin equipo no hay comparación. */
  hasTeam: boolean;
};

/**
 * ¿Este usuario debe trabajar exclusivamente sobre los fragmentos
 * discrepantes?
 */
export function mustWorkOnlyDiscrepant(ctx: DiscrepancyContext): boolean {
  // Los superadmins abren /etiquetar para inspeccionar el flujo; si se
  // les forzara el filtro no podrían revisar un fragmento cualquiera.
  if (ctx.isSuperAdmin) return false;
  if (!ctx.roles.includes('annotator')) return false;
  const wasReturned = ctx.returnCount > 0 || ctx.status === 'returned';
  if (!wasReturned) return false;
  // Un paquete devuelto sin equipo no se puede comparar con nadie: no
  // hay lista de discrepantes que forzar.
  return ctx.hasTeam;
}

export type DiscrepancyCounters = {
  /** Contador de la tarjeta de Navegación. */
  counter: string;
  /** Etiqueta de la tarjeta del fragmento activo. */
  badge: string;
};

/**
 * Los números que ve el anotador.
 *
 * Con el filtro de discrepantes activo, su trabajo son los fragmentos
 * discrepantes, no el paquete entero: mezclar "4 / 23" (total del
 * paquete) con "3/18" (posición en la lista) le hace creer que tiene 23
 * fragmentos que recorrer. Con el filtro activo se enseña sólo la lista
 * de discrepantes; si el fragmento no está en ella (se entró por URL
 * directa) se dice explícitamente.
 */
export function discrepancyCounters(input: {
  /** ¿La navegación está restringida a los discrepantes? */
  filterActive: boolean;
  /** ¿El fragmento actual está en la lista de discrepantes? */
  currentIsDiscrepant: boolean;
  /** Posición del fragmento dentro de la lista de discrepantes (0-based). */
  filteredIdx: number;
  /** Cuántos fragmentos discrepantes hay. */
  discrepantTotal: number;
  /** Posición del fragmento dentro del paquete (1-based). */
  position: number;
  /** Tamaño del paquete. */
  packageTotal: number;
}): DiscrepancyCounters {
  if (!input.filterActive) {
    const plain = `${input.position} / ${input.packageTotal}`;
    return { counter: plain, badge: `${input.position}/${input.packageTotal}` };
  }
  if (!input.currentIsDiscrepant) {
    return {
      counter: 'no discrepante',
      badge: `${input.position}/${input.packageTotal} · no discrepante`,
    };
  }
  const n = input.filteredIdx + 1;
  return {
    counter: `${n} / ${input.discrepantTotal}`,
    badge: `discrep. ${n}/${input.discrepantTotal}`,
  };
}
