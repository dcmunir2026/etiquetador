'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { loginAction, type LoginState } from './actions';

const INITIAL: LoginState = { error: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn primary" type="submit" disabled={pending}
            style={{ width: '100%', justifyContent: 'center', padding: 10 }}>
      {pending ? 'Entrando…' : 'Entrar'}
    </button>
  );
}

export function LoginForm() {
  const [state, formAction] = useFormState(loginAction, INITIAL);

  return (
    <form action={formAction}>
      <label htmlFor="email">Email</label>
      <input id="email" name="email" type="email" autoComplete="username"
             required autoFocus placeholder="nombre@epdata.es" />

      <label htmlFor="password">Contraseña</label>
      <input id="password" name="password" type="password"
             autoComplete="current-password" required placeholder="••••••••••" />

      {state.error && (
        <div role="alert" style={{ margin: '12px 0 0', padding: '9px 12px', background: '#fbe6e6',
                                   border: '1px solid #e8c5c5', borderLeft: '3px solid var(--bad)',
                                   borderRadius: '0 6px 6px 0', fontSize: 12.5, color: '#5a2222' }}>
          {state.error}
        </div>
      )}

      <div className="row">
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', margin: 0 }}>
          <input type="checkbox" name="remember" defaultChecked /> Recordarme
        </label>
        <span style={{ color: 'var(--ink-4)', fontSize: 12 }}>
          ¿Olvidaste la contraseña? Pide a un administrador que la restablezca.
        </span>
      </div>

      <SubmitButton />
    </form>
  );
}
