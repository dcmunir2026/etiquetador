'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { ProjectSettings } from '@/lib/queries';
import { updateProjectThreshold } from '@/app/actions/projects';
import { pct } from './shared';

/**
 * Per-project settings: identity (read-only) and validation parameters.
 *
 * Currently exposes the discrepancy threshold; the layout is built to host
 * future tunables (kappa cutoff, max returned-package version, etc.)
 * without re-shuffling the screen.
 */
export function ProjectSettingsView({
  settings,
  canEdit,
}: {
  settings: ProjectSettings;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  // Surface the threshold as a percentage so the user types 12, not 0.12.
  // Internal storage is the fraction (numeric(4,3)) — see getProjectSettings.
  const [percent, setPercent] = useState<string>(
    String(Math.round(settings.discrepancyThreshold * 1000) / 10),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const numeric = Number(percent);
  const valid = Number.isFinite(numeric) && numeric > 0 && numeric < 100;
  // ±0.05% counts as "unchanged" so typing "12.0" doesn't disable save.
  const currentPct = Math.round(settings.discrepancyThreshold * 1000) / 10;
  const dirty = valid && Math.abs(numeric - currentPct) >= 0.05;
  const disabled = !canEdit || busy || !dirty;

  async function submit() {
    if (!valid) {
      setError('Introduce un valor entre 1 y 99.');
      return;
    }
    setBusy(true);
    setError(null);
    const res = await updateProjectThreshold(settings.id, numeric);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSavedAt(Date.now());
    // Refresh the server tree so consumers (DiscrepanciasView, QuantValidationView,
    // Reporte) pick up the new threshold on the next render — the server action
    // already revalidates the layout, but a refresh keeps the local UI in sync.
    startTransition(() => router.refresh());
  }

  return (
    <div className="page">
      <h1>Ajustes del proyecto</h1>
      <p className="lead">
        Parámetros que afectan la validación cuantitativa de los paquetes
        del proyecto <b>{settings.name}</b>.
      </p>

      <div className="card" style={{ padding: '14px 16px', marginBottom: 18 }}>
        <h3>Identidad</h3>
        <dl style={{ display: 'grid', gridTemplateColumns: '140px 1fr', rowGap: 6, margin: 0 }}>
          <dt style={{ color: 'var(--ink-3)', fontSize: 12.5 }}>Nombre</dt>
          <dd style={{ margin: 0 }}>{settings.name}</dd>
          <dt style={{ color: 'var(--ink-3)', fontSize: 12.5 }}>Slug</dt>
          <dd style={{ margin: 0, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
            {settings.slug}
          </dd>
          <dt style={{ color: 'var(--ink-3)', fontSize: 12.5 }}>Descripción</dt>
          <dd style={{ margin: 0 }}>{settings.description ?? <em style={{ color: 'var(--ink-3)' }}>—</em>}</dd>
          <dt style={{ color: 'var(--ink-3)', fontSize: 12.5 }}>Estado</dt>
          <dd style={{ margin: 0 }}>{settings.status === 'active' ? 'Activo' : 'Archivado'}</dd>
        </dl>
      </div>

      <div className="card" style={{ padding: '14px 16px' }}>
        <h3>Validación</h3>

        <div style={{ marginTop: 10 }}>
          <label htmlFor="threshold-input" style={{ fontSize: 12.5, fontWeight: 600 }}>
            Umbral de discrepancia
          </label>
          <p style={{ fontSize: 12, color: 'var(--ink-3)', margin: '4px 0 8px' }}>
            Porcentaje de valoraciones discrepantes a partir del cual un paquete
            se marca como <code>fail</code> y se devuelve al equipo de etiquetado.
            Valor por defecto: 12%.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              id="threshold-input"
              type="number"
              min={1}
              max={99}
              step={0.5}
              value={percent}
              disabled={!canEdit}
              onChange={(e) => { setPercent(e.target.value); setError(null); }}
              style={{
                width: 90, padding: '6px 8px',
                border: `1px solid ${error ? 'var(--bad)' : 'var(--line)'}`,
                borderRadius: 4, fontSize: 14, fontVariantNumeric: 'tabular-nums',
                background: 'var(--surface-2)', color: 'var(--ink-1)',
              }}
            />
            <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>%</span>
            <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
              (actual: {pct(settings.discrepancyThreshold)})
            </span>
            {canEdit && (
              <button
                className="btn"
                type="button"
                onClick={submit}
                disabled={disabled}
                style={{ marginLeft: 'auto' }}>
                {busy ? 'Guardando…' : 'Guardar'}
              </button>
            )}
          </div>
          {!canEdit && (
            <p style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 8 }}>
              Tu rol en este proyecto no permite editar el umbral.
            </p>
          )}
          {error && (
            <p role="alert" style={{ fontSize: 12, color: 'var(--bad)', marginTop: 8 }}>
              {error}
            </p>
          )}
          {savedAt && !error && (
            <p role="status" style={{ fontSize: 12, color: 'var(--ok)', marginTop: 8 }}>
              Umbral actualizado. Los informes de discrepancia se recalcularán en la siguiente carga.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}