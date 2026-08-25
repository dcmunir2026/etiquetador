'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { changeUserRole, removeUserFromProject } from './actions';

const ROLE_LABELS: Record<string, string> = {
  superadmin: 'Superadmin',
  projectadmin: 'Project admin',
  annotator: 'Etiquetador',
  validator: 'Validador',
  viewer: 'Viewer',
};

const ROLE_BADGE: Record<string, string> = {
  superadmin: 'amber',
  projectadmin: 'blue',
  annotator: 'green',
  validator: 'gray',
  viewer: 'gray',
};

export default function MemberRow({
  projectId,
  userId,
  name,
  email,
  role,
  avatarColor,
  canManage,
  isMe,
}: {
  projectId: string;
  userId: string;
  name: string | null;
  email: string;
  role: string;
  avatarColor: string | null;
  canManage: boolean;
  isMe: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const initials = (name || email).split(/[\s@.]/).filter(Boolean).slice(0, 2).map((s) => s[0]!.toUpperCase()).join('') || '?';

  function onChangeRole(e: React.ChangeEvent<HTMLSelectElement>) {
    const newRole = e.target.value;
    if (newRole === role) return;
    setErr(null);
    startTransition(async () => {
      const res = await changeUserRole({ projectId, userId, role: newRole });
      if (res.ok) {
        router.refresh();
      } else {
        setErr(res.error);
        e.target.value = role; // revert
      }
    });
  }

  function onRemove() {
    if (isMe) return;
    if (!confirm(`¿Eliminar a ${name || email} del proyecto?`)) return;
    setErr(null);
    startTransition(async () => {
      const res = await removeUserFromProject({ projectId, userId });
      if (res.ok) {
        router.refresh();
      } else {
        setErr(res.error);
      }
    });
  }

  return (
    <tr>
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            className="av-32"
            style={{
              background: avatarColor ?? 'var(--sidebar-accent)',
              color: '#1a1a1a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: 12,
            }}
            aria-hidden
          >
            {initials}
          </div>
          <div>
            <div style={{ fontWeight: 600, color: 'var(--ink-1)' }}>
              {name || email}
              {isMe ? (
                <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--ink-3)' }}>(tú)</span>
              ) : null}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
              {ROLE_LABELS[role] ?? role}
            </div>
          </div>
        </div>
        {err ? (
          <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 4 }}>{err}</div>
        ) : null}
      </td>
      <td style={{ color: 'var(--ink-2)' }}>{email}</td>
      <td>
        {canManage && !isMe ? (
          <select
            value={role}
            onChange={onChangeRole}
            disabled={pending}
            style={{
              padding: '5px 8px',
              border: '1px solid var(--line)',
              borderRadius: 6,
              font: 'inherit',
              fontSize: 12.5,
              background: 'var(--surface)',
            }}
          >
            {['projectadmin', 'annotator', 'validator', 'viewer'].map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r] ?? r}
              </option>
            ))}
            {role === 'superadmin' ? (
              <option value="superadmin">Superadmin</option>
            ) : null}
          </select>
        ) : (
          <span className={'badge ' + (ROLE_BADGE[role] ?? 'gray')}>
            {ROLE_LABELS[role] ?? role}
          </span>
        )}
      </td>
      <td style={{ fontSize: 12, color: 'var(--ink-3)' }}>—</td>
      <td>
        {canManage && !isMe ? (
          <button
            className="btn sm"
            onClick={onRemove}
            disabled={pending}
            aria-busy={pending}
            style={{ color: 'var(--danger)' }}
            title="Eliminar del proyecto"
          >
            {pending ? '…' : 'Quitar'}
          </button>
        ) : null}
      </td>
    </tr>
  );
}
