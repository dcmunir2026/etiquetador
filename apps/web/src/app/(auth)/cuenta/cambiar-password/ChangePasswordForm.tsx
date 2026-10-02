'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { changePasswordAction, type ChangePasswordResult } from './actions';

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn primary" type="submit" disabled={pending}
            style={{ width: '100%', justifyContent: 'center', padding: 10 }}>
      {pending ? 'Guardando…' : label}
    </button>
  );
}

export function ChangePasswordForm({ forced }: { forced: boolean }) {
  const [error, setError] = useState<string | null>(null);

  // Direct server action call. We do NOT use `useFormState` here because
  // the action calls `redirect()` on success (throws NEXT_REDIRECT),
  // which is incompatible with the reducer shape expected by
  // useFormState — the resulting `state` is undefined and crashes the
  // form render. We track our own error state instead and surface
  // validation failures returned by the action.
  async function handle(formData: FormData) {
    setError(null);
    let res: ChangePasswordResult | undefined;
    try {
      res = await changePasswordAction(formData);
    } catch {
      // Server actions call `redirect()` on success, which throws
      // NEXT_REDIRECT — Next.js handles that and navigates the page
      // away. Any other throw is unexpected; the browser is about to
      // navigate or the page is broken — either way, leaving the form
      // alone is the safest response.
      return;
    }
    if (res && typeof res === 'object' && 'error' in res && res.error) {
      setError(res.error);
    }
  }

  return (
    <form action={handle}>
      <input type="hidden" name="forced" value={forced ? 'true' : 'false'} />

      {forced && (
        <>
          <label htmlFor="current">Contraseña actual</label>
          <input id="current" name="current" type="password"
                 autoComplete="current-password" required
                 placeholder={forced ? 'etiquetador' : '••••••••••'} />
        </>
      )}

      <label htmlFor="new">Nueva contraseña</label>
      <input id="new" name="new" type="password"
             autoComplete="new-password" required minLength={8}
             placeholder="Mínimo 8 caracteres" />

      <label htmlFor="confirm">Repite la nueva contraseña</label>
      <input id="confirm" name="confirm" type="password"
             autoComplete="new-password" required minLength={8} />

      {error && (
        <div role="alert" style={{ margin: '12px 0 0', padding: '9px 12px', background: '#fbe6e6',
                                   border: '1px solid #e8c5c5', borderLeft: '3px solid var(--bad)',
                                   borderRadius: '0 6px 6px 0', fontSize: 12.5, color: '#5a2222' }}>
          {error}
        </div>
      )}

      <SubmitButton label={forced ? 'Cambiar y entrar' : 'Guardar contraseña'} />
    </form>
  );
}