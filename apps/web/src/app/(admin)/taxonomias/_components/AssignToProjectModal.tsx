'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { setProjectTaxonomies } from '../../proyecto/taxonomias/actions/actions';

export type ProjectOption = {
  id: string;
  name: string;
  slug: string;
  isAlreadyAssigned: boolean;
};

export default function AssignToProjectModal({
  taxonomyId,
  taxonomyName,
  projects,
  onClose,
}: {
  taxonomyId: string;
  taxonomyName: string;
  projects: ProjectOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  function toggle(id: string) {
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function onSubmit() {
    setErr(null);
    setOk(null);
    if (picked.length === 0) {
      setErr('Selecciona al menos un proyecto');
      return;
    }
    startTransition(async () => {
      // For each picked project, set its taxonomies to include this one
      // and preserve the rest. We do this per-project so we don't wipe
      // the other taxonomies already assigned.
      let first = true;
      for (const projectId of picked) {
        const current = projects
          .filter((p) => p.isAlreadyAssigned || p.id === projectId)
          .map((p) => p.id);
        const next = current.includes(taxonomyId) ? current : [...current, taxonomyId];
        const res = await setProjectTaxonomies({ projectId, taxonomyIds: next });
        if (!res.ok) {
          setErr(res.error);
          return;
        }
        if (first) {
          setOk(`Asignado a ${picked.length} proyecto(s).`);
          first = false;
        }
      }
      router.refresh();
      setTimeout(() => onClose(), 400);
    });
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Asignar ${taxonomyName} a proyectos`}
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-card" style={{ maxWidth: 520 }}>
        <div className="modal-head">
          <div>
            <h2 className="modal-title">Asignar a proyectos</h2>
            <p className="modal-lead">
              Marca los proyectos donde quieres usar la taxonomía <b>{taxonomyName}</b>. Los
              proyectos ya asignados aparecen marcados.
            </p>
          </div>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>
        <div className="modal-body">
          {projects.length === 0 ? (
            <div className="empty">
              No hay proyectos activos. Crea uno primero en <a href="/proyectos">Proyectos</a>.
            </div>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
              {projects.map((p) => {
                const isPicked = picked.includes(p.id) || p.isAlreadyAssigned;
                return (
                  <li key={p.id}>
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '10px 12px',
                        background: isPicked ? 'var(--surface-2)' : 'var(--surface)',
                        border: `1px solid ${isPicked ? 'var(--primary-2)' : 'var(--line)'}`,
                        borderRadius: 8,
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isPicked}
                        onChange={() => !p.isAlreadyAssigned && toggle(p.id)}
                        disabled={p.isAlreadyAssigned}
                        aria-label={`Asignar a ${p.name}`}
                      />
                      <span style={{ flex: 1 }}>
                        <span style={{ display: 'block', fontWeight: 500, color: 'var(--ink-1)', fontSize: 13.5 }}>
                          {p.name}
                        </span>
                        <span style={{ display: 'block', fontSize: 11, color: 'var(--ink-3)' }}>
                          <code>{p.slug}</code>
                          {p.isAlreadyAssigned ? (
                            <span style={{ marginLeft: 8, color: 'var(--success)' }}>
                              ya asignada
                            </span>
                          ) : null}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          {err ? (
            <div
              style={{
                background: 'var(--danger-bg)',
                color: 'var(--danger)',
                border: '1px solid #e6c4c4',
                borderRadius: 7,
                padding: '9px 12px',
                fontSize: 12.5,
                marginTop: 12,
              }}
            >
              {err}
            </div>
          ) : null}
          {ok ? (
            <div
              style={{
                background: 'var(--success-bg)',
                color: 'var(--success)',
                border: '1px solid #c5e3d2',
                borderRadius: 7,
                padding: '9px 12px',
                fontSize: 12.5,
                marginTop: 12,
              }}
            >
              {ok}
            </div>
          ) : null}
        </div>
        <div className="wizard-footer">
          <button type="button" className="btn" onClick={onClose} disabled={pending}>
            Cancelar
          </button>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            className="btn primary"
            onClick={onSubmit}
            disabled={pending || picked.length === 0}
            aria-busy={pending}
          >
            {pending ? 'Asignando…' : `Asignar${picked.length > 0 ? ` (${picked.length})` : ''}`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
