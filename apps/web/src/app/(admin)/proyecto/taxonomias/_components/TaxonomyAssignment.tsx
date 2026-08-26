'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addProjectTaxonomy, removeProjectTaxonomy } from '../actions/actions';
import { TAXONOMY_COLOR_OPTIONS, type TaxonomyColor } from '../../../taxonomias/actions/schemas';

export type AssignmentTaxonomy = {
  id: string;
  name: string;
  shortDescription: string | null;
  color: TaxonomyColor;
  dimensionCount: number;
  isAssigned: boolean;
};

function colorPreview(c: TaxonomyColor): string {
  return TAXONOMY_COLOR_OPTIONS.find((o) => o.id === c)?.preview ?? TAXONOMY_COLOR_OPTIONS[2]!.preview;
}

type Tab = 'all' | 'assigned';

export default function TaxonomyAssignment({
  projectId,
  items,
}: {
  projectId: string;
  items: AssignmentTaxonomy[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('all');
  const [pending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const assigned = items.filter((i) => i.isAssigned);
  const unassigned = items.filter((i) => !i.isAssigned);
  const list = tab === 'assigned' ? assigned : unassigned;
  const counts = { all: items.length, assigned: assigned.length };

  function onAdd(t: AssignmentTaxonomy) {
    setErr(null);
    setPendingId(t.id);
    startTransition(async () => {
      const res = await addProjectTaxonomy({ projectId, taxonomyId: t.id });
      setPendingId(null);
      if (res.ok) {
        router.refresh();
      } else {
        setErr(res.error);
      }
    });
  }

  function onRemove(t: AssignmentTaxonomy) {
    if (!confirm(`¿Quitar la taxonomía "${t.name}" de este proyecto?`)) return;
    setErr(null);
    setPendingId(t.id);
    startTransition(async () => {
      const res = await removeProjectTaxonomy({ projectId, taxonomyId: t.id });
      setPendingId(null);
      if (res.ok) {
        router.refresh();
      } else {
        setErr(res.error);
      }
    });
  }

  return (
    <>
      <div className="tabs-bar" style={{ marginBottom: 14 }}>
        <button
          type="button"
          className={`tab ${tab === 'all' ? 'active' : ''}`}
          onClick={() => setTab('all')}
        >
          Todas las taxonomías
          <span className="tab-count">{counts.all}</span>
        </button>
        <button
          type="button"
          className={`tab ${tab === 'assigned' ? 'active' : ''}`}
          onClick={() => setTab('assigned')}
        >
          Asignadas a este proyecto
          <span className="tab-count">{counts.assigned}</span>
        </button>
      </div>

      {tab === 'assigned' ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            padding: '10px 13px',
            background: '#e3eef5',
            border: '1px solid #c5d8e8',
            borderRadius: 8,
            marginBottom: 14,
            fontSize: 12.5,
            color: '#1d4a72',
          }}
        >
          <svg
            className="ic"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={{ width: 16, height: 16, flexShrink: 0 }}
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <span>
            Estas son las taxonomías que se cargarán al anotar en este proyecto. Para añadir
            más, ve a la pestaña <b>Todas las creadas</b>.
          </span>
        </div>
      ) : null}

      {err ? (
        <div
          style={{
            background: 'var(--danger-bg)',
            color: 'var(--danger)',
            border: '1px solid #e6c4c4',
            borderRadius: 7,
            padding: '9px 12px',
            fontSize: 12.5,
            marginBottom: 12,
          }}
        >
          {err}
        </div>
      ) : null}

      <div className="dim-list" style={{ display: 'grid', gap: 10 }}>
        {list.map((t) => {
          const isPending = pending && pendingId === t.id;
          return (
            <div
              key={t.id}
              className="card"
              style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 14 }}
            >
              <div
                className="av-lg"
                style={{ background: colorPreview(t.color), width: 44, height: 44, fontSize: 17 }}
                aria-hidden
              >
                {t.name.charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: 14,
                    color: 'var(--ink-1)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {t.name}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--ink-3)',
                    marginTop: 2,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {t.shortDescription || <span style={{ fontStyle: 'italic' }}>Sin descripción breve.</span>}
                  <span style={{ margin: '0 6px' }}>·</span>
                  <span>
                    {t.dimensionCount}{' '}
                    {t.dimensionCount === 1 ? 'dimensión' : 'dimensiones'}
                  </span>
                </div>
              </div>
              {tab === 'all' ? (
                <button
                  type="button"
                  className="btn primary sm"
                  onClick={() => onAdd(t)}
                  disabled={pending}
                  aria-busy={isPending}
                >
                  {isPending ? 'Añadiendo…' : 'Añadir'}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn sm"
                  onClick={() => onRemove(t)}
                  disabled={pending}
                  style={{ color: 'var(--danger)' }}
                  aria-busy={isPending}
                >
                  {isPending ? 'Quitando…' : 'Quitar'}
                </button>
              )}
            </div>
          );
        })}
        {list.length === 0 ? (
          <div className="empty">
            {tab === 'all'
              ? 'Todas las taxonomías ya están asignadas a este proyecto.'
              : 'No hay taxonomías asignadas todavía. Ve a "Todas las taxonomías" para añadir.'}
          </div>
        ) : null}
      </div>
    </>
  );
}
