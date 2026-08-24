'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { archiveProject } from './actions';

export default function ArchiveButton({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onClick() {
    if (!confirm(`¿Archivar el proyecto "${projectName}"?\nNo se eliminará, pero dejará de aparecer en el dashboard.`)) {
      return;
    }
    startTransition(async () => {
      const res = await archiveProject({ id: projectId });
      if (res.ok) router.refresh();
      else alert(`No se pudo archivar: ${res.error}`);
    });
  }

  return (
    <button
      className="btn sm"
      onClick={onClick}
      disabled={pending}
      aria-busy={pending}
      title="Archivar"
      style={{ color: 'var(--danger)' }}
    >
      {pending ? '…' : 'Archivar'}
    </button>
  );
}
