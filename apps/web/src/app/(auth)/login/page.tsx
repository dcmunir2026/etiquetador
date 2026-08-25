import { redirect } from 'next/navigation';
import { auth, signIn } from '@/lib/auth';
import LoginForm from './LoginForm';

export const metadata = { title: 'Entrar · Etiquetador' };

type SP = { error?: string; callbackUrl?: string };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SP;
}) {
  const session = await auth();
  if (session?.user) {
    redirect(searchParams.callbackUrl ?? '/');
  }
  return (
    <>
      <div className="auth-art">
        <div className="art-text">
          <h2>El sesgo se mide, no se opina.</h2>
          <p>
            Plataforma de etiquetado y validación para el LLM Juez de Europa Press.
            Cada fragmento pasa por dos etiquetadores, se valida y se consolida
            en un dataset auditable.
          </p>
        </div>
      </div>
      <div className="auth-form">
        <div className="panel">
          <h1>Entrar</h1>
          <p className="lead">Acceso restringido al equipo de etiquetado.</p>
          <LoginForm error={searchParams.error} callbackUrl={searchParams.callbackUrl} />
          <p className="foot">
            Acceso mediante SSO corporativo de Europa Press disponible.
          </p>
        </div>
      </div>
    </>
  );
}
