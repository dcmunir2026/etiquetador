'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import TaxonomyForm, { type TaxonomyInitial } from './TaxonomyForm';
import AssignToProjectModal, { type ProjectOption } from './AssignToProjectModal';
import { archiveTaxonomy } from '../actions/actions';
import { TAXONOMY_COLOR_OPTIONS, type TaxonomyColor } from '../actions/schemas';

const TK_COLOR: Record<string, string> = {
  'tk-odio': '#d97757',
  'tk-emot': '#a85a35',
  'tk-tend': '#7d6c4f',
  'tk-semi': '#3d8268',
  'tk-gen': '#5b8fb8',
  'tk-race': '#8b6db5',
  'tk-rel': '#c79d3c',
  'tk-demo': '#9c5b8b',
  'tk-stat': '#5a7d8f',
  'tk-toxic': '#7a1a1c',
  'tk-fact': '#1c6e3a',
};

export type TaxonomyCard = {
  id: string;
  name: string;
  shortDescription: string | null;
  color: TaxonomyColor;
  status: 'active' | 'archived';
  dimensions: Array<{ id: string; name: string; kind: string | null }>;
  projectCount: number;
};

function colorPreview(c: TaxonomyColor): string {
  return TAXONOMY_COLOR_OPTIONS.find((o) => o.id === c)?.preview ?? TAXONOMY_COLOR_OPTIONS[2]!.preview;
}

export default function TaxonomyCatalog({
  cards,
  projectsByTaxonomy = {},
}: {
  cards: TaxonomyCard[];
  projectsByTaxonomy?: Record<string, ProjectOption[]>;
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState<{ mode: 'new' } | { mode: 'edit'; initial: TaxonomyInitial } | null>(null);
  const [assignFor, setAssignFor] = useState<TaxonomyCard | null>(null);
  const [pending, startTransition] = useTransition();
  const [actionErr, setActionErr] = useState<string | null>(null);

  function openCreate() {
    setActionErr(null);
    setShowForm({ mode: 'new' });
  }

  function openEdit(c: TaxonomyCard) {
    setActionErr(null);
    setShowForm({
      mode: 'edit',
      initial: {
        id: c.id,
        name: c.name,
        shortDescription: c.shortDescription,
        longDescription: null,
        color: c.color,
      },
    });
  }

  function onArchive(c: TaxonomyCard) {
    if (!confirm(`¿Archivar la taxonomía "${c.name}"?\nDejará de aparecer en los selectores activos.`)) {
      return;
    }
    setActionErr(null);
    startTransition(async () => {
      const res = await archiveTaxonomy({ id: c.id });
      if (res.ok) {
        router.refresh();
      } else {
        setActionErr(res.error);
      }
    });
  }

  return (
    <>
      <div className="card" style={{ padding: 0, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px' }}>
          <input
            type="search"
            placeholder="Buscar taxonomía..."
            style={{
              flex: 1,
              padding: '8px 12px',
              border: '1px solid var(--line)',
              borderRadius: 6,
              fontSize: 13,
              background: 'var(--surface-2)',
              color: 'var(--ink-1)',
            }}
          />
          <button
            type="button"
            className="btn primary"
            style={{ marginLeft: 'auto' }}
            onClick={openCreate}
            disabled={pending}
          >
            + Nueva taxonomía
          </button>
        </div>
      </div>

      {actionErr ? (
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
          {actionErr}
        </div>
      ) : null}

      <div>
        {cards.map((c) => {
          const initial = c.name.charAt(0).toUpperCase();
          return (
            <div
              key={c.id}
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--line)',
                borderRadius: 11,
                marginBottom: 14,
                overflow: 'hidden',
                opacity: c.status === 'archived' ? 0.6 : 1,
              }}
            >
              <div
                style={{
                  padding: '14px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  borderBottom: '1px solid var(--line-soft)',
                }}
              >
                <div
                  className="av-lg"
                  style={{ background: colorPreview(c.color) }}
                  aria-hidden
                >
                  {initial}
                </div>
                <a
                  href={`/taxonomias/${c.id}`}
                  style={{
                    flex: 1,
                    textDecoration: 'none',
                    color: 'inherit',
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--ink-1)' }}>{c.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                    {c.shortDescription || <span style={{ fontStyle: 'italic' }}>Sin descripción breve.</span>}
                  </div>
                </a>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>
                    <b style={{ color: 'var(--ink-1)', fontSize: 18, display: 'block' }}>{c.dimensions.length}</b>
                    dimensiones
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>
                    <b style={{ color: 'var(--ink-1)', fontSize: 18, display: 'block' }}>{c.projectCount}</b>
                    proyectos
                  </div>
                </div>
                <button
                  type="button"
                  className="btn sm"
                  onClick={() => openEdit(c)}
                  disabled={pending}
                >
                  Editar
                </button>
                {c.status !== 'archived' ? (
                  <button
                    type="button"
                    className="btn sm"
                    onClick={() => setAssignFor(c)}
                    disabled={pending}
                    title="Asignar a uno o más proyectos"
                  >
                    Asignar a proyecto
                  </button>
                ) : null}
                {c.status !== 'archived' ? (
                  <button
                    type="button"
                    className="btn sm"
                    onClick={() => onArchive(c)}
                    disabled={pending}
                    style={{ color: 'var(--danger)' }}
                  >
                    Archivar
                  </button>
                ) : (
                  <span
                    style={{
                      fontSize: 11,
                      color: 'var(--ink-4)',
                      fontStyle: 'italic',
                      padding: '0 8px',
                    }}
                  >
                    archivada
                  </span>
                )}
              </div>
              <div
                style={{
                  padding: '12px 18px',
                  background: 'var(--surface-2)',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 7,
                }}
              >
                {c.dimensions.map((d) => (
                  <span
                    key={d.id}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '4px 10px',
                      background: '#fff',
                      border: '1px solid var(--line)',
                      borderRadius: 14,
                      fontSize: 11.5,
                      color: 'var(--ink-1)',
                      fontWeight: 500,
                    }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: TK_COLOR[d.kind || ''] || '#7d6c4f',
                      }}
                    />
                    {d.name}
                  </span>
                ))}
                {c.dimensions.length === 0 ? (
                  <a
                    href={`/taxonomias/${c.id}`}
                    style={{
                      fontSize: 11.5,
                      color: 'var(--primary-2)',
                      textDecoration: 'none',
                    }}
                  >
                    Añadir dimensiones →
                  </a>
                ) : null}
              </div>
            </div>
          );
        })}
        {cards.length === 0 ? (
          <div className="empty">No hay taxonomías. Crea la primera con el botón "+ Nueva taxonomía".</div>
        ) : null}
      </div>

      {showForm ? (
        <TaxonomyForm
          initial={showForm.mode === 'edit' ? showForm.initial : undefined}
          onClose={() => setShowForm(null)}
        />
      ) : null}

      {assignFor ? (
        <AssignToProjectModal
          taxonomyId={assignFor.id}
          taxonomyName={assignFor.name}
          projects={projectsByTaxonomy[assignFor.id] ?? []}
          onClose={() => setAssignFor(null)}
        />
      ) : null}
    </>
  );
}
