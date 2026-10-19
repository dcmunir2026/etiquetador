'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { TaggingData } from '@/lib/queries';
import { saveAnnotations, submitPackage } from '@/app/actions/workflow';
import {
  buildCascade, flattenCascade, missingAnswers, pruneAnswers,
  type AnswerMap, type CascadeDimension,
} from '@/lib/cascade';
import { copyText } from '@/lib/clipboard';
import { EmptyState, dimColor } from './shared';

/** Validates the shape of a pasted ID or position before we bother the
 *  server with it. Numeric-only inputs are allowed: they map to the same
 *  1-based position path that `?fragment=N` already accepts. */
function isLikelyId(value: string): boolean {
  const s = value.trim();
  if (!s) return false;
  if (/^\d+$/.test(s)) return true;
  if (/^t_[a-z0-9_]+$/i.test(s)) return true;
  if (/^[A-Za-z0-9_\-.]+$/.test(s)) return true;
  if (/^[A-Za-z0-9_\-.]+#\d+$/.test(s)) return true;
  return false;
}

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
  const [showMissing, setShowMissing] = useState(false);

  // Filter Anterior/Siguiente to discrepant fragments when the package has
  // been returned. Default on for returned packages — the annotator came
  // here to fix the disagreements, not browse the corpus again.
  const [onlyDiscrepant, setOnlyDiscrepant] = useState(
    () => (data.package?.returnCount ?? 0) > 0 || data.package?.status === 'returned',
  );

  // Jump-to-ID: text typed in the Navegación card.
  const [jumpInput, setJumpInput] = useState('');
  const [jumpError, setJumpError] = useState<string | null>(null);
  // Copy-button feedback. null = nothing to show, "ok" / "fail" = brief state.
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null);

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

  // What the cascade still asks for. Highlighted only after an attempt to
  // move on, so the form does not scold before anyone has tried anything.
  const missing = useMemo(() => missingAnswers(dims, answers), [dims, answers]);
  const missingIds = useMemo(() => new Set(missing.map((d) => d.id)), [missing]);

  // Derived state for the discrepant-only navigation mode. Computed before
  // any early return so the hooks stay unconditional.
  const discrepantOrder = data.discrepantIndexes;
  const discrepantSet = useMemo(() => new Set(discrepantOrder), [discrepantOrder]);
  const currentIsDiscrepant = discrepantSet.has(data.position);
  const filteredIdx = useMemo(
    () => (currentIsDiscrepant ? discrepantOrder.indexOf(data.position) : -1),
    [currentIsDiscrepant, discrepantOrder, data.position],
  );

  if (!data.fragment || !data.package) {
    return (
      <div className="page">
        <h1>Etiquetar fragmento</h1>
        <EmptyState title="No tienes fragmentos asignados">
          Necesitas un paquete asignado en este proyecto.
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
    if (missingAnswers(dims, next).length === 0) setShowMissing(false);
  }

  /** What is still unanswered, phrased for the annotator. */
  function missingNotice(): string {
    return missing.length === 1
      ? `Falta etiquetar «${missing[0]!.name}». Lo marcado se ha guardado.`
      : `Faltan ${missing.length} dimensiones por etiquetar: ${missing.map((d) => d.name).join(', ')}. Lo marcado se ha guardado.`;
  }

  /** Persist the current fragment. Returns false when the write failed. */
  async function persist(): Promise<boolean> {
    const res = await saveAnnotations({
      projectId, fragmentId: frag.id, packageId: data.package!.id,
      answers: answers as Record<string, string>,
    });
    if (!res.ok) { setNotice(res.error); return false; }
    return true;
  }

  async function save(goNext: boolean) {
    // Save whatever is answered even when we are about to refuse to move on:
    // being told off should never cost the annotator the work already done.
    if (goNext && missing.length > 0) {
      setSaving(true);
      const ok = await persist();
      setSaving(false);
      if (!ok) return;
      setShowMissing(true);
      setNotice(missingNotice());
      return;
    }

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
    if (missing.length > 0) { await save(true); return; }

    setSaving(true);
    setNotice(null);
    // Persist this fragment first: its answers may only exist on screen, and
    // submitting would otherwise throw away the work being sent.
    if (!(await persist())) { setSaving(false); return; }

    const res = await submitPackage(data.package!.id);
    setSaving(false);
    if (!res.ok) { setNotice(res.error); return; }

    // Submission succeeded. The submitted package is now out of the user's
    // queue, so the loader will surface the next actionable one. Drop the
    // ?fragment=N query param to let getTaggingData pick the new first
    // unfinished fragment; if there is no next package the EmptyState takes
    // over.
    setNotice('Paquete enviado a validación.');
    router.push(`/etiquetar`);
  }

  /**
   * Move to another fragment.
   *
   * Navigation goes through here too, so the same rule applies as to
   * "Guardar y siguiente": the current answers are always persisted first,
   * and moving *forward* is refused while anything is unanswered. Going back
   * stays free — revisiting an earlier fragment is not skipping work.
   */
  async function goTo(pos: number) {
    if (pos < 1 || pos > data.total || pos === data.position) return;

    setSaving(true);
    const ok = await persist();
    setSaving(false);
    if (!ok) return;

    if (pos > data.position && missing.length > 0) {
      setShowMissing(true);
      setNotice(missingNotice());
      return;
    }
    setNotice(null);
    startTransition(() => router.push(`/etiquetar?fragment=${pos}`));
  }

  const filterActive = onlyDiscrepant && discrepantOrder.length > 0;

  // Anterior/Siguiente under the filter: walk the discrepant list.
  // When the filter is off, fall through to plain +1/-1.
  function step(delta: number) {
    if (!filterActive) { void goTo(data.position + delta); return; }
    if (currentIsDiscrepant) {
      const target = discrepantOrder[filteredIdx + delta];
      if (target !== undefined) void goTo(target);
      return;
    }
    // We are on a non-discrepant fragment: jump to the closest discrepant.
    const target = delta > 0
      ? discrepantOrder.find((p) => p > data.position)
      : [...discrepantOrder].reverse().find((p) => p < data.position);
    if (target !== undefined) void goTo(target);
  }

  const canPrev = !filterActive
    ? data.position > 1
    : currentIsDiscrepant
      ? filteredIdx > 0
      : discrepantOrder.some((p) => p < data.position);
  const canNext = !filterActive
    ? data.position < data.total
    : currentIsDiscrepant
      ? filteredIdx < discrepantOrder.length - 1
      : discrepantOrder.some((p) => p > data.position);

  const counterLabel = filterActive
    ? currentIsDiscrepant
      ? `${data.position} / ${data.total} · discrep. ${filteredIdx + 1}/${discrepantOrder.length}`
      : `${data.position} / ${data.total} · no discrepante`
    : `${data.position} / ${data.total}`;

  /** Submit the jump-to-ID input. Persists first, then routes. */
  function submitJump() {
    const value = jumpInput.trim();
    if (!value) { setJumpError('Escribe un ID.'); return; }
    if (!isLikelyId(value)) {
      setJumpError('Formato no válido. Usa `<convId>#<n>`, `<convId>`, o el ID opaco.');
      return;
    }
    setJumpError(null);
    // Same persist-first contract as goTo/step so we never lose work.
    void (async () => {
      setSaving(true);
      const ok = await persist();
      setSaving(false);
      if (!ok) return;
      setJumpInput('');
      startTransition(() => router.push(`/etiquetar?fragment=${encodeURIComponent(value)}`));
    })();
  }

  /** Copy the current fragment's mentionable ID. */
  async function copyFragmentId() {
    const id = data.fragmentIdentity.displayId;
    if (!id) return;
    const ok = await copyText(id);
    setCopied(ok ? 'ok' : 'fail');
    setTimeout(() => setCopied(null), 1500);
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

      {(() => {
        const wasReturned = data.package.returnCount > 0 || data.package.status === 'returned';
        if (!wasReturned) return null;
        const round = Math.max(1, data.package.version);
        const motivo = data.package.notes?.trim();
        return (
          <div
            data-testid="returned-banner"
            style={{
              marginBottom: 14, padding: '12px 14px',
              background: '#fdf6e3', border: '1px solid #e7d99a',
              borderLeft: '3px solid var(--warn)', borderRadius: '0 8px 8px 0',
              fontSize: 13, color: '#7d6c4f', lineHeight: 1.5,
            }}>
            <div style={{ fontWeight: 600 }}>
              ⚠ Paquete devuelto por el supervisor (ronda {round})
              {data.package.returnCount > 1 && ` · ${data.package.returnCount}ª devolución`}.
            </div>
            {motivo && (
              <div style={{ marginTop: 4 }}>
                Motivo: <i>"{motivo}"</i>
              </div>
            )}
            {data.discrepantIndexes.length > 0 ? (
              <div style={{ marginTop: 6 }}>
                {data.discrepantIndexes.length === 1 ? '1 fragmento discrepante.' :
                  `${data.discrepantIndexes.length} fragmentos discrepantes.`}
                {' '}
                <button
                  onClick={() => goTo(data.discrepantIndexes[0]!)}
                  disabled={pending}
                  style={{
                    background: 'none', border: 'none', padding: 0,
                    color: 'var(--primary-2)', textDecoration: 'underline',
                    cursor: pending ? 'wait' : 'pointer', font: 'inherit',
                  }}>
                  Ir al primero (nº {data.discrepantIndexes[0]}) →
                </button>
                {' '}— usa «Solo discrepantes» en Navegación para saltar sólo entre ellos.
              </div>
            ) : (
              <div style={{ marginTop: 6, color: 'var(--ink-3)' }}>
                No quedan fragmentos discrepantes — puedes reenviar el paquete cuando termines de revisarlo.
              </div>
            )}
          </div>
        );
      })()}

      <div className="et-grid">
        <div>
          <div className="card" style={{ padding: '14px 16px' }}>
            <h3 style={{ fontSize: 12.5, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink-3)' }}>
              Contexto completo
            </h3>
            <div className="context-box">
              {frag.question && (<><b>Pregunta:</b> {frag.question}{'\n\n'}</>)}
              <span className="badge-frag">Fragmento {frag.fragmentIndex} de {frag.fragmentTotal}</span>
              {'\n\n'}
              {frag.sourceText ?? frag.text}
            </div>
            {data.fragmentIdentity.displayId && (
              <div style={{
                marginTop: 10, paddingTop: 10,
                borderTop: '1px solid var(--line-soft)',
                display: 'flex', alignItems: 'center', gap: 8,
                fontSize: 12, color: 'var(--ink-3)',
              }}>
                <span style={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                  ID
                </span>
                <code style={{
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  fontSize: 12, color: 'var(--ink-1)',
                  background: 'var(--surface-2)', padding: '2px 8px', borderRadius: 4,
                }}>
                  {data.fragmentIdentity.displayId}
                </code>
                <button
                  type="button"
                  onClick={copyFragmentId}
                  title="Copiar ID"
                  style={{
                    background: 'none', border: '1px solid var(--line)',
                    borderRadius: 4, padding: '3px 8px', cursor: 'pointer',
                    fontSize: 11.5, color: 'var(--ink-2)',
                  }}>
                  {copied === 'ok' ? 'Copiado ✓' : copied === 'fail' ? 'Falló' : 'Copiar'}
                </button>
              </div>
            )}
          </div>

          <div className="card" style={{ padding: '14px 16px', marginTop: 14 }}>
            <h3>Navegación</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label
                title={discrepantOrder.length === 0
                  ? 'No hay fragmentos discrepantes para filtrar'
                  : 'Restringe Anterior/Siguiente a los fragmentos con discrepancia'}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  fontSize: 12.5, color: 'var(--ink-2)',
                  cursor: discrepantOrder.length > 0 ? 'pointer' : 'not-allowed',
                  opacity: discrepantOrder.length > 0 ? 1 : 0.5,
                }}>
                <input
                  type="checkbox"
                  checked={onlyDiscrepant && discrepantOrder.length > 0}
                  onChange={(e) => setOnlyDiscrepant(e.target.checked)}
                  disabled={discrepantOrder.length === 0}
                />
                Solo discrepantes ({discrepantOrder.length})
              </label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button className="btn" onClick={() => step(-1)} disabled={!canPrev || pending}>
                  ← Anterior
                </button>
                <span style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>{counterLabel}</span>
                <button className="btn" onClick={() => step(1)} disabled={!canNext || pending}>
                  Siguiente →
                </button>
              </div>
              <div style={{
                marginTop: 4, paddingTop: 10,
                borderTop: '1px solid var(--line-soft)',
                display: 'flex', flexDirection: 'column', gap: 4,
              }}>
                <label style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
                  Saltar a un ID
                </label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    type="text"
                    value={jumpInput}
                    onChange={(e) => { setJumpInput(e.target.value); setJumpError(null); }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        submitJump();
                      }
                    }}
                    placeholder="ej. ABC-456#2 o 5"
                    spellCheck={false}
                    autoComplete="off"
                    style={{
                      flex: 1, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                      fontSize: 12, padding: '6px 8px',
                      border: `1px solid ${jumpError ? 'var(--bad)' : 'var(--line)'}`,
                      borderRadius: 4, background: 'var(--surface-2)', color: 'var(--ink-1)',
                    }}
                  />
                  <button
                    className="btn"
                    type="button"
                    onClick={submitJump}
                    disabled={saving || pending || !jumpInput.trim()}>
                    Ir →
                  </button>
                </div>
                {jumpError && (
                  <span style={{ fontSize: 11.5, color: 'var(--bad)' }}>{jumpError}</span>
                )}
                <span style={{ fontSize: 11, color: 'var(--ink-4)' }}>
                  Formatos: <code>convId#n</code>, <code>convId</code> (1er frag.), <code>N</code> (posición)
                </span>
              </div>
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
              const pending = showMissing && missingIds.has(d.id);
              const borderColor = pending ? 'var(--bad)'
                : skipped ? '#d1d5db' : waiting ? '#e8d49c' : d.dependency ? '#a13d3d' : '#1c8a4a';

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
                       border: pending ? '1px solid var(--bad)' : undefined,
                       borderLeftWidth: 3,
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
                      {pending && (
                        <span style={{ background: '#fbe6e6', color: '#8a1a1c', fontSize: 10.5,
                                       padding: '2px 8px', borderRadius: 9, fontWeight: 600 }}>
                          sin etiquetar
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
              {notice && (
                <span style={{ fontSize: 12.5, marginRight: 'auto', fontWeight: showMissing ? 600 : 400,
                               color: showMissing ? 'var(--bad)' : 'var(--ink-3)' }}>{notice}</span>
              )}
              <button className="btn" onClick={() => save(false)} disabled={saving}>
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
              {data.position < data.total ? (
                <button className="btn primary" onClick={() => save(true)} disabled={saving}>
                  Guardar y siguiente →
                </button>
              ) : (
                <button className="btn primary" onClick={finish} disabled={saving}>
                  {data.package.returnCount > 0
                    ? `Reenviar paquete (ronda ${Math.max(1, data.package.version)}) →`
                    : 'Enviar paquete →'}
                </button>
              )}
            </div>
            <p style={{ fontSize: 11.5, color: 'var(--ink-4)', margin: '10px 0 0', textAlign: 'right' }}>
              Las dimensiones marcadas SKIPPED se guardan como salto explícito, no como vacío.
              {data.incompleteCount > 0 && (
                <>
                  <br />
                  Quedan <b style={{ color: 'var(--ink-2)' }}>{data.incompleteCount}</b> de {data.total} fragmentos
                  sin completar;{' '}
                  <button className="btn ghost" style={{ padding: 0, fontSize: 11.5, color: 'var(--primary-2)' }}
                          onClick={() => goTo(data.firstIncomplete)}>
                    ir al primero (nº {data.firstIncomplete}) →
                  </button>
                </>
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
