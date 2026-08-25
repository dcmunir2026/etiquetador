'use client';

import { useState, useTransition } from 'react';
import { loginAction } from './actions';

export default function LoginForm({
  error,
  callbackUrl,
}: {
  error?: string;
  callbackUrl?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [localErr, setLocalErr] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLocalErr(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await loginAction(fd);
      if (result?.error) setLocalErr(result.error);
    });
  }

  const message = localErr ?? (error ? 'Credenciales incorrectas.' : null);

  return (
    <form onSubmit={onSubmit}>
      {message ? <div className="err">{message}</div> : null}
      <label htmlFor="email">Email</label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        required
        defaultValue=""
      />
      <label htmlFor="password">Contraseña</label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
      />
      <div className="row">
        <label>
          <input type="checkbox" name="remember" defaultChecked /> Recordarme
        </label>
        <a href="#" style={{ color: 'var(--primary-2)' }}>
          ¿Olvidaste la contraseña?
        </a>
      </div>
      {callbackUrl ? (
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
      ) : null}
      <button
        type="submit"
        className="btn primary submit"
        disabled={pending}
        aria-busy={pending}
      >
        {pending ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  );
}
