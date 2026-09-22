'use client';

import { useState } from 'react';
import { redeemInvitation } from '@/app/actions/invitations';

/**
 * Password-set form for the invitation redemption page.
 *
 * On submit we hand off to the server action, which hashes & stores the
 * password, marks the token used, then signs the user in via Auth.js
 * (redirecting to `/`). On validation errors we surface them inline.
 */
export function RedeemForm({
  token, email, name, projectName,
}: {
  token: string; email: string; name: string; projectName: string;
}) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setBusy(true);
    const res = await redeemInvitation({ token, password });
    // Next, signIn inside `redeemInvitation` always redirects, so an
    // `ActionResult` here only means a validation failure.
    if (res && !res.ok) {
      setError(res.error);
      setBusy(false);
    }
  }

  return (
    <>
      <div style={{
        background: '#eaf2f8', border: '1px solid #cfe0ea', borderRadius: 8,
        padding: '12px 14px', margin: '4px 0 18px', fontSize: 12.5, lineHeight: 1.5,
        color: '#0d3656',
      }}>
        <div><b>{name}</b></div>
        <div style={{ color: '#3a4256' }}>{email}</div>
        <div style={{ color: '#3a4256', marginTop: 4 }}>Proyecto: <b>{projectName}</b></div>
      </div>

      <label>Contraseña</label>
      <input
        type="password"
        autoComplete="new-password"
        autoFocus
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
      />

      <label>Repite la contraseña</label>
      <input
        type="password"
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
      />

      {error && (
        <div style={{
          color: '#a13d3d', fontSize: 12.5, marginTop: 6, marginBottom: 10,
        }}>
          {error}
        </div>
      )}

      <button
        type="submit"
        className="btn primary"
        disabled={busy || !password}
        onClick={submit}
        style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
      >
        {busy ? 'Entrando…' : 'Crear cuenta y entrar'}
      </button>
    </>
  );
}
