// Gives every seeded account a password so the login screen is usable in dev,
// and makes sure each of the five roles is represented by someone.
//
//   DATABASE_URL=postgres://etiquetador:etiquetador_dev@localhost:5433/etiquetador \
//     pnpm seed:passwords
//
// The password is dev-only. Pass DEV_PASSWORD to override it. Never run this
// against anything but a local database.

import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { and, eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import * as schema from './src/index';

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error('DATABASE_URL no está definida. Apunta a Postgres en docker-compose.');
}
const PASSWORD = process.env.DEV_PASSWORD ?? 'etiquetador';

const client = postgres(url, { max: 1 });
const db = drizzle(client, { schema });

const hash = bcrypt.hashSync(PASSWORD, 10);

const allUsers = await db.select().from(schema.users);
if (allUsers.length === 0) throw new Error('No users. Run init.ts first.');

for (const u of allUsers) {
  await db.update(schema.users).set({ passwordHash: hash }).where(eq(schema.users.id, u.id));
}
console.log(`Contraseña puesta a ${allUsers.length} cuentas.`);

// ─── Make every role exercisable ─────────────────────────────────────
// The seed only produced superadmin, annotator and validator. Promote one
// person to project admin and add an observer so the matrix can be tested
// end to end.

const [q3] = await db.select().from(schema.projects).where(eq(schema.projects.slug, 'epdata-2026q3'));
if (!q3) throw new Error('Project epdata-2026q3 not found.');

async function setRole(email: string, role: schema.UserRole) {
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  if (!user) { console.log(`  (sin cambios) no existe ${email}`); return; }
  const [member] = await db.select().from(schema.projectMembers)
    .where(and(eq(schema.projectMembers.projectId, q3.id), eq(schema.projectMembers.userId, user.id)));
  if (member) {
    await db.update(schema.projectMembers).set({ role })
      .where(eq(schema.projectMembers.id, member.id));
  } else {
    await db.insert(schema.projectMembers).values({ projectId: q3.id, userId: user.id, role });
  }
  console.log(`  ${user.name} → ${role}`);
}

await setRole('carlos.antunez@epdata.es', 'projectadmin');

// An observer, so read-only access has a face.
const OBSERVER = 'observador@epdata.es';
let [observer] = await db.select().from(schema.users).where(eq(schema.users.email, OBSERVER));
if (!observer) {
  [observer] = await db.insert(schema.users).values({
    email: OBSERVER, name: 'Rosa Iglesias', avatarColor: '#7d6c4f',
    isSuperAdmin: false, passwordHash: hash,
  }).returning();
}
await setRole(OBSERVER, 'viewer');

// ─── Report ──────────────────────────────────────────────────────────

const roster = await db.select({
  name: schema.users.name, email: schema.users.email,
  isSuperAdmin: schema.users.isSuperAdmin, role: schema.projectMembers.role,
}).from(schema.users)
  .leftJoin(schema.projectMembers, and(
    eq(schema.projectMembers.userId, schema.users.id),
    eq(schema.projectMembers.projectId, q3.id),
  ));

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

await client.end();
