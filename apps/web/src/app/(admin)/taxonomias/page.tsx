import { getDb } from '@/lib/db';
import { taxonomies, dimensions, taxonomyDimensions, users, projectTaxonomies } from '@/lib/db';
import { eq, count, asc } from 'drizzle-orm';
import TaxonomyCatalog, { type TaxonomyCard } from './_components/TaxonomyCatalog';
import { TAXONOMY_COLOR_OPTIONS, type TaxonomyColor } from './actions/schemas';

export const dynamic = 'force-dynamic';

const FALLBACK_COLORS: TaxonomyColor[] = TAXONOMY_COLOR_OPTIONS.map((c) => c.id);

function normalizeColor(raw: string | null): TaxonomyColor {
  if (raw && (FALLBACK_COLORS as string[]).includes(raw)) return raw as TaxonomyColor;
  return 'cyan';
}

export default async function TaxonomiesGroupsPage() {
  const db = getDb();

  const rows = await db
    .select({ t: taxonomies, creator: users })
    .from(taxonomies)
    .leftJoin(users, eq(users.id, taxonomies.createdBy))
    .orderBy(asc(taxonomies.name));

  // For each taxonomy, fetch its dimensions.
  const txDims = await db
    .select({ txId: taxonomyDimensions.taxonomyId, d: dimensions })
    .from(taxonomyDimensions)
    .innerJoin(dimensions, eq(dimensions.id, taxonomyDimensions.dimensionId))
    .orderBy(asc(taxonomyDimensions.order), asc(dimensions.name));
  const dimsByTx: Record<string, Array<{ id: string; name: string; kind: string | null }>> = {};
  for (const r of txDims) {
    const bucket = dimsByTx[r.txId] ?? (dimsByTx[r.txId] = []);
    bucket.push({ id: r.d.id, name: r.d.name, kind: r.d.kind });
  }

  // Per-taxonomy count of projects it's assigned to.
  const projAssignments = await db
    .select({ txId: projectTaxonomies.taxonomyId, projectId: projectTaxonomies.projectId })
    .from(projectTaxonomies);
  const projCountByTx = new Map<string, Set<string>>();
  for (const r of projAssignments) {
    const set = projCountByTx.get(r.txId) ?? projCountByTx.set(r.txId, new Set()).get(r.txId)!;
    set.add(r.projectId);
  }

  // KPIs.
  const [activeCount] = await db
    .select({ c: count() })
    .from(taxonomies)
    .where(eq(taxonomies.status, 'active'));
  const [archivedCount] = await db
    .select({ c: count() })
    .from(taxonomies)
    .where(eq(taxonomies.status, 'archived'));
  const [totalAss] = await db.select({ c: count() }).from(taxonomyDimensions);

  const cards: TaxonomyCard[] = rows.map((r) => ({
    id: r.t.id,
    name: r.t.name,
    shortDescription: r.t.shortDescription,
    color: normalizeColor(r.t.color),
    status: r.t.status === 'archived' ? 'archived' : 'active',
    dimensions: dimsByTx[r.t.id] || [],
    projectCount: projCountByTx.get(r.t.id)?.size ?? 0,
  }));

  return (
    <main>
      <h1>Taxonomías</h1>
      <p className="lead">
        Agrupa dimensiones en paquetes conceptuales y asígnalas como conjunto a los proyectos. Una
        dimensión puede vivir en varias taxonomías.
      </p>

      <div className="grid g-2" style={{ marginBottom: 18 }}>
        <div className="kpi">
          <div className="label">Taxonomías activas</div>
          <div className="value">{activeCount?.c ?? 0}</div>
          <div className="delta">{archivedCount?.c ?? 0} archivada(s)</div>
        </div>
        <div className="kpi">
          <div className="label">Asignaciones totales</div>
          <div className="value">{totalAss?.c ?? 0}</div>
          <div className="delta">dimensión × taxonomía</div>
        </div>
      </div>

      <TaxonomyCatalog cards={cards} />
    </main>
  );
}
