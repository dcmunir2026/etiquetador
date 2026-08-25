'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import DimensionWizardModal, { type ModalTarget } from './DimensionWizardModal';
import ArchiveButton from '../ArchiveButton';
import type { DimensionCard, Scale } from './types';

const SLUG_TO_TK: Array<[RegExp, string]> = [
  [/odio|toxic/i, 'tk-odio'],
  [/emot/i, 'tk-emot'],
  [/tend/i, 'tk-tend'],
  [/semi/i, 'tk-semi'],
  [/g[eé]nero|gen\b/i, 'tk-gen'],
  [/raza|rac/i, 'tk-race'],
  [/religion|relig/i, 'tk-rel'],
  [/demogr/i, 'tk-demo'],
  [/estad[ií]stic|stat/i, 'tk-stat'],
  [/fact|incoheren/i, 'tk-fact'],
];

function pickColor(slug: string): string {
  for (const [re, tk] of SLUG_TO_TK) {
    if (re.test(slug)) return tk;
  }
  return 'tk-default';
}

export default function DimensionsCatalog({
  cards,
  initialScales,
}: {
  cards: DimensionCard[];
  initialScales: Scale[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [target, setTarget] = useState<ModalTarget>(null);
  const [scales, setScales] = useState<Scale[]>(initialScales);

  // Open modal from URL params (?new=1, ?edit=<id>).
  useEffect(() => {
    const newFlag = searchParams.get('new');
    const editId = searchParams.get('edit');
    if (newFlag === '1') {
      setTarget({ mode: 'new' });
    } else if (editId) {
      const card = cards.find((c) => c.id === editId);
      if (card) {
        setTarget({
          mode: 'edit',
          initial: {
            id: card.id,
            name: card.name,
            kind: card.kind,
            scaleId: card.scaleId ?? scales[0]?.id ?? '',
            shortDescription: card.shortDescription,
            longDescription: null,
          },
        });
      }
    }
    // Run only on mount or when searchParams change (not on card list change).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function handleNewScale(s: Scale) {
    setScales((prev) => [...prev, s]);
  }

  function close() {
    setTarget(null);
    // Strip ?new=1 / ?edit=… from the URL so a refresh doesn't re-open.
    const sp = new URLSearchParams(Array.from(searchParams.entries()));
    sp.delete('new');
    sp.delete('edit');
    const qs = sp.toString();
    router.replace(qs ? `/dimensiones?${qs}` : '/dimensiones', { scroll: false });
  }

  return (
    <>
      <div className="card" style={{ padding: 0 }}>
        <div className="tax-toolbar" style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)', margin: 0 }}>
          <input type="search" placeholder="Buscar dimensión..." />
          <select>
            <option>Todas las escalas</option>
            <option>3 niveles</option>
            <option>5 niveles</option>
            <option>Likert</option>
            <option>Binario</option>
          </select>
          <select>
            <option>Estado: activas</option>
            <option>Estado: archivadas</option>
            <option>Estado: todas</option>
          </select>
          <button
            type="button"
            className="btn primary"
            style={{ marginLeft: 'auto' }}
            onClick={() => setTarget({ mode: 'new' })}
          >
            + Nueva dimensión
          </button>
        </div>

        <div className="tax-grid" style={{ padding: 16 }}>
          {cards.map((c) => {
            const valuesPreview = c.values.slice(0, 3).join(' · ');
            const valuesOverflow = c.values.length > 3 ? `+${c.values.length - 3}` : '';
            const tk = pickColor(c.slug);
            const kindLabel =
              c.kind === 'category' ? 'Categoría'
              : c.kind === 'intensity' ? 'Intensidad'
              : c.kind === 'flag' ? 'Flag'
              : 'Texto libre';
            return (
              <div key={c.id} className={`tax-card ${c.status === 'archived' ? 'is-archived' : ''}`}>
                <div className="tax-card-head">
                  <div className={`tax-color ${tk}`}>{c.name.charAt(0).toUpperCase()}</div>
                  <div>
                    <h4>{c.name}</h4>
                    <p>{c.shortDescription || 'Sin descripción breve.'}</p>
                  </div>
                </div>
                <div className="tax-card-meta">
                  <span className="scale-pill">{kindLabel}</span>
                  {valuesPreview ? (
                    <span className="scale-pill values">{valuesPreview}{valuesOverflow}</span>
                  ) : null}
                  {c.projectCount > 0 ? (
                    <span className="tax-used-pill">
                      {c.projectCount} {c.projectCount === 1 ? 'proyecto' : 'proyectos'}
                    </span>
                  ) : null}
                </div>
                <div className="tax-card-foot">
                  <small>
                    Creada por{' '}
                    <b style={{ color: 'var(--ink-2)' }}>
                      {c.creatorName || c.creatorEmail || '—'}
                    </b>
                  </small>
                  <div className="actions-mini">
                    <button
                      type="button"
                      className="btn-mini"
                      onClick={() =>
                        setTarget({
                          mode: 'edit',
                          initial: {
                            id: c.id,
                            name: c.name,
                            kind: c.kind,
                            scaleId: c.scaleId ?? scales[0]?.id ?? '',
                            shortDescription: c.shortDescription,
                            longDescription: null,
                          },
                        })
                      }
                    >
                      Editar
                    </button>
                    {c.status !== 'archived' ? (
                      <ArchiveButton
                        dimensionId={c.id}
                        dimensionName={c.name}
                        variant="mini"
                      />
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
          {cards.length === 0 && (
            <div className="empty" style={{ gridColumn: '1 / -1' }}>
              No hay dimensiones. Crea la primera con el botón "+ Nueva dimensión".
            </div>
          )}
        </div>
      </div>

      <DimensionWizardModal target={target} scales={scales} onClose={close} />
    </>
  );
}
