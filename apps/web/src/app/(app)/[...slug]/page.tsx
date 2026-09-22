import { notFound } from 'next/navigation';
import { renderView, type ViewSearchParams } from '../render-view';
import { viewFromPath } from '@/lib/views';

export const dynamic = 'force-dynamic';

/**
 * The named routes the sidebar links to (`/dimensiones`, `/proyecto/roles`, …).
 *
 * A catch-all keeps the mapping in one table instead of a file per screen;
 * anything not in that table is a genuine 404.
 */
export default async function ViewPage({
  params, searchParams,
}: {
  params: { slug: string[] }; searchParams: ViewSearchParams;
}) {
  const view = viewFromPath('/' + params.slug.join('/'));
  if (!view) notFound();
  return renderView(view, searchParams);
}
