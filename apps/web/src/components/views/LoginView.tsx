'use client';
import { useRouter } from 'next/navigation';

export function LoginView() {
  const router = useRouter();
  return (
    <section className="view" id="view-login" style={{ display: 'block' }}>
      <div className="login-wrap">
        <div className="login-art">
          <div className="art-text">
            <h2>El sesgo se mide, no se opina.</h2>
            <p>Plataforma de etiquetado y validación para el LLM Juez de Europa Press. Cada fragmento pasa por dos etiquetadores, se valida y se consolida en un dataset auditable.</p>
          </div>
        </div>
        <div className="login-form">
          <div className="panel">
            <h1>Entrar</h1>
            <p className="lead">Acceso restringido al equipo de etiquetado.</p>
            <label>Email</label>
            <input type="email" defaultValue="marta.rodriguez@epdata.es" />
            <label>Contraseña</label>
            <input type="password" defaultValue="••••••••••" />
            <div className="row">
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', margin: 0 }}>
                <input type="checkbox" defaultChecked /> Recordarme
              </label>
              <a href="#" style={{ color: 'var(--primary-2)' }}>¿Olvidaste la contraseña?</a>
            </div>
            <button className="btn primary" style={{ width: '100%', justifyContent: 'center', padding: 10 }} onClick={() => router.push('/?view=dashboard')}>Entrar</button>
            <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--ink-3)', marginTop: 18 }}>Acceso mediante SSO corporativo de Europa Press disponible.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
