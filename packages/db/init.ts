// One-off: create SQLite schema and seed data, bypassing packages/db/src/client.ts
// (which has a syntax error in closeDb). Imports schema directly. Delete after.
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './src/index';

const DB_PATH = (process.env.DATABASE_URL ?? 'file:./etiquetador.db').replace(/^file:(?:\/\/)?/, '');
const sqlite = new Database(DB_PATH);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');
const db = drizzle(sqlite, { schema });

console.log('Creating tables...');

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, email TEXT NOT NULL, name TEXT, avatar_color TEXT,
    is_super_admin INTEGER NOT NULL DEFAULT 0, email_verified_at INTEGER,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
  CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users(email);

  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL,
    description TEXT, status TEXT NOT NULL DEFAULT 'active',
    created_by TEXT NOT NULL REFERENCES users(id),
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
  CREATE UNIQUE INDEX IF NOT EXISTS projects_slug_unique ON projects(slug);

  CREATE TABLE IF NOT EXISTS project_members (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'annotator',
    created_at INTEGER NOT NULL);
  CREATE UNIQUE INDEX IF NOT EXISTS project_members_unique ON project_members(project_id, user_id);

  CREATE TABLE IF NOT EXISTS intensity_scales (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL,
    is_custom INTEGER NOT NULL DEFAULT 0,
    created_by TEXT REFERENCES users(id),
    created_at INTEGER NOT NULL);
  CREATE UNIQUE INDEX IF NOT EXISTS intensity_scales_name_unique ON intensity_scales(name);

  CREATE TABLE IF NOT EXISTS intensity_levels (
    id TEXT PRIMARY KEY,
    scale_id TEXT NOT NULL REFERENCES intensity_scales(id) ON DELETE CASCADE,
    label TEXT NOT NULL, value TEXT NOT NULL, "order" INTEGER NOT NULL, color TEXT);
  CREATE UNIQUE INDEX IF NOT EXISTS intensity_levels_scale_order_unique ON intensity_levels(scale_id, "order");

  CREATE TABLE IF NOT EXISTS dimensions (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL,
    description TEXT, short_description TEXT, long_description TEXT,
    kind TEXT NOT NULL, scale_id TEXT REFERENCES intensity_scales(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_by TEXT REFERENCES users(id),
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
  CREATE UNIQUE INDEX IF NOT EXISTS dimensions_slug_unique ON dimensions(slug);

  CREATE TABLE IF NOT EXISTS dimension_values (
    id TEXT PRIMARY KEY,
    dimension_id TEXT NOT NULL REFERENCES dimensions(id) ON DELETE CASCADE,
    label TEXT NOT NULL, value TEXT NOT NULL, "order" INTEGER NOT NULL, color TEXT);
  CREATE UNIQUE INDEX IF NOT EXISTS dimension_values_dim_order_unique ON dimension_values(dimension_id, "order");

  CREATE TABLE IF NOT EXISTS taxonomies (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL,
    short_description TEXT, long_description TEXT, color TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_by TEXT REFERENCES users(id),
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
  CREATE UNIQUE INDEX IF NOT EXISTS taxonomies_slug_unique ON taxonomies(slug);

  CREATE TABLE IF NOT EXISTS taxonomy_dimensions (
    taxonomy_id TEXT NOT NULL REFERENCES taxonomies(id) ON DELETE CASCADE,
    dimension_id TEXT NOT NULL REFERENCES dimensions(id) ON DELETE CASCADE,
    "order" INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (taxonomy_id, dimension_id));
  CREATE INDEX IF NOT EXISTS taxonomy_dimensions_dim_idx ON taxonomy_dimensions(dimension_id);

  CREATE TABLE IF NOT EXISTS project_taxonomies (
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    taxonomy_id TEXT NOT NULL REFERENCES taxonomies(id) ON DELETE CASCADE,
    assigned_by TEXT REFERENCES users(id),
    assigned_at INTEGER NOT NULL,
    PRIMARY KEY (project_id, taxonomy_id));
  CREATE INDEX IF NOT EXISTS project_taxonomies_tax_idx ON project_taxonomies(taxonomy_id);

  CREATE TABLE IF NOT EXISTS segmentation_configs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL, unit TEXT NOT NULL,
    max_chunk_size INTEGER NOT NULL, overlap INTEGER NOT NULL DEFAULT 0,
    respect_boundaries INTEGER NOT NULL DEFAULT 1, tolerance INTEGER NOT NULL DEFAULT 15,
    created_at INTEGER NOT NULL);
  CREATE UNIQUE INDEX IF NOT EXISTS segmentation_configs_name_project_unique ON segmentation_configs(project_id, name);

  CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    actor_id TEXT REFERENCES users(id),
    project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
    action TEXT NOT NULL, target_type TEXT, target_id TEXT, metadata TEXT,
    created_at INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS audit_log_actor_idx ON audit_log(actor_id);
  CREATE INDEX IF NOT EXISTS audit_log_project_idx ON audit_log(project_id);
  CREATE INDEX IF NOT EXISTS audit_log_created_idx ON audit_log(created_at);
`);

console.log('Tables created. Seeding...');

function slugify(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-');
}

// 1. Superadmin user
const [marta] = db.insert(schema.users).values({
  email: 'marta@etiquetador.local',
  name: 'Marta R.',
  avatarColor: 'linear-gradient(135deg,#0e4a52,#1d6e75)',
  isSuperAdmin: true,
}).returning().all();
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
  const [row] = db.insert(schema.intensityScales).values({
    name: s.name, kind: s.kind, isCustom: false, createdBy: marta.id,
  }).returning().all();
  scaleIds[s.name] = row.id;
  s.levels.forEach((lv, i) => {
    db.insert(schema.intensityLevels).values({ scaleId: row.id, label: lv.label, value: lv.value, order: i }).run();
  });
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
  const [row] = db.insert(schema.dimensions).values({
    name: d.name, slug: slugify(d.name), shortDescription: d.shortDesc,
    kind: 'category', scaleId: scaleIds[d.scale], status: 'active', createdBy: marta.id,
  }).returning().all();
  dimIds[d.name] = row.id;
  const levels = scales.find(s => s.name === d.scale)!.levels;
  levels.forEach((lv, i) => {
    db.insert(schema.dimensionValues).values({ dimensionId: row.id, label: lv.label, value: lv.value, order: i }).run();
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
  const [row] = db.insert(schema.projects).values({
    name: p.name, slug: p.slug, description: p.desc, status: 'active', createdBy: marta.id,
  }).returning().all();
  projIds[p.slug] = row.id;
  db.insert(schema.projectMembers).values({ projectId: row.id, userId: marta.id, role: 'projectadmin' }).run();
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
  const [row] = db.insert(schema.taxonomies).values({
    name: t.name, slug: slugify(t.name), shortDescription: t.shortDesc, color: t.color, status: 'active', createdBy: marta.id,
  }).returning().all();
  taxIds[t.name] = row.id;
  t.dims.forEach((dimName, i) => {
    const dimId = dimIds[dimName];
    if (dimId) {
      db.insert(schema.taxonomyDimensions).values({ taxonomyId: row.id, dimensionId: dimId, order: i }).run();
    }
  });
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
    db.insert(schema.projectTaxonomies).values({ projectId: projId, taxonomyId: taxId, assignedBy: marta.id }).run();
  }
}
console.log('  project-taxonomy assignments done.');

sqlite.close();
console.log('Seed complete. Marta R. is superadmin.');
