// Gives every seeded account a password so the login screen is usable in dev,
// and makes sure each of the five roles is represented by someone.
//
//   DATABASE_URL=file:./etiquetador.db pnpm seed:passwords
//
// The password is dev-only. Pass DEV_PASSWORD to override it. Never run this
// against anything but a local database.

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { and, eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import * as schema from './src/index';

const DB_PATH = (process.env.DATABASE_URL ?? 'file:./etiquetador.db').replace(/^file:(?:\/\/)?/, '');
const PASSWORD = process.env.DEV_PASSWORD ?? 'etiquetador';

const sqlite = new Database(DB_PATH);
sqlite.pragma('foreign_keys = ON');
const db = drizzle(sqlite, { schema });

const hash = bcrypt.hashSync(PASSWORD, 10);

const allUsers = db.select().from(schema.users).all();
if (allUsers.length === 0) throw new Error('No users. Run init.ts first.');

for (const u of allUsers) {
  db.update(schema.users).set({ passwordHash: hash }).where(eq(schema.users.id, u.id)).run();
}
console.log(`Contraseña puesta a ${allUsers.length} cuentas.`);

// ─── Make every role exercisable ─────────────────────────────────────
// The seed only produced superadmin, annotator and validator. Promote one
// person to project admin and add an observer so the matrix can be tested
// end to end.

const [q3] = db.select().from(schema.projects).where(eq(schema.projects.slug, 'epdata-2026q3')).all();
if (!q3) throw new Error('Project epdata-2026q3 not found.');

function setRole(email: string, role: schema.UserRole) {
  const [user] = db.select().from(schema.users).where(eq(schema.users.email, email)).all();
  if (!user) { console.log(`  (sin cambios) no existe ${email}`); return; }
  const [member] = db.select().from(schema.projectMembers)
    .where(and(eq(schema.projectMembers.projectId, q3!.id), eq(schema.projectMembers.userId, user.id))).all();
  if (member) {
    db.update(schema.projectMembers).set({ role })
      .where(eq(schema.projectMembers.id, member.id)).run();
  } else {
    db.insert(schema.projectMembers).values({ projectId: q3!.id, userId: user.id, role }).run();
  }
  console.log(`  ${user.name} → ${role}`);
}

setRole('carlos.antunez@epdata.es', 'projectadmin');

// An observer, so read-only access has a face.
const OBSERVER = 'observador@epdata.es';
let [observer] = db.select().from(schema.users).where(eq(schema.users.email, OBSERVER)).all();
if (!observer) {
  [observer] = db.insert(schema.users).values({
    email: OBSERVER, name: 'Rosa Iglesias', avatarColor: '#7d6c4f',
    isSuperAdmin: false, passwordHash: hash,
  }).returning().all();
}
setRole(OBSERVER, 'viewer');

// ─── Report ──────────────────────────────────────────────────────────

const roster = db.select({
  name: schema.users.name, email: schema.users.email,
  isSuperAdmin: schema.users.isSuperAdmin, role: schema.projectMembers.role,
}).from(schema.users)
  .leftJoin(schema.projectMembers, and(
    eq(schema.projectMembers.userId, schema.users.id),
    eq(schema.projectMembers.projectId, q3.id),
  )).all();

const byRole = new Map<string, string[]>();
for (const r of roster) {
  const role = r.isSuperAdmin ? 'superadmin' : (r.role ?? 'sin rol en Q3');
  const bucket = byRole.get(role) ?? [];
  bucket.push(`${r.name} <${r.email}>`);
  byRole.set(role, bucket);
}

console.log(`\nContraseña para todas las cuentas: "${PASSWORD}"\n`);
for (const [role, people] of [...byRole].sort()) {
  console.log(`${role} (${people.length})`);
  for (const p of people.slice(0, 3)) console.log(`   ${p}`);
  if (people.length > 3) console.log(`   … y ${people.length - 3} más`);
}

sqlite.close();
