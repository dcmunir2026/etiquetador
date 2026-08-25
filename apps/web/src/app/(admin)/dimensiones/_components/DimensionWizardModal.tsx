'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import DimensionForm, { type DimensionInitial } from './DimensionForm';
import type { Scale } from './types';

export type ModalTarget =
  | { mode: 'new' }
  | { mode: 'edit'; initial: DimensionInitial }
  | null;

export default function DimensionWizardModal({
  target,
  scales,
  onClose,
}: {
  target: ModalTarget;
  scales: Scale[];
  onClose: () => void;
}) {
  // Lock body scroll while the modal is open.
  useEffect(() => {
    if (!target) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [target]);

  // Close on Escape.
  useEffect(() => {
    if (!target) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [target, onClose]);

  if (!target) return null;
  if (typeof document === 'undefined') return null;

  const title =
    target.mode === 'new' ? 'Crear nueva dimensión' : `Editar dimensión`;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-card">
        <div className="modal-head">
          <div>
            <h2 className="modal-title">{title}</h2>
            <p className="modal-lead">
              {target.mode === 'new'
                ? 'Las dimensiones son globales. Una vez creada, puedes asignarla a cualquier proyecto.'
                : 'Cambia los datos básicos. La escala y los valores se mantienen salvo que la cambies explícitamente.'}
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
          <DimensionForm
            scales={scales}
            isSuperAdmin
            initial={target.mode === 'edit' ? target.initial : undefined}
            onDone={onClose}
            compact
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
