'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { archiveDimension } from './actions/actions';

export default function ArchiveButton({
  dimensionId,
  dimensionName,
}: {
  dimensionId: string;
  dimensionName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

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
