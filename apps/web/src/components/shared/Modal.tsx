'use client';

import { useEffect, type ReactNode } from 'react';

/**
 * Centered overlay. Click outside or press Escape to close.
 *
 * Extracted from TeamDiscrepanciesView so any view/modal can reuse it
 * without reaching across to a screen file. The original "← Volver"
 * affordance is preserved as the explicit close button.
 */
export function Modal({
  title,
  subtitle,
  right,
  children,
  onClose,
  maxWidth = 900,
}: {
  title: string;
  subtitle?: string;
  right?: string;
  children: ReactNode;
  onClose: () => void;
  maxWidth?: number;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  function onBackdrop(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div
      onClick={onBackdrop}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(20,23,30,0.55)', zIndex: 71,
        backdropFilter: 'blur(2px)', overflowY: 'auto',
      }}
    >
      <div
        style={{
          background: 'var(--surface)', width: '100%', maxWidth, margin: '24px auto',
          borderRadius: 14, display: 'flex', flexDirection: 'column',
          maxHeight: 'calc(100vh - 48px)', overflow: 'hidden', border: '1px solid var(--line)',
        }}
      >
        <div style={{
          padding: '18px 24px', borderBottom: '1px solid var(--line-soft)',
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <button className="btn ghost" onClick={onClose} style={{ padding: '6px 10px' }}>
            ← Volver
          </button>
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em',
              color: 'var(--ink-3)', fontWeight: 600,
            }}>
              {title}
            </div>
            {subtitle && (
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink-1)' }}>
                {subtitle}
              </div>
            )}
          </div>
          {right && <div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>{right}</div>}
        </div>
        <div style={{
          padding: '20px 24px', overflowY: 'auto', flex: '1 1 auto', minHeight: 0,
          background: 'var(--bg)',
        }}>
          {children}
        </div>
      </div>
    </div>
  );
}
