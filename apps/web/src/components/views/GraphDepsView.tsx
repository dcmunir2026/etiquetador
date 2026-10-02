'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { DimensionRow } from '@/lib/queries';
import { reorderProjectDimensions } from '@/app/actions/workflow';
import { buildCascade, type AnswerMap, type CascadeDimension, type CascadeNode } from '@/lib/cascade';
import { EmptyState } from './shared';

type Fragment = { id: string; text: string; question: string | null } | null;

const COLOR_SKIP = '#a13d3d';
const COLOR_ALWAYS = '#1c8a4a';
const COLOR_MUTED = '#9ca3af';
const COLOR_WAIT = '#b58300';

/**
 * Dependency graph, in two readings:
 *  · Global — the project's catalogue and the conditions between dimensions.
 *  · Resuelto — the same tree with one fragment's answers applied, showing
 *    which dimensions the cascade actually asked for.
 */
export function GraphDepsView({
  projectId, dimensions, sampleFragment, sampleAnswers, canReorder = false,
}: {
  projectId: string; dimensions: DimensionRow[]; sampleFragment: Fragment;
  sampleAnswers: Record<string, string>; canReorder?: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<'global' | 'resolved'>('global');

  // Local order, so a drag redraws immediately and the save happens after.
  const [order, setOrder] = useState<string[]>(() => dimensions.map((d) => d.id));
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Re-sync when the server sends a different catalogue (new dimension, other project).
  useEffect(() => { setOrder(dimensions.map((d) => d.id)); }, [dimensions]);

  const dims: CascadeDimension[] = useMemo(() => {
    const byId = new Map(dimensions.map((d) => [d.id, d]));
    const sorted = [
      ...order.map((id) => byId.get(id)).filter((d): d is DimensionRow => Boolean(d)),
      ...dimensions.filter((d) => !order.includes(d.id)),
    ];
    return sorted.map((d) => ({
      id: d.id, name: d.name, kind: d.kind, values: d.values,
      scaleName: d.scaleName, shortDescription: d.shortDescription, dependency: d.dependency,
    }));
  }, [dimensions, order]);

  const parentOf = useMemo(
    () => new Map(dimensions.map((d) => [d.id, d.dependency?.parentId ?? null])),
    [dimensions],
  );

  /**
   * Drop `dragId` onto `targetId`. Only siblings can be swapped: the tree
   * comes from the dependency rules, so a drag never re-parents anything.
   */
  async function drop(targetId: string) {
    const sourceId = dragId;
    // Clearing first makes the handler idempotent: a drag emits its drop
    // once, and any repeat for the same gesture finds no source and exits.
    setDragId(null);
    setOverId(null);
    if (!sourceId || sourceId === targetId || saving) return;

    if (parentOf.get(sourceId) !== parentOf.get(targetId)) {
      setNotice('Solo se puede reordenar entre dimensiones del mismo nivel: la jerarquía la marcan las dependencias, no la posición.');
      return;
    }

    const next = order.filter((id) => id !== sourceId);
    const at = next.indexOf(targetId);
    next.splice(order.indexOf(sourceId) < order.indexOf(targetId) ? at + 1 : at, 0, sourceId);

    // Nothing moved (dropped back where it was): no write, no noise.
    if (next.every((id, i) => id === order[i])) { setNotice(null); return; }

    const previous = order;
    setOrder(next);
    setNotice(null);
    setSaving(true);
    const res = await reorderProjectDimensions({ projectId, dimensionIds: next });
    setSaving(false);
    if (!res.ok) { setOrder(previous); setNotice(res.error); return; }
    setNotice('Orden guardado.');
    router.refresh();
  }

  // Memoised so the empty object literal does not rebuild the tree each render.
  const answers: AnswerMap = useMemo(
    () => (tab === 'resolved' ? sampleAnswers : {}),
    [tab, sampleAnswers],
  );
  const tree = useMemo(() => buildCascade(dims, answers), [dims, answers]);
  const withDeps = dimensions.filter((d) => d.dependency).length;

  return (
    <div className="page">
      <h1>Grafo de dependencias</h1>
      <p className="lead">
        Visualización de cómo se conectan las dimensiones entre sí. <b>Global</b> muestra el
        catálogo del proyecto activo; <b>Resuelto</b> aplica las respuestas de un fragmento real
        para ver qué ramas se piden y cuáles se saltan.
      </p>

      <div className="tabs-bar">
        <div className={`tab${tab === 'global' ? ' active' : ''}`} onClick={() => setTab('global')}>
          Global (catálogo)
          <span className="tab-count">{dimensions.length}</span>
        </div>
        <div className={`tab${tab === 'resolved' ? ' active' : ''}`} onClick={() => setTab('resolved')}>
          Resuelto (fragmento)
          <span className="tab-count">{Object.keys(sampleAnswers).length}</span>
        </div>
      </div>

      {tab === 'resolved' ? (
        sampleFragment ? (
          <div style={{ background: '#e3eef5', border: '1px solid #c2dde4', borderLeft: '3px solid #1d6e75',
                        padding: '10px 14px', borderRadius: '0 6px 6px 0', marginBottom: 14,
                        fontSize: 12.5, color: '#1a3a3f' }}>
            <b style={{ color: '#1d6e75' }}>Fragmento de muestra:</b>{' '}
            <i>“{sampleFragment.text.slice(0, 220)}{sampleFragment.text.length > 220 ? '…' : ''}”</i>
            <br />
            <span style={{ color: 'var(--ink-3)', fontSize: 11.5 }}>
              Las dimensiones se renderizan en cascada según las respuestas anotadas. Las saltadas
              aparecen en gris: no se pidió etiquetarlas.
            </span>
          </div>
        ) : (
          <EmptyState title="Sin fragmento de muestra">
            Necesitas un paquete asignado con al menos un fragmento para resolver la cascada.
          </EmptyState>
        )
      ) : (
        <div style={{ background: 'var(--surface-2)', padding: '10px 14px', borderRadius: 8,
                      marginBottom: 14, fontSize: 12.5, color: 'var(--ink-2)' }}>
          Vista global del catálogo del proyecto activo. {withDeps} de {dimensions.length} dimensiones
          declaran una condición; el resto son raíces siempre visibles.
        </div>
      )}

      {canReorder && tab === 'global' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
                      fontSize: 12, color: 'var(--ink-3)' }}>
          <span style={{ letterSpacing: 2 }}>⠿</span>
          Arrastra una dimensión por su asa para cambiar su posición entre las de su mismo nivel.
          El orden se guarda y también se aplica a la pantalla de etiquetar.
          {saving && <b style={{ color: 'var(--ink-2)' }}>Guardando…</b>}
        </div>
      )}
      {notice && (
        <div style={{ marginBottom: 10, padding: '9px 12px', background: 'var(--surface-2)',
                      borderLeft: '3px solid var(--primary-2)', borderRadius: '0 6px 6px 0',
                      fontSize: 12.5, color: 'var(--ink-2)' }}>{notice}</div>
      )}

      <div className="graph-tab-panel" style={{ overflowX: 'auto' }}>
        {tree.length === 0 ? (
          <EmptyState title="Sin dimensiones">
            Asigna alguna taxonomía al proyecto para ver su grafo.
          </EmptyState>
        ) : (
          tree.map((node) => (
            <GraphNode key={node.dim.id} node={node} mode={tab} answers={answers}
                       draggable={canReorder && tab === 'global'}
                       dragId={dragId} overId={overId}
                       onDragStart={setDragId} onDragEnd={() => { setDragId(null); setOverId(null); }}
                       onDragOverNode={setOverId} onDropNode={drop} />
          ))
        )}
      </div>

      <div style={{ marginTop: 14, padding: '12px 16px', background: 'var(--surface-2)',
                    border: '1px solid var(--line)', borderRadius: 8, fontSize: 12, color: 'var(--ink-3)' }}>
        <b style={{ color: 'var(--ink-2)' }}>Leyenda:</b>
        <Legend color={COLOR_SKIP} label="condicional (puede saltarse)" />
        <Legend color={COLOR_ALWAYS} label="siempre visible" />
        <Legend color={COLOR_WAIT} label="espera respuesta del padre" />
        <Legend color={COLOR_MUTED} label="saltada en este fragmento" />
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginLeft: 12 }}>
      <span style={{ width: 11, height: 11, borderRadius: '50%', background: color }} />
      {label}
    </span>
  );
}

type DragProps = {
  draggable: boolean;
  dragId: string | null;
  overId: string | null;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDragOverNode: (id: string | null) => void;
  onDropNode: (id: string) => void;
};

function GraphNode({ node, mode, answers, ...drag }: {
  node: CascadeNode; mode: 'global' | 'resolved'; answers: AnswerMap;
} & DragProps) {
  const d = node.dim;
  const skipped = mode === 'resolved' && node.visibility === 'skipped';
  const waiting = mode === 'resolved' && node.visibility === 'pending-parent';
  const color = skipped ? COLOR_MUTED
    : waiting ? COLOR_WAIT
    : d.dependency ? COLOR_SKIP
    : COLOR_ALWAYS;

  const answer = answers[d.id];
  const valuesList = d.kind === 'free-text' ? 'texto libre' : d.values.join(' / ');

  const dragging = drag.dragId === d.id;
  const isTarget = drag.overId === d.id && drag.dragId !== null && drag.dragId !== d.id;

  return (
    <>
      <div style={{ opacity: skipped ? 0.45 : dragging ? 0.4 : 1, marginBottom: 8, marginLeft: node.depth * 22 }}
           draggable={drag.draggable}
           onDragStart={(e) => { e.stopPropagation(); e.dataTransfer.effectAllowed = 'move'; drag.onDragStart(d.id); }}
           onDragEnd={drag.onDragEnd}
           onDragOver={(e) => { if (!drag.draggable || !drag.dragId) return; e.preventDefault(); e.stopPropagation(); drag.onDragOverNode(d.id); }}
           onDragLeave={(e) => { e.stopPropagation(); drag.onDragOverNode(null); }}
           onDrop={(e) => { if (!drag.draggable) return; e.preventDefault(); e.stopPropagation(); drag.onDropNode(d.id); }}>
        <div style={{ boxSizing: 'border-box', display: 'flex', alignItems: 'flex-start', gap: 10,
                      padding: '10px 12px', background: isTarget ? 'var(--primary-fade)' : 'var(--surface)',
                      border: '1px solid var(--line)',
                      borderTop: isTarget ? '2px solid var(--primary-2)' : undefined,
                      borderLeft: `3px solid ${color}`, borderRadius: 6 }}>
          {drag.draggable && (
            <span title="Arrastra para reordenar"
                  style={{ cursor: 'grab', color: 'var(--ink-4)', fontSize: 13, lineHeight: '18px',
                           letterSpacing: 1, flexShrink: 0, userSelect: 'none' }}>⠿</span>
          )}
          <div style={{ width: 11, height: 11, borderRadius: '50%', background: color, flexShrink: 0, marginTop: 5 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
              <b style={{ color: 'var(--ink-1)', fontSize: 13.5 }}>{d.name}</b>
              <span style={{ fontSize: 10.5, color: 'var(--ink-3)', background: 'var(--surface-2)',
                             padding: '1px 7px', borderRadius: 8 }}>
                {d.scaleName ?? d.kind}
              </span>
              {skipped && (
                <span style={{ background: '#f3f4f6', color: '#6b7280', fontSize: 10,
                               padding: '1px 6px', borderRadius: 8 }}>SKIPPED</span>
              )}
              {mode === 'resolved' && !skipped && answer && (
                <span style={{ background: '#e3eef5', color: '#1d6e75', fontSize: 10,
                               padding: '1px 6px', borderRadius: 8 }}>→ {answer}</span>
              )}
            </div>
            {valuesList && (
              <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 3 }}>
                Valores: <b style={{ color: 'var(--ink-2)' }}>{valuesList}</b>
              </div>
            )}
            {d.dependency?.label && (
              <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 3 }}>
                <i>Mostrar solo cuando:</i> {d.dependency.label}
              </div>
            )}
          </div>
        </div>
      </div>
      {node.children.map((c) => (
        <GraphNode key={c.dim.id} node={c} mode={mode} answers={answers} {...drag} />
      ))}
    </>
  );
}
