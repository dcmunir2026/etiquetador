'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createProject } from './actions';

export default function NewProjectForm({
  canCreate,
}: {
  canCreate: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    const fd = new FormData(e.currentTarget);
    const input = {
      name: String(fd.get('name') ?? ''),
      description: String(fd.get('description') ?? '') || undefined,
    };
    startTransition(async () => {
      const res = await createProject(input);
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setErr(res.error);
      }
    });
  }

  if (!canCreate) {
    return (
      <span className="badge gray" title="Solo el superadmin puede crear proyectos">
        Crear (requiere superadmin)
      </span>
    );
  }

  return (
    <>
      <button className="btn primary" onClick={() => setOpen(true)} disabled={open}>
        + Nuevo proyecto
      </button>
      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(20,23,30,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--line)',
              borderRadius: 12,
              padding: 24,
              width: 460,
              maxWidth: '90vw',
              boxShadow: '0 12px 40px rgba(0,0,0,0.2)',
            }}
          >
            <h2 style={{ margin: '0 0 4px', fontSize: 20 }}>Nuevo proyecto</h2>
            <p className="lead" style={{ marginBottom: 18 }}>
              Crea un proyecto y te añadiremos como project admin automáticamente.
            </p>
            <form onSubmit={onSubmit}>
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
              <label
                style={{
                  fontSize: 12.5,
                  fontWeight: 500,
                  display: 'block',
                  marginBottom: 5,
                  color: 'var(--ink-2)',
                }}
              >
                Nombre
              </label>
              <input
                name="name"
                type="text"
                required
                minLength={2}
                maxLength={80}
                style={{
                  width: '100%',
                  padding: '9px 11px',
                  border: '1px solid var(--line)',
                  borderRadius: 7,
                  marginBottom: 12,
                  font: 'inherit',
                  fontSize: 14,
                }}
              />
              <label
                style={{
                  fontSize: 12.5,
                  fontWeight: 500,
                  display: 'block',
                  marginBottom: 5,
                  color: 'var(--ink-2)',
                }}
              >
                Descripción (opcional)
              </label>
              <textarea
                name="description"
                maxLength={500}
                rows={3}
                style={{
                  width: '100%',
                  padding: '9px 11px',
                  border: '1px solid var(--line)',
                  borderRadius: 7,
                  marginBottom: 16,
                  font: 'inherit',
                  fontSize: 13,
                  resize: 'vertical',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setOpen(false)}
                  disabled={pending}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn primary"
                  disabled={pending}
                  aria-busy={pending}
                >
                  {pending ? 'Creando…' : 'Crear proyecto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
