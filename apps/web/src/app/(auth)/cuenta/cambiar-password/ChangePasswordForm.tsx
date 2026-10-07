'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { changePasswordAction } from './actions';

function SubmitButton({ label, pending }: { label: string; pending: boolean }) {
  return (
    <button className="btn primary" type="submit" disabled={pending}
            style={{ width: '100%', justifyContent: 'center', padding: 10 }}>
      {pending ? 'Guardando…' : label}
    </button>
  );
}

export function ChangePasswordForm({ forced }: { forced: boolean }) {
  // We can't use useFormState here: on success changePasswordAction calls
  // redirect(), which throws NEXT_REDIRECT. When that throw bubbles up
  // through useFormState's reducer, React receives no return value and
  // the form's state ends up undefined — the submit button stays
  // disabled forever and a second click does nothing. We hit that bug
  // once already; the comment in actions.ts:34-37 documents the same.
  //
  // useTransition is the React 18 pattern for "submit a server action
  // that may navigate". React catches the NEXT_REDIRECT throw inside
  // the transition and lets Next.js's router pick it up, while still
  // reporting isPending so the button can disable itself. Errors that
  // the action returns explicitly are surfaced via local useState.
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await changePasswordAction(formData);
      // Success path: changePasswordAction never returns — redirect()
      // throws and the transition absorbs it. If we got here with a
      // result, the action returned { error } and we surface it.
      if (result && 'error' in result) {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit}>
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

      <SubmitButton label={forced ? 'Cambiar y entrar' : 'Guardar contraseña'} pending={isPending} />
    </form>
  );
}