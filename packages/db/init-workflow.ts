// Seeds the workflow tables (dependencies, corpus, teams, packages,
// annotations, qualitative validation) with coherent data.
//
// Idempotent: drops and re-seeds only the workflow tables. The catalogue
// seeded by init.ts (users, projects, dimensions, taxonomies) is preserved,
// except for the cascade dimensions this script owns.
//
//   DATABASE_URL=postgres://etiquetador:etiquetador_dev@localhost:5433/etiquetador \
//     pnpm exec tsx init-workflow.ts
//
// Tables are assumed to already exist (created via `pnpm db:push`).

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

// ─── Deterministic PRNG so re-seeding yields identical data ──────────
let _seed = 0x5eed1234;
function rnd(): number {
  _seed ^= _seed << 13; _seed >>>= 0;
  _seed ^= _seed >> 17;
  _seed ^= _seed << 5; _seed >>>= 0;
  return _seed / 0xffffffff;
}
function pick<T>(arr: readonly T[]): T { return arr[Math.floor(rnd() * arr.length) % arr.length]; }
function slugify(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

console.log('Clearing previous workflow seed...');

const WORKFLOW_TABLES = [
  schema.qualCorrections,
  schema.qualValidations,
  schema.annotations,
  schema.packageAssignments,
  schema.packageFragments,
  schema.packages,
  schema.teamMembers,
  schema.teams,
  schema.fragments,
  schema.corpusUploads,
  schema.dimensionDependencies,
  schema.taxonomyDimensions,
] as const;

await db.transaction(async (tx) => {
  // Cascade dimensions and their taxonomy memberships are owned by this
  // script — wipe them so the cascade upserts cleanly.
  for (const table of WORKFLOW_TABLES) {
    await tx.delete(table);
  }
});

// ─── Look up the catalogue seeded by init.ts ─────────────────────────

const [marta] = await db.select().from(schema.users).where(eq(schema.users.isSuperAdmin, true));
if (!marta) throw new Error('No superadmin found. Run init.ts first.');

const allProjects = await db.select().from(schema.projects);
const q3 = allProjects.find(p => p.slug === 'epdata-2026q3');
if (!q3) throw new Error('Project epdata-2026q3 not found. Run init.ts first.');

async function scaleByName(name: string): Promise<string | null> {
  const [row] = await db.select().from(schema.intensityScales).where(eq(schema.intensityScales.name, name));
  return row?.id ?? null;
}

/** Create a scale with its levels if it does not exist yet. */
async function ensureScale(name: string, kind: schema.ScaleKind, labels: string[]): Promise<string> {
  const existing = await scaleByName(name);
  if (existing) return existing;
  const [row] = await db.insert(schema.intensityScales).values({
    name, kind, isCustom: false, createdBy: marta.id,
  }).returning();
  for (let i = 0; i < labels.length; i++) {
    await db.insert(schema.intensityLevels).values({
      scaleId: row.id, label: labels[i]!, value: String(i + 1), order: i,
    });
  }
  return row.id;
}

const PALETTE = ['#d97757', '#a85a35', '#7d6c4f', '#3d8268', '#5b8fb8', '#8b6db5', '#c79d3c', '#9c5b8b'];

/** Create (or replace) a dimension together with its values. */
async function upsertDimension(opts: {
  name: string; kind: schema.DimensionKind; scaleId: string | null;
  shortDesc: string; longDesc?: string; values: string[];
}): Promise<string> {
  const slug = slugify(opts.name);
  const [existing] = await db.select().from(schema.dimensions).where(eq(schema.dimensions.slug, slug));
  if (existing) {
    await db.delete(schema.dimensionValues).where(eq(schema.dimensionValues.dimensionId, existing.id));
    for (let i = 0; i < opts.values.length; i++) {
      const label = opts.values[i]!;
      await db.insert(schema.dimensionValues).values({
        dimensionId: existing.id, label, value: label, order: i, color: PALETTE[i % PALETTE.length],
      });
    }
    return existing.id;
  }
  const [row] = await db.insert(schema.dimensions).values({
    name: opts.name, slug, kind: opts.kind, scaleId: opts.scaleId,
    shortDescription: opts.shortDesc, longDescription: opts.longDesc,
    status: 'active', createdBy: marta.id,
  }).returning();
  for (let i = 0; i < opts.values.length; i++) {
    const label = opts.values[i]!;
    await db.insert(schema.dimensionValues).values({
      dimensionId: row.id, label, value: label, order: i, color: PALETTE[i % PALETTE.length],
    });
  }
  return row.id;
}

// ─── 1. Hate-speech cascade (the mockup's skip-logic showcase) ───────

const sBool = await ensureScale('Booleano', 'boolean', ['Sí', 'No']);
const sFree = await ensureScale('Texto libre', 'free-text', ['(texto libre)']);
const sHateType = await ensureScale('Tipo de odio', 'categorical', ['Político', 'General', 'Religioso', 'Xenófobo', 'Misógino', 'Sexual']);
const sRelType = await ensureScale('Tipo de religión', 'categorical', ['Anticatólico', 'Antisemita', 'Antimusulmán', 'Antievangélico']);
const sIntensity = await ensureScale('Cuatro niveles', '4-level', ['Incívicos', 'Malintencionado', 'Insulto', 'Amenaza']);

const HATE_TYPES = ['Político', 'General', 'Religioso', 'Xenófobo', 'Misógino', 'Sexual'];
const REL_TYPES = ['Anticatólico', 'Antisemita', 'Antimusulmán', 'Antievangélico'];
const INTENSITIES = ['Incívicos', 'Malintencionado', 'Insulto', 'Amenaza'];

const dHayOdio = await upsertDimension({
  name: '¿Hay odio?', kind: 'flag', scaleId: sBool, values: ['Sí', 'No'],
  shortDesc: 'Pregunta gate. Detecta presencia de discurso de odio en el contenido.',
  longDesc: 'Marca Sí cuando el fragmento contiene deshumanización, generalización ofensiva, insulto identitario o incitación contra un grupo. No se considera odio la crítica política ni el relato negativo de hechos.',
});
const dTipoOdio = await upsertDimension({
  name: 'Tipo de odio', kind: 'category', scaleId: sHateType, values: HATE_TYPES,
  shortDesc: 'Tipo de odio detectado. Solo se muestra cuando ¿Hay odio? = Sí.',
});
const dTipoReligion = await upsertDimension({
  name: 'Tipo de religión', kind: 'category', scaleId: sRelType, values: REL_TYPES,
  shortDesc: 'Subtipo cuando el odio es Religioso.',
});
const dIntensidad = await upsertDimension({
  name: 'Intensidad', kind: 'intensity', scaleId: sIntensity, values: INTENSITIES,
  shortDesc: 'Nivel de intensidad del odio.',
});
const dMetafora = await upsertDimension({
  name: 'Metáfora', kind: 'flag', scaleId: sBool, values: ['Sí', 'No'],
  shortDesc: '¿El contenido usa metáforas para vehicular el odio? Visible siempre.',
});
const dSarcasmo = await upsertDimension({
  name: 'Sarcasmo', kind: 'flag', scaleId: sBool, values: ['Sí', 'No'],
  shortDesc: '¿El contenido usa sarcasmo? Visible siempre.',
});
const dModificador = await upsertDimension({
  name: 'Modificador', kind: 'free-text', scaleId: sFree, values: [],
  shortDesc: 'Campo libre para matizar la etiqueta. Visible siempre.',
});

async function addDependency(childId: string, parentId: string, values: string[], label: string) {
  await db.insert(schema.dimensionDependencies).values({
    dimensionId: childId, dependsOnId: parentId, operator: '=',
    values: JSON.stringify(values), behavior: 'skip', label,
  });
}
await addDependency(dTipoOdio, dHayOdio, ['Sí'], '¿Hay odio? = Sí');
await addDependency(dIntensidad, dHayOdio, ['Sí'], '¿Hay odio? = Sí');
await addDependency(dTipoReligion, dTipoOdio, ['Religioso'], 'Tipo de odio = Religioso');
console.log('  cascade dimensions + 3 dependencies');

// Group them in a taxonomy and assign it to the active project.
const cascadeDims = [dHayOdio, dTipoOdio, dTipoReligion, dIntensidad, dMetafora, dSarcasmo, dModificador];
let [cascadeTax] = await db.select().from(schema.taxonomies)
  .where(eq(schema.taxonomies.slug, 'discurso-de-odio-cascada'));
if (!cascadeTax) {
  [cascadeTax] = await db.insert(schema.taxonomies).values({
    name: 'Discurso de odio (cascada)', slug: 'discurso-de-odio-cascada',
    shortDescription: 'Cascada de odio: pregunta gate, tipo, subtipo religioso e intensidad, más matices formales.',
    color: 'rose', status: 'active', createdBy: marta.id,
  }).returning();
}
await db.delete(schema.taxonomyDimensions)
  .where(eq(schema.taxonomyDimensions.taxonomyId, cascadeTax.id));
for (let i = 0; i < cascadeDims.length; i++) {
  await db.insert(schema.taxonomyDimensions).values({
    taxonomyId: cascadeTax.id, dimensionId: cascadeDims[i]!, order: i,
  });
}
const ptForQ3 = await db.select().from(schema.projectTaxonomies)
  .where(eq(schema.projectTaxonomies.projectId, q3.id));
if (!ptForQ3.some(r => r.taxonomyId === cascadeTax.id)) {
  await db.insert(schema.projectTaxonomies).values({
    projectId: q3.id, taxonomyId: cascadeTax.id, assignedBy: marta.id,
  });
}

// ─── 2. Roster ───────────────────────────────────────────────────────

type SeedUser = { email: string; name: string; color: string };
const ROSTER: SeedUser[] = [
  { email: 'luis.ortega@unir.es',      name: 'Luis Ortega',       color: '#3b6cb0' },
  { email: 'ana.diaz@unir.es',         name: 'Ana Díaz',          color: '#c75d3a' },
  { email: 'pedro.gomez@unir.es',      name: 'Pedro Gómez',       color: '#c75d3a' },
  { email: 'sofia.ramos@unir.es',      name: 'Sofía Ramos',       color: '#3d8268' },
  { email: 'juan.perez@unir.es',       name: 'Juan Pérez',        color: '#8b6db5' },
  { email: 'lucia.fernandez@unir.es',  name: 'Lucía Fernández',   color: '#3b6cb0' },
  { email: 'miguel.ruiz@unir.es',      name: 'Miguel Ruiz',       color: '#a85a35' },
  { email: 'carla.serrano@unir.es',    name: 'Carla Serrano',     color: '#9c5b8b' },
  { email: 'diego.molina@unir.es',     name: 'Diego Molina',      color: '#5b8fb8' },
  { email: 'elena.vidal@unir.es',      name: 'Elena Vidal',       color: '#c79d3c' },
  { email: 'carlos.antunez@epdata.es', name: 'Carlos Antúnez',    color: '#3b6cb0' },
  { email: 'sara.velasco@unir.es',     name: 'Sara Velasco',      color: '#c75d3a' },
  { email: 'javier.moreno@epdata.es',  name: 'Javier Moreno',     color: '#7d6c4f' },
];

const userIds: Record<string, string> = { 'Marta R.': marta.id };
for (const u of ROSTER) {
  const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, u.email));
  if (existing) { userIds[u.name] = existing.id; continue; }
  const [row] = await db.insert(schema.users).values({
    email: u.email, name: u.name, avatarColor: u.color, isSuperAdmin: false,
  }).returning();
  userIds[u.name] = row.id;
}
console.log('  users:', Object.keys(userIds).length);

// Every annotator is also a project member.
for (const name of Object.keys(userIds)) {
  const uid = userIds[name]!;
  const existingMemberships = await db.select().from(schema.projectMembers)
    .where(eq(schema.projectMembers.userId, uid));
  if (existingMemberships.some(m => m.projectId === q3.id)) continue;
  const role: schema.UserRole = uid === marta.id ? 'projectadmin'
    : ['Carlos Antúnez', 'Sara Velasco', 'Javier Moreno'].includes(name) ? 'validator'
    : 'annotator';
  await db.insert(schema.projectMembers).values({ projectId: q3.id, userId: uid, role });
}

// ─── 3. Teams ────────────────────────────────────────────────────────

const TEAM_SPEC = [
  { name: 'Equipo A', members: ['Marta R.', 'Luis Ortega', 'Ana Díaz'] },
  { name: 'Equipo B', members: ['Pedro Gómez', 'Sofía Ramos', 'Juan Pérez'] },
  { name: 'Equipo C', members: ['Lucía Fernández', 'Miguel Ruiz'] },
  { name: 'Equipo D', members: ['Carla Serrano', 'Diego Molina', 'Elena Vidal'] },
];

const teamIds: Record<string, string> = {};
for (const t of TEAM_SPEC) {
  const [row] = await db.insert(schema.teams).values({
    projectId: q3.id, name: t.name, groupSize: t.members.length, consensusMetric: 'fleiss',
  }).returning();
  teamIds[t.name] = row.id;
  for (const m of t.members) {
    await db.insert(schema.teamMembers).values({ teamId: row.id, userId: userIds[m], role: 'annotator' });
  }
}
console.log('  teams:', Object.keys(teamIds).length);

// ─── 4. Corpus upload + fragments ────────────────────────────────────

const [upload] = await db.insert(schema.corpusUploads).values({
  projectId: q3.id,
  filename: 'EpData_Reader_T2_2026Q3.xlsx',
  sheetName: 'respuestas',
  sizeBytes: 3_984_588,
  rowCount: 3662,
  uniqueCount: 3634,
  duplicateCount: 28,
  avgTokens: 412,
  fragmentablePct: 38,
  columnMapping: JSON.stringify({
    pivot: { column: 'A', field: 'respuestaTurno1' },
    conversationId: { column: 'B', field: 'conversacionId' },
    question: { column: 'C', field: 'preguntaTurno1' },
    metadata: [],
  }),
  status: 'segmented',
  uploadedBy: marta.id,
}).returning();

// A default segmentation config, matching the mockup's live-preview defaults.
const existingSeg = await db.select().from(schema.segmentationConfigs)
  .where(eq(schema.segmentationConfigs.projectId, q3.id));
if (existingSeg.length === 0) {
  await db.insert(schema.segmentationConfigs).values({
    projectId: q3.id, name: 'Default (palabras)', unit: 'word',
    maxChunkSize: 120, overlap: 20, respectBoundaries: true, tolerance: 15,
  });
}

// Question / answer pool. `hate` marks fragments that should trigger the
// cascade, so the skip-logic is exercised by real data.
type QA = { q: string; a: string; hate?: boolean };
const NEUTRAL: QA[] = [
  { q: '¿Cómo ha evolucionado el precio de la vivienda en España?',
    a: 'Las transacciones de viviendas alcanzaron máximos en 2007 con 70.928 operaciones, seguidas de una caída del 61% en 2009. En 2024 se registraron 63.859 transacciones, aproximándose a los niveles previos a la crisis.' },
  { q: '¿Cuál es la tasa de paro juvenil en las comunidades autónomas?',
    a: 'La tasa de paro juvenil se sitúa en el 26,4% de media nacional. Andalucía y Extremadura superan el 35%, mientras el País Vasco y Navarra se mantienen por debajo del 18%.' },
  { q: '¿Cómo ha cambiado la tasa de gonorrea por habitante en Uzbekistán?',
    a: 'No dispongo de datos sobre la tasa de gonorrea en Uzbekistán. Los datos disponibles en EpData se limitan a España, donde la serie cubre el período 1982–2019. Si te interesa la evolución en España, puedo proporcionarte ese análisis.' },
  { q: '¿Qué porcentaje del PIB representa la deuda pública?',
    a: 'En 2021 la deuda alcanzó su máximo histórico del 123,1% del PIB, impulsada por los gastos de respuesta a la pandemia. Desde entonces ha descendido hasta el 105,7% registrado en 2024.' },
  { q: '¿Cuántos habitantes tiene la Isla Bouvet?',
    a: 'Isla Bouvet es un territorio deshabitado sin población civil ni infraestructura vial. Pertenece a Noruega y se utiliza únicamente para observación meteorológica automatizada.' },
  { q: '¿Cuál es la esperanza de vida en España comparada con la UE?',
    a: 'España registra 83,2 años de esperanza de vida al nacer, por encima de la media de la UE-27, situada en 80,9 años. Solo Italia presenta cifras comparables.' },
  { q: '¿Se puede visualizar la evolución del salario mínimo?',
    a: 'Lo siento, no ha sido posible generar la visualización solicitada en este momento. Puedes consultar la serie completa en la sección de mercado laboral.' },
  { q: '¿Qué comunidades reciben más financiación por habitante?',
    a: 'Cantabria y La Rioja encabezan la financiación por habitante ajustada, con cifras un 20% superiores a la media. Valencia y Murcia se sitúan en la cola del sistema.' },
  { q: '¿Cómo se distribuye el gasto sanitario por comunidad?',
    a: 'El gasto sanitario per cápita oscila entre los 1.320 euros de Andalucía y los 1.890 del País Vasco. La media nacional se sitúa en 1.586 euros.' },
  { q: '¿Cuál es la brecha salarial de género en España?',
    a: 'La brecha salarial se sitúa en el 18,7% según los últimos microdatos de la Encuesta de Estructura Salarial. Se ha reducido 4,2 puntos en la última década.' },
  { q: '¿Cuántas viviendas turísticas hay registradas?',
    a: 'El registro contabiliza 351.389 viviendas de uso turístico, un 9,2% más que el año anterior. Canarias y Andalucía concentran el 38% del total.' },
  { q: '¿Qué evolución ha tenido la natalidad?',
    a: 'La tasa de natalidad ha caído hasta 6,9 nacimientos por cada mil habitantes, la cifra más baja de la serie histórica iniciada en 1975.' },
  { q: '¿Cuál es el consumo eléctrico renovable?',
    a: 'Las renovables cubrieron el 56,8% de la generación eléctrica peninsular. La eólica aportó el 23,5% y la fotovoltaica el 17,1%.' },
  { q: '¿Cómo han variado las pensiones medias?',
    a: 'La pensión media de jubilación alcanza los 1.442 euros mensuales tras la revalorización. Las nuevas altas superan los 1.600 euros de media.' },
  { q: '¿Qué datos hay sobre siniestralidad laboral?',
    a: 'Se registraron 579.000 accidentes de trabajo con baja, un 2,1% más que el ejercicio anterior. El sector de la construcción concentra el mayor índice de incidencia.' },
];
const HATEFUL: QA[] = [
  { q: '¿Qué opinan los usuarios sobre la llegada de migrantes a la región?',
    a: 'Algunos comentarios recogidos afirman que "esa gentuza no debería poder entrar aquí" y que "hay que echarlos a todos al mar". El corpus recoge estas expresiones sin filtrar.', hate: true },
  { q: '¿Cómo se refieren los foros a las políticas de igualdad?',
    a: 'Se registran mensajes del tipo "estas feminazis solo buscan destruir la familia" y descalificaciones personales reiteradas contra portavoces femeninas.', hate: true },
  { q: '¿Qué lenguaje aparece en los hilos sobre religión?',
    a: 'Aparecen expresiones despectivas contra practicantes musulmanes, incluyendo generalizaciones como "todos son unos fanáticos" y llamamientos a cerrar lugares de culto.', hate: true },
  { q: '¿Qué tono tienen los comentarios sobre políticos rivales?',
    a: 'Predomina la descalificación: "esta panda de corruptos merece acabar en la cárcel o algo peor". El registro incluye amenazas veladas contra cargos públicos.', hate: true },
  { q: '¿Se detecta lenguaje ofensivo en las respuestas sobre etnias?',
    a: 'Sí. Se documentan expresiones como "son todos unos ladrones por naturaleza", una generalización étnica que el clasificador marca como discurso de odio.', hate: true },
];

console.log('  generating fragments...');
const FRAGMENTS_PER_PACKAGE = 50;
const TOTAL_FRAGMENTS = FRAGMENTS_PER_PACKAGE * TEAM_SPEC.length;

type SeededFragment = { id: string; hate: boolean };
const seededFragments: SeededFragment[] = [];

await db.transaction(async (tx) => {
  for (let i = 0; i < TOTAL_FRAGMENTS; i++) {
    // ~22% of the corpus carries hate content, so the cascade is well exercised.
    const isHate = rnd() < 0.22;
    const qa = isHate ? pick(HATEFUL) : pick(NEUTRAL);
    const id = `frg_${(i + 1).toString().padStart(4, '0')}`;
    const text = qa.a;
    await tx.insert(schema.fragments).values({
      id,
      projectId: q3.id,
      uploadId: upload.id,
      conversationId: `${Math.floor(rnd() * 0xffffff).toString(16).padStart(6, '0')}-95d6-411b-a14a-${Math.floor(rnd() * 0xffffffff).toString(16).padStart(8, '0')}`,
      question: qa.q,
      sourceText: qa.a,
      text,
      fragmentIndex: 1,
      fragmentTotal: 1,
      variant: 1 + Math.floor(rnd() * 3),
      charLength: text.length,
      tokenCount: Math.round(text.length / 4),
      apiSuccess: rnd() < 0.96,
      isDuplicate: false,
    });
    seededFragments.push({ id, hate: !!qa.hate });
  }
});
console.log('  fragments:', seededFragments.length);

// ─── 5. Resolve the project's dimension set (through its taxonomies) ─

const projectTaxIds = (await db.select().from(schema.projectTaxonomies)
  .where(eq(schema.projectTaxonomies.projectId, q3.id))).map(r => r.taxonomyId);

const dimIdSet = new Set<string>();
for (const taxId of projectTaxIds) {
  for (const td of await db.select().from(schema.taxonomyDimensions)
    .where(eq(schema.taxonomyDimensions.taxonomyId, taxId))) {
    dimIdSet.add(td.dimensionId);
  }
}

type ProjDim = {
  id: string; name: string; kind: schema.DimensionKind;
  values: string[];
  dep: { parentId: string; values: string[] } | null;
  depth: number;
};

const allDimRows = (await db.select().from(schema.dimensions))
  .filter(d => dimIdSet.has(d.id) && d.status === 'active');
const allDeps = await db.select().from(schema.dimensionDependencies);

const projDims: ProjDim[] = [];
for (const d of allDimRows) {
  const values = (await db.select().from(schema.dimensionValues)
    .where(eq(schema.dimensionValues.dimensionId, d.id)))
    .sort((a, b) => a.order - b.order).map(v => v.label);
  const dep = allDeps.find(x => x.dimensionId === d.id);
  projDims.push({
    id: d.id, name: d.name, kind: d.kind, values,
    dep: dep ? { parentId: dep.dependsOnId, values: JSON.parse(dep.values) as string[] } : null,
    depth: 0,
  });
}

// Depth = length of the dependency chain, so we can resolve parents first.
const dimById = new Map(projDims.map(d => [d.id, d]));
for (const d of projDims) {
  let depth = 0, cur = d;
  while (cur.dep && dimById.has(cur.dep.parentId) && depth < 10) {
    depth++; cur = dimById.get(cur.dep.parentId)!;
  }
  d.depth = depth;
}
const orderedDims = [...projDims].sort((a, b) => a.depth - b.depth || a.name.localeCompare(b.name));
console.log('  project dimensions:', orderedDims.length, '(max depth', Math.max(...projDims.map(d => d.depth)) + ')');

type Answer = { value: string | null; skipped: boolean };

/** Walk the cascade, asking `valueFor` only for dimensions that stay visible. */
function resolveAnswers(valueFor: (d: ProjDim) => string): Map<string, Answer> {
  const answers = new Map<string, Answer>();
  for (const d of orderedDims) {
    if (d.dep) {
      const parent = answers.get(d.dep.parentId);
      const visible = !!parent && !parent.skipped && parent.value !== null && d.dep.values.includes(parent.value);
      if (!visible) { answers.set(d.id, { value: null, skipped: true }); continue; }
    }
    answers.set(d.id, { value: valueFor(d), skipped: false });
  }
  return answers;
}

const hayOdioId = dHayOdio;

/** The value the team as a whole converged on for this fragment. */
function consensusValueFor(d: ProjDim, isHate: boolean): string {
  if (d.kind === 'free-text') return '';
  if (d.id === hayOdioId) return isHate ? 'Sí' : 'No';
  if (d.values.length === 0) return '';
  // Bias towards the first value so annotations are not uniformly random:
  // real corpora are dominated by "no bias detected".
  const r = rnd();
  if (r < 0.55) return d.values[0]!;
  return d.values[Math.floor(rnd() * d.values.length) % d.values.length]!;
}

// ─── 6. Packages, assignments and annotations ────────────────────────

type TeamPlan = {
  team: string; code: string; from: number; annotated: number;
  /** Multiplies every dimension's base difficulty for this team. */
  noise: number;
  submitted: boolean; status: schema.PackageStatus;
};
const PLANS: TeamPlan[] = [
  { team: 'Equipo A', code: 'PK-A-001', from: 0,   annotated: 50, noise: 1.0, submitted: true,  status: 'returned' },
  { team: 'Equipo B', code: 'PK-B-001', from: 50,  annotated: 50, noise: 0.35, submitted: true, status: 'approved' },
  { team: 'Equipo C', code: 'PK-C-001', from: 100, annotated: 50, noise: 1.8, submitted: true,  status: 'returned' },
  { team: 'Equipo D', code: 'PK-D-001', from: 150, annotated: 20, noise: 0.8, submitted: false, status: 'in_progress' },
];

// How hard each dimension is to agree on. Real annotation campaigns show a
// wide spread: a yes/no gate is near-unanimous, "is this tendentious?" is not.
// This is what makes the kappa-by-dimension chart meaningful.
const DIFFICULTY: Record<string, number> = {
  '¿Hay odio?': 0.02,
  'Tipo de odio': 0.14,
  'Tipo de religión': 0.16,
  'Intensidad': 0.20,
  'Metáfora': 0.10,
  'Sarcasmo': 0.13,
  'Carácter tendencioso': 0.26,
  'Emotividad': 0.18,
  'Semiótica': 0.08,
  'Género': 0.11,
  'Raza / etnia': 0.05,
  'Religión': 0.05,
  'Sesgo demográfico': 0.07,
  'Sesgo estadístico': 0.06,
  'Incoherencia factual': 0.09,
  'Sesgo de odio': 0.12,
  'Toxicidad': 0.10,
};
const DEFAULT_DIFFICULTY = 0.08;

let annotationCount = 0;

await db.transaction(async (tx) => {
  for (const plan of PLANS) {
    const spec = TEAM_SPEC.find(t => t.name === plan.team)!;
    const teamId = teamIds[plan.team]!;
    const memberIds = spec.members.map(m => userIds[m]!);

    const [pkg] = await tx.insert(schema.packages).values({
      projectId: q3.id, teamId, code: plan.code, isMirror: true,
      status: plan.status, version: plan.status === 'returned' ? 2 : 1,
      returnCount: plan.status === 'returned' ? 1 : 0,
      notes: plan.status === 'returned' ? 'Reenviado por superar el umbral de discrepancia' : null,
    }).returning();

    const slice = seededFragments.slice(plan.from, plan.from + FRAGMENTS_PER_PACKAGE);
    for (let i = 0; i < slice.length; i++) {
      await tx.insert(schema.packageFragments).values({
        packageId: pkg.id, fragmentId: slice[i]!.id, order: i,
      });
    }

    for (let i = 0; i < memberIds.length; i++) {
      await tx.insert(schema.packageAssignments).values({
        packageId: pkg.id, userId: memberIds[i]!,
        status: plan.submitted ? 'submitted' : 'in_progress',
        version: plan.submitted ? 1 : 0,
        isLead: i === 0,
        submittedAt: plan.submitted ? new Date(Date.now() - 3600_000 * (i + 1)) : null,
      });
    }

    const toAnnotate = slice.slice(0, plan.annotated);
    for (const frag of toAnnotate) {
      // The value the team would converge on, before individual disagreement.
      const consensus = resolveAnswers(d => consensusValueFor(d, frag.hate));

      for (const uid of memberIds) {
        // Each annotator independently deviates per dimension, at a rate set
        // by that dimension's difficulty. Deviating on a gate re-resolves the
        // cascade for this annotator, so their skipped set differs too.
        const overrides = new Map<string, string>();
        for (const d of orderedDims) {
          if (d.kind === 'free-text' || d.values.length < 2) continue;
          if (consensus.get(d.id)!.skipped) continue;
          const rate = (DIFFICULTY[d.name] ?? DEFAULT_DIFFICULTY) * plan.noise;
          if (rnd() >= rate) continue;
          const current = consensus.get(d.id)!.value;
          const alt = d.values.filter(v => v !== current);
          if (alt.length) overrides.set(d.id, alt[Math.floor(rnd() * alt.length) % alt.length]!);
        }

        const answers = overrides.size > 0
          ? resolveAnswers(d => overrides.get(d.id) ?? consensus.get(d.id)?.value ?? consensusValueFor(d, frag.hate))
          : consensus;

        for (const d of orderedDims) {
          const a = answers.get(d.id)!;
          await tx.insert(schema.annotations).values({
            id: `ann_${(++annotationCount).toString(36)}`,
            fragmentId: frag.id, packageId: pkg.id, userId: uid, dimensionId: d.id,
            value: a.skipped ? null : a.value,
            skipped: a.skipped,
          });
        }
      }
    }
  }
});
console.log('  packages:', PLANS.length, '· annotations:', annotationCount);

// ─── 7. Qualitative validation samples ───────────────────────────────
//
// Each team gets a 20-fragment random sample (the mockup's 5%–30% band).
// Some are already reviewed, so the view opens with real progress.

const SAMPLE_SIZE = 20;
const QUAL_PLAN: Record<string, number> = { 'Equipo A': 11, 'Equipo B': 20, 'Equipo C': 0, 'Equipo D': 13 };
const validatorId = userIds['Sara Velasco'];

const REJECT_REASONS = [
  'La intensidad asignada no se corresponde con el fragmento.',
  'El equipo marcó odio donde solo hay crítica política.',
  'Falta marcar el sarcasmo evidente en la respuesta.',
  'La emotividad está infravalorada para este tono.',
];

let qualCount = 0, correctionCount = 0;

await db.transaction(async (tx) => {
  for (const plan of PLANS) {
    const teamId = teamIds[plan.team]!;
    const [pkg] = await tx.select().from(schema.packages)
      .where(eq(schema.packages.code, plan.code));
    const slice = seededFragments.slice(plan.from, plan.from + plan.annotated);
    const sample = slice.slice(0, Math.min(SAMPLE_SIZE, slice.length));
    const reviewed = QUAL_PLAN[plan.team] ?? 0;

    for (let i = 0; i < sample.length; i++) {
      const frag = sample[i]!;
      const isReviewed = i < reviewed;
      // Roughly a fifth of reviewed fragments need a correction.
      const corrected = isReviewed && rnd() < 0.22;
      const status: schema.QualDecision = !isReviewed ? 'pending' : corrected ? 'corrected' : 'approved';
      const [val] = await tx.insert(schema.qualValidations).values({
        projectId: q3.id, teamId, packageId: pkg?.id ?? null, fragmentId: frag.id,
        validatorId: isReviewed ? validatorId : null,
        status,
        rejectReason: corrected ? pick(REJECT_REASONS) : null,
        reviewedAt: isReviewed ? new Date(Date.now() - 3600_000 * (i + 1)) : null,
      }).returning();
      qualCount++;

      if (corrected) {
        // Override one dimension the team actually answered.
        const answered = (await tx.select().from(schema.annotations)
          .where(eq(schema.annotations.fragmentId, frag.id)))
          .filter(a => !a.skipped && a.value);
        if (answered.length) {
          const target = answered[Math.floor(rnd() * answered.length) % answered.length]!;
          const d = dimById.get(target.dimensionId);
          const alt = (d?.values ?? []).filter(v => v !== target.value);
          if (alt.length) {
            await tx.insert(schema.qualCorrections).values({
              validationId: val.id, dimensionId: target.dimensionId,
              originalValue: target.value, correctedValue: alt[Math.floor(rnd() * alt.length) % alt.length]!,
            });
            correctionCount++;
          }
        }
      }
    }
  }
});
console.log('  qual validations:', qualCount, '· corrections:', correctionCount);

await client.end();
console.log('\nWorkflow seed complete.');
