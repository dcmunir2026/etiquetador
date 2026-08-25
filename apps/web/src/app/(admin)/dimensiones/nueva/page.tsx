import { asc, eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { intensityScales, intensityLevels } from '@/db/schema';
import { getCurrentUser } from '@/lib/session';
import DimensionForm from '../_components/DimensionForm';

export const dynamic = 'force-dynamic';

export default async function NewDimensionPage() {
  const me = await getCurrentUser();
  const db = getDb();

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
      <h1 style={{ marginTop: 8 }}>Nueva dimensión</h1>
      <p className="lead">
        Las dimensiones son átomos globales. Tras crearla, podrás añadirla a una o más
        taxonomías para usarla en proyectos.
      </p>
      <DimensionForm scales={scales} isSuperAdmin={!!me?.isSuperAdmin} />
    </main>
  );
}
