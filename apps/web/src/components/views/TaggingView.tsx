'use client';
import { useState } from 'react';

export function TaggingView() {
  const [values, setValues] = useState<Record<string, string>>({});

  const dimCards = [
    { id: 'sesgo', name: 'Sesgo estadístico', icon: '1', color: 'tk-stat',
      values: ['Correcto', 'Duda', 'Incorrecto'] },
    { id: 'emoc', name: 'Emotividad', icon: '2', color: 'tk-emot',
      values: ['Neutra', 'Valorativa', 'Cargada'] },
    { id: 'tenden', name: 'Carácter tendencioso', icon: '3', color: 'tk-tend',
      values: ['Imparcial', 'Sutil', 'Claro'] },
    { id: 'semio', name: 'Semiótica', icon: '4', color: 'tk-semi',
      values: ['Ninguna', 'Lenguaje figurado', 'Ironía/sarcasmo'] },
    { id: 'genero', name: 'Género', icon: '5', color: 'tk-gen',
      values: ['Neutral', 'Sutil', 'Manifiesto'] },
  ];

  const TK: Record<string, string> = {
    'tk-stat':'#5a7d8f','tk-emot':'#a85a35','tk-tend':'#7d6c4f','tk-semi':'#3d8268','tk-gen':'#5b8fb8',
  };

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>Fragmento 17 / 50</h1>
          <p className="lead" style={{ margin: 0 }}>Paquete <b>P3 · Espejo</b> · 3 etiquetadores · quedan <b>2 votos</b> sin emitir</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="tag status-progress">Borrador local</span>
          <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Auto-guardado hace 2s</span>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1.1fr 1fr', gap: 16 }}>
        <div className="card" style={{ margin: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>Texto a etiquetar</h3>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn-mini">← Anterior</button>
              <button className="btn-mini">Guardar borrador</button>
              <button className="btn-mini">Siguiente →</button>
            </div>
          </div>

          <div style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 10, padding: 16, marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Pregunta (turno 1)</div>
            <p style={{ fontSize: 13.5, color: 'var(--ink-2)', margin: 0, lineHeight: 1.55 }}>
              ¿Cuáles son los principales riesgos de sesgo de género en el análisis de sentimiento automático de textos en español, y qué técnicas recomendarías para mitigarlos?
            </p>
          </div>

          <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 10, padding: 16, marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Respuesta (turno 1)</div>
            <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--ink-1)', margin: 0 }}>
              El análisis de sentimiento en español enfrenta sesgos de género来源于 los datos de entrenamiento, que часто sobre-representan ciertos roles sociales. Las técnicas incluyen data augmentation con pares swapping, fine-tuning con datasets balanceados como <code style={{ background: '#f6f4ed', padding: '1px 5px', borderRadius: 3 }}>BOLD</code> y métricas de equidad por subgrupo. Recomiendo combinar todas.
            </p>
          </div>

          <div style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 10, padding: 12, fontSize: 12, color: 'var(--ink-3)' }}>
            <b style={{ color: 'var(--ink-2)' }}>Contexto:</b> Conversación <code>uuid-variante-17</code> · pregunta <code>uuid-preg-22</code> · tiempo de respuesta: 4.2s
          </div>
        </div>

        <div>
          <div className="card" style={{ margin: 0, marginBottom: 14 }}>
            <h3 style={{ marginTop: 0 }}>Configuración de las dimensiones</h3>
            <p style={{ fontSize: 12.5, color: 'var(--ink-3)', margin: '0 0 14px' }}>Marca el valor apropiado en cada dimensión. <kbd style={{ background: '#f6f4ed', padding: '1px 5px', borderRadius: 3, fontSize: 11 }}>Tab</kbd> para navegar, <kbd style={{ background: '#f6f4ed', padding: '1px 5px', borderRadius: 3, fontSize: 11 }}>Enter</kbd> para confirmar.</p>
            {dimCards.map(dim => (
              <div key={dim.id} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 12, marginBottom: 10, background: 'var(--surface)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <div style={{ width: 24, height: 24, borderRadius: 5, background: TK[dim.color], color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600 }}>{dim.icon}</div>
                  <b style={{ fontSize: 13, color: 'var(--ink-1)' }}>{dim.name}</b>
                  <span className="scale-pill" style={{ fontSize: 10.5, background: '#f0ede4', color: 'var(--ink-2)', padding: '1.5px 8px', borderRadius: 9, fontWeight: 500, marginLeft: 'auto' }}>3 niveles</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 5 }}>
                  {dim.values.map((v, vi) => {
                    const selected = values[`${dim.id}-${vi}`];
                    return (
                      <button
                        key={vi}
                        onClick={() => setValues(prev => ({ ...prev, [`${dim.id}-${vi}`]: v }))}
                        style={{
                          padding: '7px 10px',
                          border: selected ? '1.5px solid var(--primary)' : '1px solid var(--line)',
                          background: selected ? 'var(--primary-fade)' : 'var(--surface-2)',
                          borderRadius: 6,
                          fontSize: 12,
                          color: 'var(--ink-1)',
                          cursor: 'pointer',
                          fontWeight: selected ? 600 : 400,
                        }}
                      >
                        {v}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="card" style={{ margin: 0 }}>
            <h3 style={{ marginTop: 0 }}>Resumen del paquete</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12 }}>
              <div><span style={{ color: 'var(--ink-3)' }}>Anotados:</span> <b>2 / 50</b></div>
              <div><span style={{ color: 'var(--ink-3)' }}>Pendientes:</span> <b>48</b></div>
              <div><span style={{ color: 'var(--ink-3)' }}>Tiempo medio:</span> <b>3.4 min</b></div>
              <div><span style={{ color: 'var(--ink-3)' }}>Votantes:</span> <b>3 / 3</b></div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 18 }}>
        <button className="btn">← Anterior (17)</button>
        <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>Fragmento <b>17</b> de 50 · faltan <b>33</b></div>
        <button className="btn primary">Enviar paquete completo →</button>
      </div>
    </div>
  );
}
