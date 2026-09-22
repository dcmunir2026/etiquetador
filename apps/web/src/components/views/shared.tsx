/**
 * Small presentational pieces shared across views, matching the mockup's
 * markup so the existing stylesheet applies unchanged.
 */

import type { ReactNode } from 'react';

export function Kpi({ label, value, delta, tone, small }: {
  label: string; value: ReactNode; delta?: ReactNode;
  tone?: 'ok' | 'warn' | 'bad'; small?: boolean;
}) {
  const color = tone === 'ok' ? 'var(--ok)' : tone === 'warn' ? 'var(--warn)' : tone === 'bad' ? 'var(--bad)' : undefined;
  return (
    <div className={`kpi${small ? ' kpi--sm' : ''}`}>
      <div className="label">{label}</div>
      <div className="value" style={color ? { color } : undefined}>{value}</div>
      {delta ? <div className="delta">{delta}</div> : null}
    </div>
  );
}

/** Horizontal labelled bar used by every "por dimensión" breakdown. */
export function BenchRow({ label, pct, display, tone }: {
  label: ReactNode; pct: number; display: string; tone?: 'ok' | 'warn' | 'bad';
}) {
  const cls = tone ?? (pct >= 0.3 ? 'bad' : pct >= 0.12 ? 'warn' : 'ok');
  return (
    <div className="bench-row">
      <span className="lbl">{label}</span>
      <div className="bar-bg">
        <div className={`bar-fill ${cls}`} style={{ width: `${Math.max(0, Math.min(100, pct * 100))}%` }} />
      </div>
      <span className="val">{display}</span>
    </div>
  );
}

export function StatusTag({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; dot: string }> = {
    approved: { label: 'Aprobado', cls: 'status-done', dot: 'var(--ok)' },
    ok: { label: 'Aprobado', cls: 'status-done', dot: 'var(--ok)' },
    done: { label: 'Completado', cls: 'status-done', dot: 'var(--ok)' },
    submitted: { label: 'Enviado', cls: 'status-done', dot: 'var(--ok)' },
    in_progress: { label: 'En etiquetado', cls: 'status-progress', dot: 'var(--warn)' },
    progress: { label: 'En progreso', cls: 'status-progress', dot: 'var(--warn)' },
    assigned: { label: 'Asignado', cls: 'status-todo', dot: 'var(--ink-3)' },
    draft: { label: 'Borrador', cls: 'status-todo', dot: 'var(--ink-3)' },
    pending: { label: 'Pendiente', cls: 'status-todo', dot: 'var(--ink-3)' },
    returned: { label: 'Con discrepancias', cls: 'status-blocked', dot: 'var(--bad)' },
    fail: { label: 'Con discrepancias', cls: 'status-blocked', dot: 'var(--bad)' },
    blocked: { label: 'Bloqueado', cls: 'status-blocked', dot: 'var(--bad)' },
    corrected: { label: 'Corregido', cls: 'status-progress', dot: 'var(--warn)' },
    active: { label: 'Activo', cls: 'status-done', dot: 'var(--ok)' },
    archived: { label: 'Archivada', cls: 'status-todo', dot: 'var(--ink-3)' },
  };
  const s = map[status] ?? { label: status, cls: 'status-todo', dot: 'var(--ink-3)' };
  return (
    <span className={`tag ${s.cls}`}>
      <span className="dot" style={{ background: s.dot }} />
      {s.label}
    </span>
  );
}

export function Progress({ value, width = 130, tone }: { value: number; width?: number; tone?: 'ok' | 'bad' | 'warn' }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  const bg = tone === 'ok' ? 'linear-gradient(90deg,var(--ok),#1e6a44)'
    : tone === 'bad' ? 'linear-gradient(90deg,var(--bad),#7a2222)'
    : tone === 'warn' ? 'linear-gradient(90deg,var(--warn),#b58300)'
    : undefined;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <div className="progress" style={{ width }}>
        <div className="bar" style={{ width: `${pct}%`, ...(bg ? { background: bg } : {}) }} />
      </div>
      <small style={{ color: 'var(--ink-3)', fontSize: 11 }}>{pct}%</small>
    </span>
  );
}

export function Avatar({ name, color, size = 26 }: { name: string; color?: string | null; size?: number }) {
  const initials = name.split(/\s+/).slice(0, 2).map((w) => w[0] ?? '').join('').toUpperCase();
  return (
    <div className="avatar" style={{ background: color ?? undefined, width: size, height: size, fontSize: size * 0.42 }}>
      {initials}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty-state">
      <h4>{title}</h4>
      {children}
    </div>
  );
}

export function pct(n: number, digits = 0): string {
  return `${(n * 100).toFixed(digits)}%`;
}

export function num(n: number): string {
  return n.toLocaleString('es-ES');
}

/** "hace 2 días" — the mockup's relative timestamps. */
export function ago(date: Date | string | null | undefined): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  const secs = Math.floor((Date.now() - d.getTime()) / 1000);
  if (secs < 60) return 'hace un momento';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'ayer';
  if (days < 30) return `hace ${days} días`;
  const months = Math.floor(days / 30);
  return months === 1 ? 'hace 1 mes' : `hace ${months} meses`;
}

/** Deterministic accent colour for a dimension, keyed by its name. */
export function dimColor(name: string): string {
  const palette = ['#7a1a1c', '#2f5d2c', '#a85a35', '#3d8268', '#5b8fb8', '#7d6c4f', '#7a3b1c', '#5a3060', '#5a4400', '#a13d3d'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return palette[hash % palette.length]!;
}
