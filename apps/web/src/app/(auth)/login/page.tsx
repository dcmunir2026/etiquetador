import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = { title: 'Entrar — Etiquetador' };
export const dynamic = 'force-dynamic';

/** Sign-in screen. Rendered outside the app shell: no sidebar, no topbar. */
export default async function LoginPage() {
  // Already signed in? There is nothing to do here.
  if (await getCurrentUser()) redirect('/');

  return (
    <div className="login-wrap">
      <div className="login-art">
        <div className="art-text">
          <h2>El sesgo se mide, no se opina.</h2>
          <p>
            Plataforma de etiquetado y validación para el LLM Juez de Europa Press. Cada fragmento
            pasa por varios etiquetadores, se valida y se consolida en un dataset auditable.
          </p>
        </div>
      </div>
      <div className="login-form">
        <div className="panel">
          <h1>Entrar</h1>
          <p className="lead">Acceso restringido al equipo de etiquetado.</p>
          <LoginForm />
          <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--ink-3)', marginTop: 18 }}>
            Las cuentas las crea un administrador desde <b>Roles y equipos</b>.
          </p>
        </div>
      </div>
    </div>
  );
}
