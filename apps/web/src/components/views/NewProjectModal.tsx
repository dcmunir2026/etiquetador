'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/shared/Modal';
import { createProject } from '@/app/actions/projects';

/**
 * Modal "Nuevo proyecto".
 *
 * The dashboard's empty state and the topbar button both funnel here. After
 * the server action succeeds, we hard-navigate into the new project's
 * configuration screen — `revalidatePath('/', 'layout')` alone is not enough
 * because the active-project cookie also drives the navigation.
 */
export function NewProjectModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset on every open and put the cursor in the name field.
  useEffect(() => {
    if (!open) return;
    setName('');
    setDescription('');
    setError(null);
    setBusy(false);
    const t = setTimeout(() => nameRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  const slugPreview = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || '—';

  async function submit() {
    if (!name.trim()) {
      setError('El nombre es obligatorio.');
      return;
    }
    setBusy(true);
    setError(null);
    const res = await createProject({ name, description });
    if (!res.ok) {
      setError(res.error);
      setBusy(false);
      return;
    }
    // Action already set the active-project cookie and revalidated.
    onClose();
    router.push('/dimensiones');
    router.refresh();
  }

  if (!open) return null;

  return (
    <Modal
      title="Configuración"
      subtitle="Nuevo proyecto"
      onClose={onClose}
      maxWidth={520}
    >
      <div className="wiz-row">
        <label>Nombre <span style={{ color: '#c0392b' }}>*</span></label>
        <input
          ref={nameRef}
          type="text"
          placeholder="Ej. Sesgos Q3 2026"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={busy}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
      </div>

      <div className="wiz-row">
        <label>Descripción breve</label>
        <textarea
          placeholder="Qué cubre este proyecto. Opcional."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={busy}
          style={{ minHeight: 70 }}
        />
      </div>

      <div className="wiz-row">
        <label>Slug</label>
        <input
          type="text"
          value={slugPreview}
          readOnly
          style={{ background: '#f6f4ed', color: 'var(--ink-3)', cursor: 'default' }}
        />
        <small style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 4 }}>
          Identificador URL del proyecto (se rellena solo; si choca se le añade -2, -3, …).
        </small>
      </div>

      {error && (
        <div style={{ color: 'var(--bad)', fontSize: 12.5, marginTop: 10 }}>{error}</div>
      )}

      <div style={{
        display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18,
        paddingTop: 14, borderTop: '1px solid var(--line-soft)',
      }}>
        <button className="btn" onClick={onClose} disabled={busy}>Cancelar</button>
        <button className="btn primary" onClick={submit} disabled={busy || !name.trim()}>
          {busy ? 'Creando…' : 'Crear proyecto'}
        </button>
      </div>
    </Modal>
  );
}
