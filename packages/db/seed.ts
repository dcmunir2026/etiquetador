import { getDb } from './src/client';
import { users, projects, intensityScales, intensityLevels, dimensions, dimensionValues, taxonomies, taxonomyDimensions, projectTaxonomies, projectMembers } from './src/index';
import bcrypt from 'bcryptjs';

const db = getDb();

console.log('Seeding...');

// 1. Superadmin user — Marta comes with a known default password so the
// prototype is usable end-to-end right after a fresh seed.
const passwordHash = await bcrypt.hash('marta1234', 10);
const [marta] = db.insert(users).values({
  email: 'marta@etiquetador.local',
  name: 'Marta R.',
  avatarColor: 'linear-gradient(135deg,#0e4a52,#1d6e75)',
  isSuperAdmin: true,
  passwordHash,
}).returning().all();
console.log('  user:', marta.email, '(password: marta1234)');

// 2. Intensity scales (global)
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
  const [row] = db.insert(intensityScales).values({
    name: s.name, kind: s.kind, isCustom: false, createdBy: marta.id,
  }).returning().all();
  scaleIds[s.name] = row.id;
  s.levels.forEach((lv, i) => {
    db.insert(intensityLevels).values({
      scaleId: row.id, label: lv.label, value: lv.value, order: i,
    }).run();
  });
}
console.log('  scales:', Object.keys(scaleIds).length);

// 3. Dimensions (global, 11)
const dimData = [
  { name: 'Sesgo de odio', shortDesc: 'Detecta insinuaciones o discurso explícito de odio en el contenido.', scale: 'Tres niveles', color: 'tk-odio' },
  { name: 'Emotividad', shortDesc: 'Detecta si el tono es neutro, valorativo o cargado emocionalmente.', scale: 'Tres niveles', color: 'tk-emot' },
  { name: 'Carácter tendencioso', shortDesc: '¿Imparcial o con sesgo (sutil o claro)?', scale: 'Tres niveles', color: 'tk-tend' },
  { name: 'Semiótica', shortDesc: 'Detecta uso de lenguaje figurado, irónico o sarcástico.', scale: 'Tres niveles', color: 'tk-semi' },
  { name: 'Género', shortDesc: '¿Tratamiento neutral o con sesgo de género?', scale: 'Tres niveles', color: 'tk-gen' },
  { name: 'Raza / etnia', shortDesc: 'Detecta contenido racista o con sesgo étnico.', scale: 'Tres niveles', color: 'tk-race' },
  { name: 'Religión', shortDesc: 'Detecta contenido con sesgo religioso.', scale: 'Tres niveles', color: 'tk-rel' },
  { name: 'Sesgo demográfico', shortDesc: 'Detecta sesgo por edad, origen o clase social.', scale: 'Cinco niveles', color: 'tk-demo' },
  { name: 'Sesgo estadístico', shortDesc: 'Evalúa si los datos cuantitativos/cualitativos son correctos, faltan fuentes o hay cifras imprecisas.', scale: 'Tres niveles', color: 'tk-stat' },
  { name: 'Toxicidad', shortDesc: 'Mide el nivel de toxicidad general (insultos, vulgaridad, agresividad).', scale: 'Cinco niveles', color: 'tk-toxic' },
  { name: 'Incoherencia factual', shortDesc: 'Marca respuestas que contradicen datos verificables del propio contexto o del corpus.', scale: 'Binario', color: 'tk-fact' },
];

const dimIds: Record<string, string> = {};
for (const d of dimData) {
  const slug = d.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-');
  const [row] = db.insert(dimensions).values({
    name: d.name,
    slug,
    shortDescription: d.shortDesc,
    kind: 'category',
    scaleId: scaleIds[d.scale],
    status: 'active',
    createdBy: marta.id,
  }).returning().all();
  dimIds[d.name] = row.id;
  // add default values
  const scaleName = d.scale;
  const levels = scales.find(s => s.name === scaleName)!.levels;
  levels.forEach((lv, i) => {
    db.insert(dimensionValues).values({
      dimensionId: row.id, label: lv.label, value: lv.value, order: i,
    }).run();
  });
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
  const [row] = db.insert(projects).values({
    name: p.name, slug: p.slug, description: p.desc, status: 'active', createdBy: marta.id,
  }).returning().all();
  projIds[p.slug] = row.id;
  db.insert(projectMembers).values({
    projectId: row.id, userId: marta.id, role: 'projectadmin',
  }).run();
}
console.log('  projects:', Object.keys(projIds).length);

// 5. Taxonomies (global, 4)
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
  const slug = t.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-');
  const [row] = db.insert(taxonomies).values({
    name: t.name, slug, shortDescription: t.shortDesc, color: t.color, status: 'active', createdBy: marta.id,
  }).returning().all();
  taxIds[t.name] = row.id;
  t.dims.forEach((dimName, i) => {
    const dimId = dimIds[dimName];
    if (dimId) {
      db.insert(taxonomyDimensions).values({
        taxonomyId: row.id, dimensionId: dimId, order: i,
      }).run();
    }
  });
}
console.log('  taxonomies:', Object.keys(taxIds).length);

// 6. Assign taxonomies to projects
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
    db.insert(projectTaxonomies).values({
      projectId: projId, taxonomyId: taxId, assignedBy: marta.id,
    }).run();
  }
}
console.log('  project-taxonomy assignments done.');

console.log('\nSeed complete. Marta R. is superadmin, can switch between 4 projects, 11 dimensions, 4 taxonomies.');
