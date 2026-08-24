'use client';

import { useState, useTransition } from 'react';
import { signupAction } from './actions';

export default function SignupForm() {
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    const fd = new FormData(e.currentTarget);
    if (fd.get('password') !== fd.get('passwordConfirm')) {
      setErr('Las contraseñas no coinciden.');
      return;
    }
    startTransition(async () => {
      const result = await signupAction(fd);
      if (result?.error) setErr(result.error);
    });
  }

  return (
    <form onSubmit={onSubmit}>
      {err ? <div className="err">{err}</div> : null}
      <label htmlFor="name">Nombre</label>
      <input id="name" name="name" type="text" autoComplete="name" required />
      <label htmlFor="email">Email</label>
      <input id="email" name="email" type="email" autoComplete="email" required />
      <label htmlFor="password">Contraseña (mín. 8 caracteres)</label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        required
      />
      <label htmlFor="passwordConfirm">Repetir contraseña</label>
      <input
        id="passwordConfirm"
        name="passwordConfirm"
        type="password"
        autoComplete="new-password"
        minLength={8}
        required
      />
      <button
        type="submit"
        className="btn primary submit"
        disabled={pending}
        aria-busy={pending}
        style={{ marginTop: 8 }}
      >
        {pending ? 'Creando…' : 'Crear cuenta'}
      </button>
    </form>
  );
}
