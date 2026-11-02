/**
 * Comparación de un fragmento con el resto del equipo: dónde discrepáis
 * y en qué.
 *
 * Cuando el supervisor devuelve un paquete, los anotadores vuelven a él
 * para corregir las discrepancias. El problema de esa segunda ronda es
 * que el fragmento se ve igual que en la primera: el anotador no sabe
 * qué pregunta se discutió ni qué contestó cada compañero. Aquí se
 * calcula, para un fragmento, qué dimensiones no tienen acuerdo y qué
 * respondió cada persona.
 *
 * Dos reglas importan:
 *
 *  - **Sólo se compara cuando el paquete ha vuelto.** En la primera ronda
 *    la doble anotación es ciega a propósito: ver al otro sesga la
 *    etiqueta. Mostrar las respuestas del equipo sólo tiene sentido
 *    cuando ya se han comparado y hay que resolver el desacuerdo.
 *
 *  - **Un salto es una respuesta.** Si a un compañero la pregunta le
 *    quedó oculta (su padre dio otro valor) y a ti no, eso también es
 *    una discrepancia: la etiqueta no es comparable y por eso hay que
 *    revisarla. Por eso «saltó» cuenta como un valor distinto.
 */

/** Lo que un compañero respondió en una dimensión. */
export type PeerAnswer = {
  userId: string;
  name: string;
  color: string | null;
  /** La etiqueta que eligió; null si saltó la pregunta. */
  value: string | null;
  /** True cuando la pregunta le quedó oculta (salto explícito). */
  skipped: boolean;
  /** True cuando no hay respuesta suya: aún no ha etiquetado esto. */
  missing: boolean;
};

/** La comparación de una dimensión. */
export type DimensionComparison = {
  dimensionId: string;
  /** Qué respondió cada compañero del equipo. */
  peers: PeerAnswer[];
  /** Qué respondió la persona a la que se está ayudando. */
  mine: string | null;
  /** True cuando esa persona saltó la dimensión. */
  mineSkipped: boolean;
  /** True cuando esa persona todavía no ha etiquetado esta dimensión. */
  mineMissing: boolean;
  /** True cuando el equipo no se pone de acuerdo en esta dimensión. */
  discrepant: boolean;
};

/** Fila cruda de anotación, tal como sale de la base de datos. */
export type ComparisonRow = {
  userId: string;
  name: string;
  color: string | null;
  dimensionId: string;
  value: string | null;
  skipped: boolean;
};

/**
 * La clave con la que se compara una respuesta.
 *
 * Saltar y no haber contestado son cosas distintas: «saltó» es una
 * decisión (la pregunta no aplicaba) y se compara con la etiqueta de
 * cualquiera; «no ha contestado» es una ausencia y no cuenta como
 * desacuerdo por sí sola.
 */
function answerKey(value: string | null, skipped: boolean): string {
  return skipped ? '—saltó—' : (value ?? '');
}

/**
 * Compara las respuestas de un equipo en un fragmento.
 *
 * `peers` son los compañeros (sin la persona a la que se ayuda) y `mine`
 * sus respuestas. Devuelve **sólo las dimensiones con desacuerdo**: el
 * resto se omite, porque AGREEMENT no es información — es ruido.
 */
export function buildTeamComparison(input: {
  peers: ComparisonRow[];
  mine: ComparisonRow[];
}): DimensionComparison[] {
  const peersByDim = new Map<string, ComparisonRow[]>();
  for (const row of input.peers) {
    const list = peersByDim.get(row.dimensionId) ?? [];
    list.push(row);
    peersByDim.set(row.dimensionId, list);
  }
  const mineByDim = new Map(input.mine.map((row) => [row.dimensionId, row]));

  const out: DimensionComparison[] = [];
  for (const [dimensionId, rows] of peersByDim) {
    const peers: PeerAnswer[] = rows.map((r) => ({
      userId: r.userId,
      name: r.name,
      color: r.color,
      value: r.skipped ? null : r.value,
      skipped: r.skipped,
      missing: !r.skipped && r.value === null,
    }));

    const myRow = mineByDim.get(dimensionId);
    const mine = myRow ? (myRow.skipped ? null : myRow.value) : null;
    const mineSkipped = !!myRow?.skipped;
    const mineMissing = !myRow || (!myRow.skipped && myRow.value === null);

    // Las respuestas que cuentan para el acuerdo: las de los compañeros
    // que contestaron y la de quien está revisando, si la tiene.
    const keys = new Set<string>();
    for (const p of peers) {
      if (p.missing) continue;
      keys.add(answerKey(p.value, p.skipped));
    }
    if (!mineMissing) keys.add(answerKey(mine, mineSkipped));

    const discrepant = keys.size > 1;
    if (!discrepant) continue;

    out.push({
      dimensionId, peers, mine, mineSkipped, mineMissing, discrepant,
    });
  }
  return out;
}

/**
 * Cómo se lee una respuesta en pantalla.
 *
 * `kind` distingue la etiqueta de verdad (que se muestra entrecomillada)
 * de los dos casos sin etiqueta: la pregunta saltada y la respuesta que
 * todavía no existe.
 */
export type AnswerLabel = {
  text: string;
  kind: 'value' | 'skipped' | 'missing';
};

/**
 * La misma etiqueta, como texto plano: la etiqueta de verdad entre
 * comillas y los otros dos casos tal cual.
 */
export function labelText(label: AnswerLabel): string {
  return label.kind === 'value' ? `«${label.text}»` : label.text;
}

/**
 * Cómo se lee la respuesta de un compañero en pantalla.
 */
export function peerLabel(answer: {
  value: string | null;
  skipped: boolean;
  missing: boolean;
}): AnswerLabel {
  if (answer.missing) return { text: 'sin responder', kind: 'missing' };
  if (answer.skipped) return { text: 'la saltó', kind: 'skipped' };
  return { text: answer.value ?? '—', kind: 'value' };
}

/**
 * Cómo se lee en pantalla la respuesta de quien tiene la pantalla
 * abierta (el anotador que está revisando el fragmento).
 */
export function ownLabel(comparison: {
  mine: string | null;
  mineSkipped: boolean;
  mineMissing: boolean;
}): AnswerLabel {
  if (comparison.mineMissing) return { text: 'sin etiquetar', kind: 'missing' };
  if (comparison.mineSkipped) return { text: 'te la saltaste', kind: 'skipped' };
  return { text: comparison.mine ?? '—', kind: 'value' };
}
