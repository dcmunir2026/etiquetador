'use client';
import { useState } from 'react';

export function UploadView() {
  const [pivot, setPivot] = useState('conversacionId');
  return (
    <div className="page">
      <h1>Cargar Excel maestro</h1>
      <p className="lead">Sube el archivo de EpData Reader T2. El sistema deduplicará, segmentará y creará los paquetes automáticamente.</p>

      <div className="grid g-2" style={{ marginBottom: 20 }}>
        <div className="card" style={{ margin: 0 }}>
          <h3 style={{ marginTop: 0 }}>1. Subir archivo</h3>
          <div style={{ border: '2px dashed var(--line)', borderRadius: 10, padding: 32, textAlign: 'center', background: 'var(--surface-2)' }}>
            <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" strokeWidth="1.5" style={{ marginBottom: 10 }}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <p style={{ margin: '0 0 6px', fontSize: 14 }}>Arrastra el archivo aquí o haz clic para seleccionar</p>
            <small style={{ color: 'var(--ink-3)' }}>Formatos: .xlsx, .csv (máx 50 MB)</small>
            <div style={{ marginTop: 14 }}>
              <button className="btn primary">Seleccionar archivo</button>
            </div>
          </div>
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--ink-3)' }}>
            <b style={{ color: 'var(--ink-2)' }}>Última carga:</b> Reader_T2_octubre.xlsx · 4.218 filas · 2 días
          </div>
        </div>

        <div className="card" style={{ margin: 0 }}>
          <h3 style={{ marginTop: 0 }}>2. Mapeo de columnas</h3>
          <p style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 0 }}>El sistema detecta automáticamente. Revisa que el mapeo sea correcto antes de continuar.</p>
          <table>
            <thead><tr><th>Columna del Excel</th><th>Campo</th><th>Tipo detectado</th></tr></thead>
            <tbody>
              <tr><td>conversacionId</td><td><b style={{ color: 'var(--primary-2)' }}>ID de conversación</b></td><td>UUID (4 cols)</td></tr>
              <tr><td>preguntaGeneradaId</td><td><b style={{ color: 'var(--primary-2)' }}>ID de pregunta</b></td><td>UUID (4 cols)</td></tr>
              <tr><td>preguntaTurno1</td><td><b style={{ color: 'var(--primary-2)' }}>Pregunta (turno 1)</b></td><td>texto</td></tr>
              <tr><td>respuestaTurno1</td><td><b style={{ color: 'var(--primary-2)' }}>Respuesta (turno 1)</b></td><td>texto (largo)</td></tr>
              <tr><td>preguntaTurno2</td><td>Pregunta (turno 2)</td><td>texto · <small style={{ color: 'var(--ink-3)' }}>opcional</small></td></tr>
              <tr><td>respuestaTurno2</td><td>Respuesta (turno 2)</td><td>texto · <small style={{ color: 'var(--ink-3)' }}>opcional</small></td></tr>
              <tr><td>error</td><td>Error</td><td>booleano / texto · <small style={{ color: 'var(--ink-3)' }}>filtro</small></td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>3. Configurar dedupe</h3>
        <div className="grid g-2">
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--ink-2)', marginBottom: 4, fontWeight: 500 }}>Columna pivote para deduplicación</label>
            <select value={pivot} onChange={e => setPivot(e.target.value)} style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 7, fontSize: 13 }}>
              <option value="conversacionId">conversacionId (recomendado)</option>
              <option value="preguntaGeneradaId">preguntaGeneradaId</option>
              <option value="respuestaTurno1">respuestaTurno1 (texto)</option>
            </select>
            <p style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 6 }}>Las filas con el mismo valor en esta columna se consolidan en una sola. Recomendado: conversacionId para deduplicar por sesión.</p>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--ink-2)', marginBottom: 4, fontWeight: 500 }}>Filtros adicionales</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" defaultChecked /> Excluir filas con error 503</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" defaultChecked /> Excluir respuestas vacías en turno 1</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" /> Incluir turno 2 (más lento, +40% tiempo)</label>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
        <button className="btn">Cancelar</button>
        <button className="btn primary" style={{ padding: '10px 18px' }}>Ingestar y segmentar →</button>
      </div>
    </div>
  );
}
