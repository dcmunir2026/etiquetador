import { redirect } from 'next/navigation';

export default function NewDimensionPage() {
  // The wizard now lives in a modal over the catalog. Deep-link straight
  // into it via ?new=1 so the existing /dimensiones/nueva URL still works.
  redirect('/dimensiones?new=1');
}
