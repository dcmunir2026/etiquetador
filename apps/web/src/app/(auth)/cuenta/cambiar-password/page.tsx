import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import { ChangePasswordForm } from './ChangePasswordForm';

export const metadata: Metadata = { title: 'Cambiar contraseña — Etiquetador' };
export const dynamic = 'force-dynamic';

/**
 * Single change-password screen with two modes:
 *  - Forced: mustChangePassword=true. The user must provide their current
 *    password (default `etiquetador` for brand-new accounts) plus a new
 *    one. After submitting we sign them out and send them back to
 *    /login so the JWT is reissued with mustChangePassword=false.
 *  - Voluntary: mustChangePassword=false. Same screen, but we don't ask
 *    for the current password — the session itself is proof enough.
 */
export default async function ChangePasswordPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const forced = user.mustChangePassword === true;

  return (
    <div className="login-wrap">
      <div className="login-art">
        <div className="art-text">
          <h2>Tu contraseña es personal.</h2>
          <p>
            Si tu cuenta fue creada con una contraseña temporal, cámbiala ahora antes de empezar a
            trabajar. Si solo quieres actualizar la tuya, también puedes hacerlo desde aquí.
          </p>
        </div>
      </div>
      <div className="login-form">
        <div className="panel">
          <h1>Cambiar contraseña</h1>
          {forced ? (
            <p className="lead">
              Tu cuenta usa una contraseña temporal. Define una nueva para poder empezar a etiquetar.
            </p>
          ) : (
            <p className="lead">Establece una nueva contraseña para tu cuenta.</p>
          )}
          <ChangePasswordForm forced={forced} />
        </div>
      </div>
    </div>
  );
}