import { getDb } from '@/db/client';
import { projects, dimensions, taxonomies, taxonomyDimensions, projectTaxonomies, users } from '@/db/schema';
import { sql, eq, count, desc, asc } from 'drizzle-orm';
import { ViewRouter } from '@/components/views/ViewRouter';

export const dynamic = 'force-dynamic';

export default async function HomePage({ searchParams }: { searchParams: { view?: string } }) {
  const view = searchParams.view || 'dashboard';

  const db = getDb();
  const [
    projectList,
    dimRows,
    dimCounts,
    txRows,
    txDims,
    activeCount,
    totalAss,
  ] = await Promise.all([
    db.select().from(projects).orderBy(desc(projects.createdAt)),
    db.select({ d: dimensions, creator: users }).from(dimensions).leftJoin(users, eq(users.id, dimensions.createdBy)).where(eq(dimensions.status, 'active')).orderBy(asc(dimensions.name)),
    db.select({ dimensionId: taxonomyDimensions.dimensionId, count: count() }).from(taxonomyDimensions).groupBy(taxonomyDimensions.dimensionId),
    db.select({ t: taxonomies, creator: users }).from(taxonomies).leftJoin(users, eq(users.id, taxonomies.createdBy)).where(eq(taxonomies.status, 'active')).orderBy(asc(taxonomies.name)),
    db.select({ txId: taxonomyDimensions.taxonomyId, d: dimensions }).from(taxonomyDimensions).innerJoin(dimensions, eq(dimensions.id, taxonomyDimensions.dimensionId)).orderBy(asc(taxonomyDimensions.order)),
    db.select({ c: count() }).from(taxonomies).where(eq(taxonomies.status, 'active')),
    db.select({ c: count() }).from(taxonomyDimensions),
  ]);

  const txCountByDim = new Map(dimCounts.map(r => [r.dimensionId, Number(r.count)]));
  const dimsByTx: Record<string, Array<{ id: string; name: string; kind: string | null }>> = {};
  for (const r of txDims) {
    const bucket = dimsByTx[r.txId] ?? (dimsByTx[r.txId] = []);
    bucket.push({ id: r.d.id, name: r.d.name, kind: r.d.kind });
  }

  return (
    <ViewRouter
      view={view}
      data={{
        projects: projectList,
        dimensions: dimRows.map(r => ({
          ...r.d,
          createdBy: r.creator?.name || r.creator?.email || null,
        })),
        taxonomies: txRows.map(r => ({
          ...r.t,
          createdBy: r.creator?.name || r.creator?.email || null,
        })),
        dimsByTx,
        txCountByDim: Object.fromEntries(txCountByDim),
        totalActiveTaxonomies: activeCount[0]?.c ?? 0,
        totalTaxonomyDimensions: totalAss[0]?.c ?? 0,
      }}
    />
  );
}
