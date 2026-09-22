import { renderView, type ViewSearchParams } from './render-view';
import { KNOWN_VIEWS } from '@/lib/views';

export const dynamic = 'force-dynamic';

/** Root route. Honours `?view=` so any screen stays linkable from `/`. */
export default async function HomePage({ searchParams }: { searchParams: ViewSearchParams }) {
  const requested = searchParams.view;
  const view = requested && KNOWN_VIEWS.has(requested) ? requested : 'dashboard';
  return renderView(view, searchParams);
}
