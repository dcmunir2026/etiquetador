'use client';

/**
 * Estado vacío del anotador en la pantalla de etiquetado cuando el
 * paquete fue devuelto pero ya no queda ningún fragmento discrepante por
 * corregir: no hay nada que etiquetar, sólo que reenviar el paquete para
 * que vuelva a validación.
 *
 * Va en su propio archivo (y sin dependencias de Next) para poder
 * renderizarlo en los tests sin montar toda la vista de etiquetado.
 */
export function TaggingEmptyState({
  packageCode, userName, notes, round, notice, saving,
  hasUnsavedAnswers, onSave, onResend,
}: {
  packageCode: string;
  userName: string;
  notes?: string | null;
  round: number;
  notice?: string | null;
  saving: boolean;
  hasUnsavedAnswers: boolean;
  onSave: () => void;
  onResend: () => void;
}) {
  return (
    <div className="page">
      <h1 style={{ marginBottom: 4 }}>Etiquetar fragmento</h1>
      <p className="lead" style={{ margin: '0 0 16px' }}>
        Paquete <b>{packageCode}</b> · Etiquetador: <b>{userName}</b>
      </p>
      <div
        className="card"
        data-testid="forced-empty"
        style={{ padding: '18px 20px', maxWidth: 720 }}>
        <h3 style={{ marginTop: 0 }}>No quedan fragmentos discrepantes</h3>
        <p style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6, marginBottom: 0 }}>
          El paquete fue devuelto por el supervisor, pero ya no hay fragmentos con
          discrepancia entre los anotadores. Revisa el motivo de la devolución y
          reenvía el paquete para que vuelva a validación.
        </p>
        {notes?.trim() && (
          <p style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 0 }}>
            Motivo: <i>"{notes.trim()}"</i>
          </p>
        )}
        {notice && (
          <p style={{ fontSize: 12.5, color: 'var(--bad)', marginBottom: 0 }}>{notice}</p>
        )}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
          {hasUnsavedAnswers && (
            <button className="btn" onClick={onSave} disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          )}
          <button className="btn primary" onClick={onResend} disabled={saving}>
            {saving ? 'Enviando…' : `Reenviar paquete (ronda ${round}) →`}
          </button>
        </div>
      </div>
    </div>
  );
}
