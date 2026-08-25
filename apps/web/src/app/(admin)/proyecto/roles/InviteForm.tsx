'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { inviteUserToProject } from './actions';

export default function InviteForm({
  projectId,
  availableRoles,
}: {
  projectId: string;
  availableRoles: readonly string[];
}) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    setOk(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await inviteUserToProject({
        projectId,
        email: String(fd.get('email') ?? ''),
        role: String(fd.get('role') ?? 'annotator'),
      });
      if (res.ok) {
        setOk('Invitación registrada.');
        (e.target as HTMLFormElement).reset();
        router.refresh();
      } else {
        setErr(res.error);
      }
    });
  }

  // For the prototype, project-admin invitations go to "projectadmin".
  // Annotators are the default. We expose all roles so the inviter can
  // downgrade an existing user if needed.
  const labels: Record<string, string> = {
    superadmin: 'Superadmin (no recomendado para asignar manualmente)',
    projectadmin: 'Project admin',
    annotator: 'Etiquetador',
    validator: 'Validador',
    viewer: 'Viewer (solo lectura)',
  };

  return (
    <form
      onSubmit={onSubmit}
      className="card"
      style={{ display: 'grid', gridTemplateColumns: '1fr 180px auto', gap: 10, alignItems: 'end' }}
    >
      <div>
        <label
          style={{
            fontSize: 12.5,
            fontWeight: 500,
            display: 'block',
            marginBottom: 5,
            color: 'var(--ink-2)',
          }}
        >
          Email de la persona a invitar
        </label>
        <input
          name="email"
          type="email"
          required
          placeholder="persona@equipo.es"
          style={{
            width: '100%',
            padding: '9px 11px',
            border: '1px solid var(--line)',
            borderRadius: 7,
            font: 'inherit',
            fontSize: 14,
          }}
        />
      </div>
      <div>
        <label
          style={{
            fontSize: 12.5,
            fontWeight: 500,
            display: 'block',
            marginBottom: 5,
            color: 'var(--ink-2)',
          }}
        >
          Rol
        </label>
        <select
          name="role"
          defaultValue="annotator"
          style={{
            width: '100%',
            padding: '9px 11px',
            border: '1px solid var(--line)',
            borderRadius: 7,
            font: 'inherit',
            fontSize: 14,
            background: 'var(--surface)',
          }}
        >
          {availableRoles
            .filter((r) => r !== 'superadmin')
            .map((r) => (
              <option key={r} value={r}>
                {labels[r] ?? r}
              </option>
            ))}
        </select>
      </div>
      <button
        type="submit"
        className="btn primary"
        disabled={pending}
        aria-busy={pending}
        style={{ height: 40 }}
      >
        {pending ? 'Invitando…' : 'Invitar'}
      </button>
      {err ? (
        <div
          style={{
            gridColumn: '1 / -1',
            background: 'var(--danger-bg)',
            color: 'var(--danger)',
            border: '1px solid #e6c4c4',
            borderRadius: 7,
            padding: '8px 11px',
            fontSize: 12.5,
            marginTop: 4,
          }}
        >
          {err}
        </div>
      ) : null}
      {ok ? (
        <div
          style={{
            gridColumn: '1 / -1',
            background: 'var(--success-bg)',
            color: 'var(--success)',
            border: '1px solid #c5e3d2',
            borderRadius: 7,
            padding: '8px 11px',
            fontSize: 12.5,
            marginTop: 4,
          }}
        >
          {ok}
        </div>
      ) : null}
    </form>
  );
}
