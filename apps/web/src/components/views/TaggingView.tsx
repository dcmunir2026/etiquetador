'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { TaggingData } from '@/lib/queries';
import { saveAnnotations, submitPackage } from '@/app/actions/workflow';
import { buildCascade, flattenCascade, pruneAnswers, type AnswerMap, type CascadeDimension } from '@/lib/cascade';
import { EmptyState, dimColor } from './shared';

/**
 * The annotation screen. Dimensions render as a cascade: a child only
 * appears once its parent has been answered with a matching value, and is
 * greyed out as SKIPPED otherwise.
 */
export function TaggingView({
  projectId, data, userName,
}: {
  projectId: string; data: TaggingData; userName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [answers, setAnswers] = useState<AnswerMap>(data.answers);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const dims: CascadeDimension[] = useMemo(
    () => data.dimensions.map((d) => ({
      id: d.id, name: d.name, kind: d.kind, values: d.values,
      scaleName: d.scaleName, shortDescription: d.shortDescription, dependency: d.dependency,
    })),
    [data.dimensions],
  );

  const nodes = useMemo(() => flattenCascade(buildCascade(dims, answers)), [dims, answers]);
  const visibleCount = nodes.filter((n) => n.visibility === 'visible').length;
  const answeredCount = nodes.filter(
    (n) => n.visibility === 'visible' && (answers[n.dim.id] ?? '') !== '',
  ).length;

  if (!data.fragment || !data.package) {
    return (
      <div className="page">
        <h1>Etiquetar fragmento</h1>
        <EmptyState title="No tienes fragmentos asignados">
          Necesitas un paquete asignado en este proyecto. Ve a{' '}
          <a href="/proyecto/paquetes" style={{ color: 'var(--primary-2)' }}>Paquetes</a> para dividir el
          corpus y asignarlo a tu equipo.
        </EmptyState>
      </div>
    );
  }

  const frag = data.fragment;

  function pick(dimId: string, value: string) {
    // Re-selecting the same value clears it, so a gate can be reopened.
    const next = { ...answers, [dimId]: answers[dimId] === value ? '' : value };
    if (next[dimId] === '') delete next[dimId];
    setAnswers(pruneAnswers(dims, next));
    setNotice(null);
  }

  async function save(goNext: boolean) {
    setSaving(true);
    setNotice(null);
    const res = await saveAnnotations({
      projectId, fragmentId: frag.id, packageId: data.package!.id,
      answers: answers as Record<string, string>,
    });
    setSaving(false);
    if (!res.ok) { setNotice(res.error); return; }
    if (goNext && data.position < data.total) {
      startTransition(() => router.push(`/etiquetar?fragment=${data.position + 1}`));
    } else {
      setNotice('Guardado.');
      router.refresh();
    }
  }

  async function finish() {
    setSaving(true);
    const res = await submitPackage(data.package!.id);
    setSaving(false);
    setNotice(res.ok ? 'Paquete enviado a validación.' : res.error);
    router.refresh();
  }

  function goTo(pos: number) {
    if (pos < 1 || pos > data.total) return;
    startTransition(() => router.push(`/etiquetar?fragment=${pos}`));
  }

  return (
    <div className="page">
      <div className="et-head">
        <div>
          <h1 style={{ marginBottom: 4 }}>Etiquetar fragmento</h1>
          <p className="lead" style={{ margin: 0 }}>
            Paquete <b>{data.package.code}</b> · Etiquetador: <b>{userName}</b> ·{' '}
            {answeredCount} de {visibleCount} dimensiones visibles respondidas
          </p>
        </div>
        <div className="prog">
          <div><span className="count">{data.doneCount}</span> / {data.total}</div>
          <div className="progress">
            <div className="bar" style={{ width: `${Math.round((data.doneCount / data.total) * 100)}%` }} />
          </div>
          <div style={{ color: 'var(--ink-3)', fontSize: 12 }}>
            {Math.round((data.doneCount / data.total) * 100)}%
          </div>
        </div>
      </div>

      <div className="et-grid">
        <div>
          <div className="card" style={{ padding: '14px 16px' }}>
            <h3 style={{ fontSize: 12.5, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink-3)' }}>
              Contexto completo
            </h3>
            <div className="context-box">
              {frag.question && (<><b>Pregunta del periodista:</b> {frag.question}{'\n\n'}</>)}
              <span className="badge-frag">Fragmento {frag.fragmentIndex} de {frag.fragmentTotal}</span>
              {'\n\n'}
              {frag.sourceText ?? frag.text}
            </div>
          </div>

          <div className="card" style={{ padding: '14px 16px', marginTop: 14 }}>
            <h3>Metadatos</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '6px 12px', fontSize: 12.5 }}>
              <span style={{ color: 'var(--ink-3)' }}>Conversación</span>
              <code style={{ wordBreak: 'break-all' }}>{frag.conversationId ?? '—'}</code>
              <span style={{ color: 'var(--ink-3)' }}>Variante</span><span>{frag.variant}</span>
              <span style={{ color: 'var(--ink-3)' }}>Longitud</span>
              <span>{frag.charLength} chars · {frag.tokenCount} tokens</span>
              <span style={{ color: 'var(--ink-3)' }}>Éxito API</span>
              <span>
                <span className={`tag ${frag.apiSuccess ? 'status-done' : 'status-blocked'}`}>
                  {frag.apiSuccess ? 'OK' : 'Error'}
                </span>
              </span>
            </div>
          </div>

          <div className="card" style={{ padding: '14px 16px', marginTop: 14 }}>
            <h3>Navegación</h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button className="btn" onClick={() => goTo(data.position - 1)} disabled={data.position <= 1 || pending}>
                ← Anterior
              </button>
              <span style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>{data.position} / {data.total}</span>
              <button className="btn" onClick={() => goTo(data.position + 1)} disabled={data.position >= data.total || pending}>
                Siguiente →
              </button>
            </div>
          </div>
        </div>

        <div>
          <div className="frag-card">
            <span className="frag-num">FRAGMENTO ACTIVO · {data.position}/{data.total}</span>
            {frag.text}
          </div>

          <div className="dims" style={{ marginTop: 16 }}>
            {nodes.map((node) => {
              const d = node.dim;
              const skipped = node.visibility === 'skipped';
              const waiting = node.visibility === 'pending-parent';
              const borderColor = skipped ? '#d1d5db' : waiting ? '#e8d49c' : d.dependency ? '#a13d3d' : '#1c8a4a';

              return (
                <div key={d.id} className="dim"
                     style={{
                       opacity: skipped ? 0.5 : 1,
                       marginBottom: 14,
                       marginLeft: node.depth * 26,
                       background: waiting
                         ? 'repeating-linear-gradient(45deg,#fafaf7,#fafaf7 8px,#f6f4ed 8px,#f6f4ed 16px)'
                         : undefined,
                       borderLeft: `3px solid ${borderColor}`,
                       borderRadius: 6,
                       padding: '12px 14px',
                     }}>
                  <div className="label">
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <b style={{ color: 'var(--ink-1)' }}>{d.name}</b>
                      <span style={{ background: dimColor(d.name), color: '#fff', fontSize: 10.5,
                                     padding: '1px 7px', borderRadius: 8 }}>
                        {d.scaleName ?? d.kind}
                      </span>
                      {skipped && (
                        <span style={{ background: '#f3f4f6', color: '#6b7280', fontSize: 10.5,
                                       padding: '2px 8px', borderRadius: 9, fontWeight: 500 }}>SKIPPED</span>
                      )}
                      {waiting && (
                        <span style={{ background: '#fdf3da', color: '#8a6300', fontSize: 10.5,
                                       padding: '2px 8px', borderRadius: 9, fontWeight: 500 }}>
                          ⏳ espera respuesta del padre
                        </span>
                      )}
                    </span>
                    {d.shortDescription && <span className="help" title={d.shortDescription}>?</span>}
                  </div>

                  {d.dependency?.label && (
                    <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 3 }}>
                      <i>Solo cuando:</i> {d.dependency.label}
                    </div>
                  )}

                  {d.kind === 'free-text' ? (
                    <textarea className="notes" rows={3} disabled={skipped}
                              style={{ width: '100%', marginTop: 8, padding: 8, border: '1px solid var(--line)',
                                       borderRadius: 6, fontFamily: 'inherit', fontSize: 13, resize: 'vertical',
                                       background: skipped ? '#fafaf7' : 'var(--surface-2)' }}
                              placeholder="Texto libre (opcional)…"
                              value={answers[d.id] ?? ''}
                              onChange={(e) => setAnswers({ ...answers, [d.id]: e.target.value })} />
                  ) : (
                    <div className="opts">
                      {d.values.map((opt) => (
                        <div key={opt}
                             className={`opt${answers[d.id] === opt ? ' selected' : ''}`}
                             style={skipped ? { pointerEvents: 'none' } : undefined}
                             onClick={() => !skipped && pick(d.id, opt)}>
                          {opt}
                        </div>
                      ))}
                      {d.values.length === 0 && (
                        <small style={{ color: 'var(--ink-4)' }}>Esta dimensión no tiene valores definidos.</small>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="card" style={{ padding: 14, marginTop: 14 }}>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center' }}>
              {notice && <span style={{ fontSize: 12.5, color: 'var(--ink-3)', marginRight: 'auto' }}>{notice}</span>}
              <button className="btn" onClick={() => save(false)} disabled={saving}>
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
              {data.position < data.total ? (
                <button className="btn primary" onClick={() => save(true)} disabled={saving}>
                  Guardar y siguiente →
                </button>
              ) : (
                <button className="btn primary" onClick={finish} disabled={saving}>
                  Enviar paquete →
                </button>
              )}
            </div>
            <p style={{ fontSize: 11.5, color: 'var(--ink-4)', margin: '10px 0 0', textAlign: 'right' }}>
              Las dimensiones marcadas SKIPPED se guardan como salto explícito, no como vacío.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
