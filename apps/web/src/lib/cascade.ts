/**
 * Skip-logic resolution — the rule engine behind the tagging screen and
 * the dependency graph.
 *
 * A dimension may declare one dependency: it is shown only when its parent
 * was answered with one of the listed values. Anything gated by a skipped
 * or unanswered parent is itself skipped, so the cascade propagates.
 */

export type DependencyRule = {
  parentId: string;
  operator: '=' | '!=' | 'in';
  values: string[];
  label: string | null;
};

export type CascadeDimension = {
  id: string;
  name: string;
  slug?: string;
  kind: string;
  scaleName?: string | null;
  shortDescription?: string | null;
  values: string[];
  dependency: DependencyRule | null;
};

/** What an annotator answered for one dimension. */
export type AnswerMap = Record<string, string | undefined>;

export type Visibility = 'visible' | 'skipped' | 'pending-parent';

/** Evaluate one rule against the parent's current answer. */
function matches(rule: DependencyRule, parentAnswer: string): boolean {
  switch (rule.operator) {
    case '!=':
      return !rule.values.includes(parentAnswer);
    case '=':
    case 'in':
    default:
      return rule.values.includes(parentAnswer);
  }
}

/**
 * Resolve one dimension's visibility given the answers so far.
 *
 * `pending-parent` means the gate simply has not been answered yet — it is
 * shown to the annotator as waiting, not as skipped.
 */
export function resolveVisibility(
  dim: CascadeDimension,
  answers: AnswerMap,
  byId: Map<string, CascadeDimension>,
  seen: Set<string> = new Set(),
): Visibility {
  if (!dim.dependency) return 'visible';
  // Guard against a cycle introduced by bad data.
  if (seen.has(dim.id)) return 'visible';
  seen.add(dim.id);

  const rule = dim.dependency;
  const parent = byId.get(rule.parentId);
  if (parent) {
    const parentVisibility = resolveVisibility(parent, answers, byId, seen);
    if (parentVisibility === 'skipped') return 'skipped';
    if (parentVisibility === 'pending-parent') return 'pending-parent';
  }

  const parentAnswer = answers[rule.parentId];
  if (parentAnswer === undefined || parentAnswer === '') return 'pending-parent';
  return matches(rule, parentAnswer) ? 'visible' : 'skipped';
}

/** Depth of a dimension in the dependency chain (0 = root). */
export function depthOf(dim: CascadeDimension, byId: Map<string, CascadeDimension>): number {
  let depth = 0;
  let cur = dim;
  const seen = new Set<string>();
  while (cur.dependency && byId.has(cur.dependency.parentId) && !seen.has(cur.id)) {
    seen.add(cur.id);
    depth++;
    cur = byId.get(cur.dependency.parentId)!;
    if (depth > 20) break;
  }
  return depth;
}

export type CascadeNode = {
  dim: CascadeDimension;
  depth: number;
  visibility: Visibility;
  children: CascadeNode[];
};

/**
 * Build the parent → child forest, ordered so a parent always renders
 * before the dimensions it gates.
 */
export function buildCascade(dims: CascadeDimension[], answers: AnswerMap): CascadeNode[] {
  const byId = new Map(dims.map((d) => [d.id, d]));
  const childrenOf = new Map<string, CascadeDimension[]>();
  const roots: CascadeDimension[] = [];

  for (const d of dims) {
    const parentId = d.dependency?.parentId;
    if (parentId && byId.has(parentId)) {
      const bucket = childrenOf.get(parentId) ?? [];
      bucket.push(d);
      childrenOf.set(parentId, bucket);
    } else {
      roots.push(d);
    }
  }

  const build = (dim: CascadeDimension, depth: number, seen: Set<string>): CascadeNode => {
    seen.add(dim.id);
    const kids = (childrenOf.get(dim.id) ?? []).filter((c) => !seen.has(c.id));
    return {
      dim,
      depth,
      visibility: resolveVisibility(dim, answers, byId),
      children: kids.map((c) => build(c, depth + 1, seen)),
    };
  };

  return roots.map((r) => build(r, 0, new Set()));
}

/** Flatten the forest back into render order. */
export function flattenCascade(nodes: CascadeNode[]): CascadeNode[] {
  const out: CascadeNode[] = [];
  const walk = (list: CascadeNode[]) => {
    for (const n of list) {
      out.push(n);
      walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

/**
 * Recompute every answer after one changes: dimensions whose gate no longer
 * matches are cleared, so a stale child answer can never be submitted.
 */
export function pruneAnswers(dims: CascadeDimension[], answers: AnswerMap): AnswerMap {
  const byId = new Map(dims.map((d) => [d.id, d]));
  const next: AnswerMap = { ...answers };
  // Resolve shallow dimensions first so parents settle before their children.
  const ordered = [...dims].sort((a, b) => depthOf(a, byId) - depthOf(b, byId));
  for (const d of ordered) {
    if (resolveVisibility(d, next, byId) === 'skipped') delete next[d.id];
  }
  return next;
}

/** Would adding this edge create a loop? Used by the wizard's step 5. */
export function wouldCycle(childId: string, parentId: string, dims: CascadeDimension[]): boolean {
  if (childId === parentId) return true;
  const byId = new Map(dims.map((d) => [d.id, d]));
  let cur = byId.get(parentId);
  const seen = new Set<string>();
  while (cur?.dependency) {
    if (cur.dependency.parentId === childId) return true;
    if (seen.has(cur.id)) return false;
    seen.add(cur.id);
    cur = byId.get(cur.dependency.parentId);
  }
  return false;
}
