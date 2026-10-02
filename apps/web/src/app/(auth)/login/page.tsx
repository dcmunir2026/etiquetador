import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = { title: 'Entrar — Etiquetador' };
export const dynamic = 'force-dynamic';

/** Sign-in screen. Rendered outside the app shell: no sidebar, no topbar. */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: { reason?: string };
}) {
  // Already signed in? There is nothing to do here.
  if (await getCurrentUser()) redirect('/');

  const justChanged = searchParams.reason === 'password-changed';

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
          {justChanged && (
            <div role="status" style={{ marginBottom: 14, padding: '10px 13px',
                                        background: '#e6f4ea', border: '1px solid #b6dcc1',
                                        borderLeft: '3px solid var(--ok)',
                                        borderRadius: '0 6px 6px 0',
                                        fontSize: 12.5, color: '#1f5132' }}>
              Contraseña actualizada. Inicia sesión con tu nueva contraseña.
            </div>
          )}
          <LoginForm />
          <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--ink-3)', marginTop: 18 }}>
            Las cuentas las crea un administrador desde <b>Roles y equipos</b>.
          </p>
        </div>
      </div>
    </div>
  );
}
