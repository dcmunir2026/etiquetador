import { asc, eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { getDb } from '@/db/client';
import { dimensions, intensityScales, intensityLevels } from '@/db/schema';
import { getCurrentUser } from '@/lib/session';
import DimensionForm from '../../_components/DimensionForm';

export const dynamic = 'force-dynamic';

export default async function EditDimensionPage({
  params,
}: {
  params: { id: string };
}) {
  const me = await getCurrentUser();
  const db = getDb();

  const dimRows = await db
    .select()
    .from(dimensions)
    .where(eq(dimensions.id, params.id))
    .limit(1);
  const dim = dimRows[0];
  if (!dim) notFound();

  const scaleRows = await db
    .select()
    .from(intensityScales)
    .orderBy(asc(intensityScales.name));
  const levelRows = await db
    .select()
    .from(intensityLevels)
    .orderBy(asc(intensityLevels.scaleId), asc(intensityLevels.order));

  const scales = scaleRows.map((s) => ({
    id: s.id,
    name: s.name,
    kind: s.kind,
    levels: levelRows
      .filter((lv) => lv.scaleId === s.id)
      .map((lv) => ({ label: lv.label, value: lv.value, order: lv.order })),
  }));

  return (
    <main>
      <a href="/dimensiones" className="btn" style={{ marginBottom: 8 }}>
        ← Cancelar
      </a>
      <h1 style={{ marginTop: 8 }}>Editar dimensión</h1>
      <p className="lead">
        Cambiar la escala <b>añade</b> valores nuevos a la dimensión pero <b>no borra</b> los
        que ya existen. Archivar la dimensión la oculta de los selectores activos.
      </p>
      <DimensionForm
        scales={scales}
        isSuperAdmin={!!me?.isSuperAdmin}
        initial={{
          id: dim.id,
          name: dim.name,
          kind: dim.kind,
          scaleId: dim.scaleId ?? scales[0]?.id ?? '',
          shortDescription: dim.shortDescription,
          longDescription: dim.longDescription,
        }}
      />
    </main>
  );
}
