import { redirect } from 'next/navigation';

export default function EditDimensionPage({
  params,
}: {
  params: { id: string };
}) {
  // The wizard now lives in a modal over the catalog. Deep-link straight
  // into it via ?edit=<id> so the existing /dimensiones/[id]/editar URL
  // still works.
  redirect(`/dimensiones?edit=${encodeURIComponent(params.id)}`);
}
