import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb } from '@/lib/db';
import { taxonomies, dimensions, taxonomyDimensions, users, projectTaxonomies } from '@/lib/db';
import { eq, asc } from 'drizzle-orm';
import DimensionAssignment, { type DimSummary } from '../_components/DimensionAssignment';
import { TAXONOMY_COLOR_OPTIONS, type TaxonomyColor } from '../actions/schemas';

export const dynamic = 'force-dynamic';

const FALLBACK_COLORS: TaxonomyColor[] = TAXONOMY_COLOR_OPTIONS.map((c) => c.id);

function normalizeColor(raw: string | null): TaxonomyColor {
  if (raw && (FALLBACK_COLORS as string[]).includes(raw)) return raw as TaxonomyColor;
  return 'cyan';
}

export default async function TaxonomyDetailPage({ params }: { params: { id: string } }) {
  const db = getDb();

  const [taxonomy] = await db
    .select({ t: taxonomies, creator: users })
    .from(taxonomies)
    .leftJoin(users, eq(users.id, taxonomies.createdBy))
    .where(eq(taxonomies.id, params.id))
    .limit(1);
  if (!taxonomy) notFound();

  // Currently assigned dimensions, with order.
  const assignedRows = await db
    .select({ d: dimensions, order: taxonomyDimensions.order })
    .from(taxonomyDimensions)
    .innerJoin(dimensions, eq(dimensions.id, taxonomyDimensions.dimensionId))
    .where(eq(taxonomyDimensions.taxonomyId, params.id))
    .orderBy(asc(taxonomyDimensions.order), asc(dimensions.name));
  const assigned: DimSummary[] = assignedRows.map((r) => ({
    id: r.d.id,
    name: r.d.name,
    kind: r.d.kind,
    status: r.d.status === 'archived' ? 'archived' : 'active',
  }));
  const assignedIds = new Set(assigned.map((d) => d.id));

  // All active dimensions not yet assigned, for the "add" picker.
  const allDims = await db
    .select({ id: dimensions.id, name: dimensions.name, kind: dimensions.kind, status: dimensions.status })
    .from(dimensions)
    .orderBy(asc(dimensions.name));
  const available: DimSummary[] = allDims
    .filter((d) => !assignedIds.has(d.id))
    .map((d) => ({
      id: d.id,
      name: d.name,
      kind: d.kind,
      status: d.status === 'archived' ? 'archived' : 'active',
    }));

  // Project count.
  const projectRows = await db
    .select({ projectId: projectTaxonomies.projectId })
    .from(projectTaxonomies)
    .where(eq(projectTaxonomies.taxonomyId, params.id));
  const projectCount = new Set(projectRows.map((r) => r.projectId)).size;

  const color = normalizeColor(taxonomy.t.color);
  const gradient = TAXONOMY_COLOR_OPTIONS.find((c) => c.id === color)?.preview ?? TAXONOMY_COLOR_OPTIONS[2]!.preview;

  return (
    <main>
      <div style={{ marginBottom: 14 }}>
        <Link
          href="/taxonomias"
          style={{ fontSize: 12, color: 'var(--ink-3)', textDecoration: 'none' }}
        >
          ← Taxonomías
        </Link>
      </div>

      <div className="card" style={{ padding: 22, marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            className="av-lg"
            style={{ background: gradient, width: 56, height: 56, fontSize: 22 }}
            aria-hidden
          >
            {taxonomy.t.name.charAt(0).toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: 0, fontSize: 22, color: 'var(--ink-1)' }}>{taxonomy.t.name}</h1>
            <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 4 }}>
              <code style={{ background: 'var(--surface-2)', padding: '2px 6px', borderRadius: 4 }}>
                {taxonomy.t.slug}
              </code>
              <span style={{ margin: '0 8px' }}>·</span>
              <span>
                {assigned.length} {assigned.length === 1 ? 'dimensión' : 'dimensiones'}
              </span>
              <span style={{ margin: '0 8px' }}>·</span>
              <span>
                {projectCount} {projectCount === 1 ? 'proyecto' : 'proyectos'}
              </span>
              {taxonomy.t.status === 'archived' ? (
                <>
                  <span style={{ margin: '0 8px' }}>·</span>
                  <span style={{ color: 'var(--ink-4)', fontStyle: 'italic' }}>archivada</span>
                </>
              ) : null}
            </div>
          </div>
        </div>
        {taxonomy.t.shortDescription ? (
          <p style={{ marginTop: 14, color: 'var(--ink-2)', fontSize: 14 }}>{taxonomy.t.shortDescription}</p>
        ) : null}
        {taxonomy.t.longDescription ? (
          <p
            style={{
              marginTop: 10,
              color: 'var(--ink-3)',
              fontSize: 13,
              whiteSpace: 'pre-wrap',
              borderTop: '1px solid var(--line-soft)',
              paddingTop: 12,
            }}
          >
            {taxonomy.t.longDescription}
          </p>
        ) : null}
      </div>

      <DimensionAssignment taxonomyId={taxonomy.t.id} assigned={assigned} available={available} />
    </main>
  );
}
