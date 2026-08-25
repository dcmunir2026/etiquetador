'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { archiveDimension } from './actions/actions';

export default function ArchiveButton({
  dimensionId,
  dimensionName,
  variant,
}: {
  dimensionId: string;
  dimensionName: string;
  variant?: 'mini' | 'default';
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const isMini = variant === 'mini';

  function onClick() {
    if (!confirm(`¿Archivar "${dimensionName}"?\nDejará de aparecer en los selectores activos.`)) {
      return;
    }
    startTransition(async () => {
      const res = await archiveDimension({ id: dimensionId });
      if (res.ok) {
        router.refresh();
      } else {
        alert(`No se pudo archivar: ${res.error}`);
      }
    });
  }

  if (isMini) {
    return (
      <button
        className="btn-mini danger-mini"
        onClick={onClick}
        disabled={pending}
        aria-busy={pending}
      >
        {pending ? '…' : 'Archivar'}
      </button>
    );
  }

  return (
    <button
      className="btn sm"
      onClick={onClick}
      disabled={pending}
      aria-busy={pending}
      style={{ color: 'var(--danger)' }}
    >
      {pending ? '…' : 'Archivar'}
    </button>
  );
}
