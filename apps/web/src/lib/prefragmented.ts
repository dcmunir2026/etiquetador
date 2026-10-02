/**
 * Reader for corpus files that arrive already fragmented.
 *
 * Some corpora se cortan fuera de la app (pipeline spaCy) y llegan como JSON
 * con una entrada por fragmento. Esos archivos se ingieren tal cual: la
 * configuración de segmentación del proyecto no se aplica, porque los cortes
 * ya vienen hechos.
 *
 * Sin dependencias y sin efectos, para que el mismo código valide el archivo
 * en el navegador (vista previa) y en el servidor (antes de insertar).
 */

/** One fragment as it comes in the file, normalised. */
export type PrefragmentedPiece = {
  /** Source answer id (`id` in the file), shared by all its fragments. */
  conversationId: string | null;
  /** `indiceTurno`: which turn of the conversation the answer belongs to. */
  turn: number;
  /** `indiceFragmento`: position of the fragment inside its answer. */
  index: number;
  question: string | null;
  text: string;
  words: number;
  /** `spacyScore` (0-5) when the file carries the rubric, else null. */
  score: number | null;
  /** `fusionado`: the fragment was merged with a neighbour by the pipeline. */
  merged: boolean;
  /** `respuestaHash`: identity of the answer the fragment was cut from. */
  hash: string | null;
};

/** The whole file: fragments plus the provenance blocks, if present. */
export type PrefragmentedDoc = {
  pieces: PrefragmentedPiece[];
  /** Entries dropped for having no usable text. */
  skipped: number;
  algoritmo: unknown | null;
  rubrica: unknown | null;
};

/** Fragments regrouped into the answer they were cut from. */
export type PrefragmentedGroup = {
  key: string;
  conversationId: string | null;
  question: string | null;
  /** The answer rebuilt from its fragments; shown as context when tagging. */
  sourceText: string;
  pieces: PrefragmentedPiece[];
};

export type PrefragmentedStats = {
  fragments: number;
  answers: number;
  duplicates: number;
  splitAnswers: number;
  merged: number;
  avgWords: number;
  avgScore: number | null;
};

export type PrefragmentedParse =
  | { ok: true; doc: PrefragmentedDoc }
  | { ok: false; error: string };

/** Guard rail so a runaway file cannot be pushed through a server action. */
export const MAX_PREFRAGMENTED = 50_000;

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
}

function int(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : fallback;
}

function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

function block(v: unknown): unknown | null {
  return v && typeof v === 'object' ? v : null;
}

/**
 * Read a pre-fragmented JSON file.
 *
 * Accepts either a bare array of fragments or the full export
 * (`{ algoritmo, rubrica, fragmentos }`). Entries without text are skipped
 * rather than rejected: a single bad row should not block the whole corpus.
 */
export function parsePrefragmented(source: string): PrefragmentedParse {
  let raw: unknown;
  try {
    raw = JSON.parse(source);
  } catch {
    return { ok: false, error: 'El archivo no es JSON válido.' };
  }

  const root = raw as Record<string, unknown> | null;
  const list: unknown[] | null = Array.isArray(raw)
    ? raw
    : Array.isArray(root?.fragmentos)
      ? (root!.fragmentos as unknown[])
      : null;

  if (!list) {
    return {
      ok: false,
      error: 'El JSON debe ser un array de fragmentos o un objeto con la clave «fragmentos».',
    };
  }
  if (list.length === 0) return { ok: false, error: 'El JSON no contiene fragmentos.' };
  if (list.length > MAX_PREFRAGMENTED) {
    return {
      ok: false,
      error: `El archivo trae ${list.length} fragmentos y el máximo por carga es ${MAX_PREFRAGMENTED}. Pártelo en varios archivos.`,
    };
  }

  const pieces: PrefragmentedPiece[] = [];
  let skipped = 0;

  for (const [i, item] of list.entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) { skipped++; continue; }
    const o = item as Record<string, unknown>;
    const text = str(o.fragmento) ?? str(o.texto) ?? str(o.text);
    if (!text) { skipped++; continue; }

    pieces.push({
      conversationId: str(o.id) ?? str(o.conversacionId) ?? str(o.conversationId),
      turn: int(o.indiceTurno, 0),
      index: int(o.indiceFragmento, i),
      question: str(o.preguntaOriginal) ?? str(o.pregunta) ?? str(o.question),
      text,
      words: int(o.palabras, 0) || countWords(text),
      score: typeof o.spacyScore === 'number' && Number.isFinite(o.spacyScore) ? o.spacyScore : null,
      merged: o.fusionado === true,
      hash: str(o.respuestaHash),
    });
  }

  if (pieces.length === 0) {
    return { ok: false, error: 'Ningún elemento del JSON trae un campo «fragmento» con texto.' };
  }

  return {
    ok: true,
    doc: {
      pieces,
      skipped,
      algoritmo: Array.isArray(raw) ? null : block(root?.algoritmo),
      rubrica: Array.isArray(raw) ? null : block(root?.rubrica),
    },
  };
}

/** Rebuild an answer from its fragments, keeping the original spacing. */
export function joinFragments(parts: string[]): string {
  return parts.reduce((acc, part, i) => {
    if (i === 0) return part;
    const glue = acc.endsWith('\n') || part.startsWith('\n') ? '' : ' ';
    return acc + glue + part;
  }, '');
}

/**
 * Regroup fragments into their source answer.
 *
 * `respuestaHash` is the grouping key when the file carries it, so two
 * conversations holding the identical answer collapse into one — the same
 * dedupe the spreadsheet path does on `conversacionId`.
 */
export function groupPrefragmented(pieces: PrefragmentedPiece[]): PrefragmentedGroup[] {
  const byKey = new Map<string, PrefragmentedGroup>();

  for (const p of pieces) {
    const key = p.hash ?? `${p.conversationId ?? '—'}#${p.turn}`;
    let group = byKey.get(key);
    if (!group) {
      group = { key, conversationId: p.conversationId, question: p.question, sourceText: '', pieces: [] };
      byKey.set(key, group);
    }
    if (!group.conversationId && p.conversationId) group.conversationId = p.conversationId;
    if (!group.question && p.question) group.question = p.question;
    group.pieces.push(p);
  }

  const groups = [...byKey.values()];
  for (const group of groups) {
    // Stable sort: fragments that tie on turn/index keep their file order.
    group.pieces.sort((a, b) => a.turn - b.turn || a.index - b.index);
    group.sourceText = joinFragments(group.pieces.map((p) => p.text));
  }
  return groups;
}

/** Preview numbers, computed the same way on both sides of the wire. */
export function prefragmentedStats(
  pieces: PrefragmentedPiece[],
  groups: PrefragmentedGroup[],
): PrefragmentedStats {
  const sources = new Set(pieces.map((p) => `${p.conversationId ?? '—'}#${p.turn}`));
  const scored = pieces.filter((p) => p.score !== null);
  const words = pieces.reduce((sum, p) => sum + p.words, 0);

  return {
    fragments: pieces.length,
    answers: groups.length,
    duplicates: Math.max(0, sources.size - groups.length),
    splitAnswers: groups.filter((g) => g.pieces.length > 1).length,
    merged: pieces.filter((p) => p.merged).length,
    avgWords: pieces.length ? Math.round(words / pieces.length) : 0,
    avgScore: scored.length
      ? Math.round((scored.reduce((sum, p) => sum + (p.score ?? 0), 0) / scored.length) * 100) / 100
      : null,
  };
}
