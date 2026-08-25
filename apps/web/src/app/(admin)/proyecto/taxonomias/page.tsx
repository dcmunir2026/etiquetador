import { redirect } from 'next/navigation';
import { asc, desc, eq, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { projects, taxonomies, taxonomyDimensions, projectTaxonomies } from '@/db/schema';
import { getCurrentUser } from '@/lib/session';
import TaxonomyAssignment, {
  type AssignmentTaxonomy,
} from './_components/TaxonomyAssignment';
import { TAXONOMY_COLOR_OPTIONS, type TaxonomyColor } from '../../taxonomias/actions/schemas';

export const dynamic = 'force-dynamic';

const FALLBACK_COLORS: TaxonomyColor[] = TAXONOMY_COLOR_OPTIONS.map((c) => c.id);

function normalizeColor(raw: string | null): TaxonomyColor {
  if (raw && (FALLBACK_COLORS as string[]).includes(raw)) return raw as TaxonomyColor;
  return 'cyan';
}

type SP = { projectId?: string };

export default async function ProjectTaxonomiasPage({ searchParams }: { searchParams: SP }) {
  const me = await getCurrentUser();
  if (!me) redirect('/login');

  const db = getDb();

  // Gate: no project selected.
  if (!searchParams.projectId) {
    const all = await db
      .select()
      .from(projects)
      .orderBy(desc(projects.createdAt));
    return (
      <main>
        <h1>Taxonomías del proyecto</h1>
        <p className="lead">Selecciona un proyecto para gestionar qué taxonomías usará al anotar.</p>
        <div className="card" style={{ padding: 0 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Proyecto</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {all.map((p) => (
                <tr key={p.id}>
                  <td>
                    <span className="pname">{p.name}</span>
                    <span className="psub">{p.description || '—'}</span>
                  </td>
                  <td>
                    <span className={'badge ' + (p.status === 'active' ? 'green' : 'gray')}>
                      {p.status}
                    </span>
                  </td>
                  <td>
                    <a
                      className="btn sm primary"
                      href={`/proyecto/taxonomias?projectId=${p.id}`}
                    >
                      Abrir →
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    );
  }

  const projectId = searchParams.projectId;
  const projRows = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  const project = projRows[0];
  if (!project) {
    return (
      <main>
        <h1>Proyecto no encontrado</h1>
        <p className="lead">
          El proyecto <code>{projectId}</code> no existe o fue archivado.
        </p>
        <a className="btn" href="/proyecto/taxonomias">← Volver al listado</a>
      </main>
    );
  }

  // All active taxonomies + the project's assigned set.
  const allTaxonomies = await db
    .select()
    .from(taxonomies)
    .where(eq(taxonomies.status, 'active'))
    .orderBy(asc(taxonomies.name));

  const assignedRows = await db
    .select({ txId: projectTaxonomies.taxonomyId })
    .from(projectTaxonomies)
    .where(eq(projectTaxonomies.projectId, projectId));
  const assignedIds = new Set(assignedRows.map((r) => r.txId));

  // Per-taxonomy dimension count (one row per taxonomy with its count).
  const dimCountRows = await db
    .select({
      txId: taxonomyDimensions.taxonomyId,
      c: sql<number>`COUNT(*)`,
    })
    .from(taxonomyDimensions)
    .groupBy(taxonomyDimensions.taxonomyId);
  const dimCountMap = new Map<string, number>();
  for (const r of dimCountRows) {
    dimCountMap.set(r.txId, Number(r.c));
  }

  const items: AssignmentTaxonomy[] = allTaxonomies.map((t) => ({
    id: t.id,
    name: t.name,
    shortDescription: t.shortDescription,
    color: normalizeColor(t.color),
    dimensionCount: dimCountMap.get(t.id) ?? 0,
    isAssigned: assignedIds.has(t.id),
  }));

  return (
    <main>
      <div style={{ marginBottom: 14 }}>
        <a
          href="/proyecto/taxonomias"
          style={{ fontSize: 12, color: 'var(--ink-3)', textDecoration: 'none' }}
        >
          ← Proyectos
        </a>
      </div>

      <h1>Taxonomías del proyecto</h1>
      <p className="lead">
        Elige qué <b>taxonomías</b> (grupos de dimensiones) quieres usar en{' '}
        <b>{project.name}</b>. Cada taxonomía carga sus dimensiones automáticamente al
        anotar. Las taxonomías se gestionan en el{' '}
        <a href="/taxonomias" style={{ color: 'var(--primary-2)', fontWeight: 500 }}>
          catálogo de taxonomías
        </a>
        .
      </p>

      <TaxonomyAssignment projectId={project.id} items={items} />
    </main>
  );
}
