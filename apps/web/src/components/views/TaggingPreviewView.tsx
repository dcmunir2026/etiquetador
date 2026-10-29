'use client';

import { useRouter } from 'next/navigation';
import type { PreviewTarget, TaggingData } from '@/lib/queries';
import { previewBaseUrl } from '@/lib/preview';
import { Avatar, EmptyState, StatusTag } from './shared';
import { TaggingView } from './TaggingView';

const selectStyle = {
  fontSize: 13, padding: '6px 8px', border: '1px solid var(--line)',
  borderRadius: 6, background: 'var(--surface-2)', color: 'var(--ink-1)',
  minWidth: 200,
} as const;

/**
 * The annotator's screen, seen by an admin.
 *
 * The admin picks a person and one of their packages; the screen below is
 * exactly what that annotator sees — their answers, their progress, the
 * restricted navigation a returned package imposes — but nothing can be
 * written: the form is inert and the server would refuse the write even
 * if it were not.
 */
export function TaggingPreviewView({
  projectId, targets, userId, packageId, data, navBase, discrepOnly,
}: {
  projectId: string;
  /** Everybody with work assigned in this project. */
  targets: PreviewTarget[];
  /** Who is being watched, if anyone. */
  userId: string | null;
  /** Which of their packages is on screen. */
  packageId: string | null;
  /** Their tagging data for that package; null when nobody is selected. */
  data: TaggingData | null;
  /** Address of this screen, without the fragment parameter. */
  navBase: string;
  /** Whether the navigation is restricted to discrepant fragments. */
  discrepOnly: boolean;
}) {
  const router = useRouter();
  const target = targets.find((t) => t.userId === userId) ?? null;

  /** Move the preview to another person and/or package. */
  function go(nextUser: string | null, nextPackage: string | null) {
    router.push(previewBaseUrl({
      userId: nextUser, packageId: nextPackage, discrepOnly,
    }));
  }

  function pickUser(nextUserId: string) {
    const next = targets.find((t) => t.userId === nextUserId) ?? null;
    // Keep the package on screen when the new person also has it; otherwise
    // start them on their own first package.
    const keep = next?.packages.some((p) => p.id === packageId)
      ? packageId
      : next?.packages[0]?.id ?? null;
    go(nextUserId, keep);
  }

  const picker = (
    <div className="card" style={{ padding: '12px 14px', marginBottom: 12 }}>
      <div style={{
        display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap',
      }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11.5, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Etiquetador
          </span>
          <select
            value={userId ?? ''}
            onChange={(e) => pickUser(e.target.value)}
            style={selectStyle}
          >
            <option value="">— elige a quién mirar —</option>
            {targets.map((t) => (
              <option key={t.userId} value={t.userId}>
                {t.name} ({t.packages.length} paquete{t.packages.length === 1 ? '' : 's'})
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11.5, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Paquete
          </span>
          <select
            value={packageId ?? ''}
            onChange={(e) => go(userId, e.target.value || null)}
            disabled={!target}
            style={selectStyle}
          >
            {!target && <option value="">— sin etiquetador —</option>}
            {target?.packages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code}{p.isLead ? ' · responsable' : ''}
              </option>
            ))}
          </select>
        </label>

        {target && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
            <Avatar name={target.name} color={target.color} size={30} />
            <div style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>
              <div><b>{target.name}</b></div>
              <div style={{ color: 'var(--ink-3)', fontSize: 11.5 }}>{target.email}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  if (!target || !data) {
    return (
      <div className="page">
        {picker}
        <EmptyState title="Elige un etiquetador">
          {targets.length === 0
            ? 'En este proyecto todavía no hay nadie con un paquete asignado.'
            : 'Selecciona una persona para ver la pantalla de etiquetado tal como la tiene ella.'}
        </EmptyState>
      </div>
    );
  }

  const pkg = data.package;

  return (
    <TaggingView
      projectId={projectId}
      data={data}
      userName={target.name}
      readOnly
      navBase={navBase}
      discrepOnly={discrepOnly}
      banner={
        <div>
          {picker}
          <div
            data-testid="preview-banner"
            style={{
              marginBottom: 14, padding: '10px 13px',
              background: '#eef3f8', border: '1px solid #c5d8e8',
              borderLeft: '3px solid var(--primary-2)', borderRadius: '0 6px 6px 0',
              fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5,
            }}
          >
            <b>Sólo lectura</b> — ves la pantalla de <b>{target.name}</b> tal y como la tiene
            {pkg ? <> (paquete <b>{pkg.code}</b> <StatusTag status={pkg.status} />)</> : null}:{' '}
            sus respuestas, su progreso y la navegación restringida si el paquete fue devuelto.
            Desde aquí no se puede modificar nada.
          </div>
        </div>
      }
    />
  );
}
