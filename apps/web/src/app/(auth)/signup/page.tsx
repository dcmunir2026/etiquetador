import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import SignupForm from './SignupForm';

export const metadata = { title: 'Crear cuenta · Etiquetador' };

export default async function SignupPage() {
  const session = await auth();
  if (session?.user) redirect('/');
  return (
    <>
      <div className="auth-art">
        <div className="art-text">
          <h2>Únete al equipo de etiquetado.</h2>
          <p>
            Crea tu cuenta para anotar, validar y consolidar las respuestas del
            LLM Juez de Europa Press.
          </p>
        </div>
      </div>
      <div className="auth-form">
        <div className="panel">
          <h1>Crear cuenta</h1>
          <p className="lead">Necesitarás aprobación del super admin para acceder a proyectos.</p>
          <SignupForm />
          <p className="foot">
            ¿Ya tienes cuenta? <a href="/login" style={{ color: 'var(--primary-2)' }}>Entrar</a>
          </p>
        </div>
      </div>
    </>
  );
}
