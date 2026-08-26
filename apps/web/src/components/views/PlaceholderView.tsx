'use client';

export function PlaceholderView({ name }: { name: string }) {
  return (
    <div className="page">
      <h1 style={{ textTransform: 'capitalize' }}>{name}</h1>
      <p className="lead">Esta vista está en construcción. Mira el roadmap del repo.</p>
      <div className="card">
        <p style={{ color: 'var(--ink-3)', fontSize: 13, margin: 0 }}>
          Próximamente: implementación completa siguiendo las HU (H0-H21) en <code style={{ background: '#f6f4ed', padding: '1px 5px', borderRadius: 3 }}>docs/ROADMAP.md</code>.
        </p>
      </div>
    </div>
  );
}
