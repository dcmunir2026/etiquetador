// Creates the catalogue tables and seeds them. Schema is created ahead of
// time via `pnpm db:push` (drizzle-kit push), so this script only inserts.
//
//   DATABASE_URL=postgres://etiquetador:etiquetador_dev@localhost:5433/etiquetador pnpm init
//
// Idempotent for catalogue data: every insert checks for an existing row
// first (by natural key) and skips it when present, so re-running won't
// duplicate. Workflow tables are owned by init-workflow.ts.

import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import * as schema from './src/index';

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error('DATABASE_URL no está definida. Apunta a Postgres en docker-compose.');
}

const client = postgres(url, { max: 1 });
const db = drizzle(client, { schema });

console.log('Seeding catalogue...');

function slugify(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-');
}

// 1. Superadmin user — one row only, identified by email.
let [marta] = await db.select().from(schema.users)
  .where(eq(schema.users.email, 'marta@etiquetador.local'));
if (!marta) {
  [marta] = await db.insert(schema.users).values({
    email: 'marta@etiquetador.local',
    name: 'Marta R.',
    avatarColor: 'linear-gradient(135deg,#0e4a52,#1d6e75)',
    isSuperAdmin: true,
  }).returning();
}
console.log('  user:', marta.email);

// 2. Intensity scales
const scales = [
  { name: 'Booleano', kind: 'boolean' as const, levels: [{ label: 'Sí', value: '1' }, { label: 'No', value: '0' }] },
  { name: 'Binario', kind: 'binary' as const, levels: [{ label: 'Positivo', value: '+' }, { label: 'Negativo', value: '-' }] },
  { name: 'Tres niveles', kind: '3-level' as const, levels: [{ label: 'Bajo', value: '1' }, { label: 'Medio', value: '2' }, { label: 'Alto', value: '3' }] },
  { name: 'Cinco niveles', kind: '5-level' as const, levels: [
    { label: 'Muy bajo', value: '1' }, { label: 'Bajo', value: '2' }, { label: 'Medio', value: '3' },
    { label: 'Alto', value: '4' }, { label: 'Muy alto', value: '5' },
  ] },
  { name: 'Likert 1–7', kind: 'likert' as const, levels: Array.from({ length: 7 }, (_, i) => ({ label: String(i+1), value: String(i+1) })) },
  { name: 'Texto libre', kind: 'free-text' as const, levels: [{ label: '(texto libre)', value: 'free' }] },
];

const scaleIds: Record<string, string> = {};
for (const s of scales) {
  let [row] = await db.select().from(schema.intensityScales).where(eq(schema.intensityScales.name, s.name));
  if (!row) {
    [row] = await db.insert(schema.intensityScales).values({
      name: s.name, kind: s.kind, isCustom: false, createdBy: marta.id,
    }).returning();
    for (let i = 0; i < s.levels.length; i++) {
      const lv = s.levels[i]!;
      await db.insert(schema.intensityLevels).values({
        scaleId: row.id, label: lv.label, value: lv.value, order: i,
      });
    }
  }
  scaleIds[s.name] = row.id;
}
console.log('  scales:', Object.keys(scaleIds).length);

// 3. Dimensions
const dimData = [
  { name: 'Sesgo de odio', shortDesc: 'Detecta insinuaciones o discurso explícito de odio en el contenido.', scale: 'Tres niveles' },
  { name: 'Emotividad', shortDesc: 'Detecta si el tono es neutro, valorativo o cargado emocionalmente.', scale: 'Tres niveles' },
  { name: 'Carácter tendencioso', shortDesc: '¿Imparcial o con sesgo (sutil o claro)?', scale: 'Tres niveles' },
  { name: 'Semiótica', shortDesc: 'Detecta uso de lenguaje figurado, irónico o sarcástico.', scale: 'Tres niveles' },
  { name: 'Género', shortDesc: '¿Tratamiento neutral o con sesgo de género?', scale: 'Tres niveles' },
  { name: 'Raza / etnia', shortDesc: 'Detecta contenido racista o con sesgo étnico.', scale: 'Tres niveles' },
  { name: 'Religión', shortDesc: 'Detecta contenido con sesgo religioso.', scale: 'Tres niveles' },
  { name: 'Sesgo demográfico', shortDesc: 'Detecta sesgo por edad, origen o clase social.', scale: 'Cinco niveles' },
  { name: 'Sesgo estadístico', shortDesc: 'Evalúa si los datos cuantitativos/cualitativos son correctos, faltan fuentes o hay cifras imprecisas.', scale: 'Tres niveles' },
  { name: 'Toxicidad', shortDesc: 'Mide el nivel de toxicidad general (insultos, vulgaridad, agresividad).', scale: 'Cinco niveles' },
  { name: 'Incoherencia factual', shortDesc: 'Marca respuestas que contradicen datos verificables del propio contexto o del corpus.', scale: 'Binario' },
];

const dimIds: Record<string, string> = {};
for (const d of dimData) {
  let [row] = await db.select().from(schema.dimensions).where(eq(schema.dimensions.slug, slugify(d.name)));
  if (!row) {
    [row] = await db.insert(schema.dimensions).values({
      name: d.name, slug: slugify(d.name), shortDescription: d.shortDesc,
      kind: 'category', scaleId: scaleIds[d.scale], status: 'active', createdBy: marta.id,
    }).returning();
    const levels = scales.find(s => s.name === d.scale)!.levels;
    for (let i = 0; i < levels.length; i++) {
      const lv = levels[i]!;
      await db.insert(schema.dimensionValues).values({
        dimensionId: row.id, label: lv.label, value: lv.value, order: i,
      });
    }
  }
  dimIds[d.name] = row.id;
}
console.log('  dimensions:', Object.keys(dimIds).length);

// 4. Projects
const projectData = [
  { name: 'EpData 2026-Q3', slug: 'epdata-2026q3', desc: 'Validación cuantitativa · 3.662 fragmentos' },
  { name: 'EpData 2026-Q2', slug: 'epdata-2026q2', desc: 'Consolidación final · 1.224 fragmentos' },
  { name: 'EpData Sintético v1', slug: 'epdata-sint', desc: 'Línea base juez · 200 fragmentos' },
  { name: 'ODS 2026 (demo)', slug: 'ods-2026', desc: 'Pilotaje en otros indicadores de odio · 412' },
];

const projIds: Record<string, string> = {};
for (const p of projectData) {
  let [row] = await db.select().from(schema.projects).where(eq(schema.projects.slug, p.slug));
  if (!row) {
    [row] = await db.insert(schema.projects).values({
      name: p.name, slug: p.slug, description: p.desc, status: 'active', createdBy: marta.id,
    }).returning();
    await db.insert(schema.projectMembers).values({
      projectId: row.id, userId: marta.id, role: 'projectadmin',
    });
  }
  projIds[p.slug] = row.id;
}
console.log('  projects:', Object.keys(projIds).length);

// 5. Taxonomies
const taxData = [
  { name: 'Sesgos sociodemográficos', shortDesc: 'Sesgos contra grupos protegidos: odio, género, raza, religión, demografía.', color: 'rose',
    dims: ['Sesgo de odio', 'Género', 'Raza / etnia', 'Religión', 'Sesgo demográfico'] },
  { name: 'Calidad periodística', shortDesc: 'Rigor factual, datos, fuentes, verificación. Métricas formales de calidad.', color: 'amber',
    dims: ['Sesgo estadístico', 'Incoherencia factual'] },
  { name: 'Aspectos formales del discurso', shortDesc: 'Estilo, retórica, carga emocional, figuras literarias. Cómo se dice, no qué se dice.', color: 'cyan',
    dims: ['Carácter tendencioso', 'Semiótica', 'Emotividad'] },
  { name: 'Toxicidad y discurso dañino', shortDesc: 'Insultos, vulgaridad, agresividad. No incluye odio estructural.', color: 'violet',
    dims: ['Toxicidad'] },
];

const taxIds: Record<string, string> = {};
for (const t of taxData) {
  let [row] = await db.select().from(schema.taxonomies).where(eq(schema.taxonomies.slug, slugify(t.name)));
  if (!row) {
    [row] = await db.insert(schema.taxonomies).values({
      name: t.name, slug: slugify(t.name), shortDescription: t.shortDesc, color: t.color, status: 'active', createdBy: marta.id,
    }).returning();
    t.dims.forEach((dimName, i) => {
      const dimId = dimIds[dimName];
      if (dimId) {
        void db.insert(schema.taxonomyDimensions).values({ taxonomyId: row.id, dimensionId: dimId, order: i });
      }
    });
  }
  taxIds[t.name] = row.id;
}
console.log('  taxonomies:', Object.keys(taxIds).length);

// 6. Project taxonomies
const ptData = [
  { project: 'epdata-2026q3', taxonomies: ['Sesgos sociodemográficos', 'Calidad periodística', 'Aspectos formales del discurso'] },
  { project: 'epdata-2026q2', taxonomies: ['Sesgos sociodemográficos'] },
  { project: 'ods-2026', taxonomies: ['Toxicidad y discurso dañino'] },
];

for (const pt of ptData) {
  const projId = projIds[pt.project];
  if (!projId) continue;
  for (const taxName of pt.taxonomies) {
    const taxId = taxIds[taxName];
    if (!taxId) continue;
    const existing = await db.select().from(schema.projectTaxonomies)
      .where(eq(schema.projectTaxonomies.projectId, projId));
    const dup = existing.find((r) => r.taxonomyId === taxId);
    if (!dup) {
      await db.insert(schema.projectTaxonomies).values({
        projectId: projId, taxonomyId: taxId, assignedBy: marta.id,
      });
    }
  }
}
console.log('  project-taxonomy assignments done.');

await client.end();
console.log('Seed complete. Marta R. is superadmin.');
