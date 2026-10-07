/**
 * CLI para crear, editar y consultar cuentas de usuario directamente contra
 * la base de datos. Útil cuando no se quiere pasar por el flujo de
 * invitación por email (p.ej. crear un segundo superadmin, o ascender /
 * degradar a alguien sin tener que invitarlo).
 *
 *   pnpm --filter @etiquetador/db exec tsx scripts/user.ts help
 *
 * Ejemplos:
 *   # Crear un superadmin
 *   pnpm --filter @etiquetador/db exec tsx scripts/user.ts create \
 *     admin2@etiquetador.local "Admin Dos" --superadmin --must-change
 *
 *   # Crear un annotator y meterlo en un proyecto
 *   pnpm --filter @etiquetador/db exec tsx scripts/user.ts create \
 *     ana@epdata.es "Ana López" --add-to-project <projectId> --as annotator
 *
 *   # Reset de contraseña + ascender a superadmin
 *   pnpm --filter @etiquetador/db exec tsx scripts/user.ts edit \
 *     admin2@etiquetador.local --password "nuevaClave" --superadmin
 *
 *   # Quitar el flag de superadmin (sin tocar el password)
 *   pnpm --filter @etiquetador/db exec tsx scripts/user.ts edit \
 *     admin2@etiquetador.local --no-superadmin
 *
 *   # Asignar a otro proyecto con rol distinto
 *   pnpm --filter @etiquetador/db exec tsx scripts/user.ts edit \
 *     ana@epdata.es --add-to-project <projectId> --as validador_cualitativo
 *
 *   # Ver el estado actual
 *   pnpm --filter @etiquetador/db exec tsx scripts/user.ts show ana@epdata.es
 *
 * Notas:
 *   - El superadmin se concede exclusivamente con `is_super_admin = true`
 *     en `users`. `getRoleInProject` (lib/session.ts) coerciona cualquier
 *     `project_members.role = 'superadmin'` a `projectadmin`, así que
 *     este script nunca escribe 'superadmin' en `project_members`.
 *   - `must_change_password = true` fuerza al usuario a pasar por
 *     `/cuenta/cambiar-password` antes de entrar al resto de la app.
 *   - El password por defecto es "etiquetador" (override con DEV_PASSWORD).
 *     En producción NO se debería usar este script.
 */

import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import * as schema from '../src/index';

const URL = process.env.DATABASE_URL
  ?? 'postgres://etiquetador:etiquetador_dev@localhost:5433/etiquetador';
const DEFAULT_PASSWORD = process.env.DEV_PASSWORD ?? 'etiquetador';

// 'superadmin' NO está aquí a propósito: la membresía de proyecto nunca
// debe llevar ese valor (lo rechaza getRoleInProject). El antiguo
// `validator` genérico se dividió en dos roles específicos para que cada
// flujo de validación tenga permisos separados.
const PROJECT_ROLES = ['projectadmin', 'annotator', 'validador_cualitativo', 'validador_cuantitativo', 'viewer'] as const;
type ProjectRole = typeof PROJECT_ROLES[number];

type Sub = 'create' | 'edit' | 'show' | 'help';
type Parsed = {
  sub: Sub;
  email?: string;
  name?: string;
  password?: string;
  superadmin?: boolean;
  mustChange?: boolean;
  addTo?: { projectId: string; role: ProjectRole };
  errors: string[];
};

function parseCli(argv: string[]): Parsed {
  const [, , raw, ...rest] = argv;
  const errors: string[] = [];
  const sub = (raw as Sub) ?? 'help';
  if (!['create', 'edit', 'show', 'help'].includes(sub)) {
    errors.push(`Subcomando desconocido: ${raw ?? '(vacío)'}. Use create | edit | show | help.`);
    return { sub: 'help', errors };
  }
  if (sub === 'help') return { sub, errors };

  const positionals = rest.filter((a) => !a.startsWith('--'));
  const email = positionals[0];
  const name = sub === 'create' ? positionals[1] : undefined;

  let password: string | undefined;
  let superadminSeen = false;
  let superadminValue: boolean | undefined;
  let mustChange: boolean | undefined;
  let addTo: Parsed['addTo'];

  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i];
    const next = rest[i + 1];
    switch (flag) {
      case '--password':
      case '--pwd':
        if (!next || next.startsWith('--')) { errors.push(`${flag} requiere un valor`); break; }
        password = next;
        i++;
        break;
      case '--superadmin':
        superadminSeen = true;
        superadminValue = true;
        break;
      case '--no-superadmin':
        superadminSeen = true;
        superadminValue = false;
        break;
      case '--must-change':
        mustChange = true;
        break;
      case '--no-must-change':
        mustChange = false;
        break;
      case '--add-to-project':
        if (!next || next.startsWith('--')) { errors.push(`${flag} requiere un projectId`); break; }
        if (!addTo) addTo = { projectId: next, role: '' as ProjectRole };
        else addTo.projectId = next;
        i++;
        break;
      case '--as':
      case '--role':
        if (!next || next.startsWith('--')) { errors.push(`${flag} requiere un rol`); break; }
        if (!PROJECT_ROLES.includes(next as ProjectRole)) {
          errors.push(`--as debe ser uno de: ${PROJECT_ROLES.join(', ')} (recibido: ${next})`);
        } else if (addTo) {
          addTo.role = next as ProjectRole;
        } else {
          errors.push(`${flag} requiere --add-to-project <id>`);
        }
        i++;
        break;
    }
  }

  if (superadminSeen) superadminValue = superadminValue;
  const out: Parsed = {
    sub,
    email,
    name,
    password,
    errors,
  };
  if (superadminSeen) out.superadmin = superadminValue;
  if (mustChange !== undefined) out.mustChange = mustChange;
  if (addTo && addTo.role) out.addTo = addTo as { projectId: string; role: ProjectRole };
  else if (addTo && !addTo.role) errors.push('--add-to-project <id> requiere --as <rol>');

  return out;
}

function usage() {
  console.log(`Uso:
  tsx scripts/user.ts create <email> "<nombre>" [opciones]
  tsx scripts/user.ts edit   <email>           [opciones]
  tsx scripts/user.ts show   <email>
  tsx scripts/user.ts help

Opciones:
  --password <pwd>          Pone / resetea el password (default: "${DEFAULT_PASSWORD}")
  --superadmin              is_super_admin = true
  --no-superadmin           is_super_admin = false
  --must-change             must_change_password = true (fuerza cambio en próximo login)
  --no-must-change          must_change_password = false
  --add-to-project <id>     Añade o actualiza membership del usuario en ese proyecto
  --as <rol>                Rol del proyecto: ${PROJECT_ROLES.join(' | ')}

Entorno:
  DATABASE_URL    Cadena de conexión (default de docker-compose local)
  DEV_PASSWORD    Default del --password cuando no se especifica
`);
}

async function addOrUpdateMembership(
  db: ReturnType<typeof drizzle<typeof schema>>,
  userId: string,
  spec: { projectId: string; role: ProjectRole },
): Promise<void> {
  await db.insert(schema.projectMembers).values({
    projectId: spec.projectId,
    userId,
    role: spec.role,
  }).onConflictDoUpdate({
    target: [schema.projectMembers.projectId, schema.projectMembers.userId],
    set: { role: spec.role },
  });
  console.log(`  membership ${spec.projectId.slice(0, 8)}… = ${spec.role}`);
}

async function showUser(
  db: ReturnType<typeof drizzle<typeof schema>>,
  email: string,
): Promise<void> {
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (!user) { console.error(`No existe ${email}.`); process.exit(1); }

  const memberships = await db.select({
    projectId: schema.projectMembers.projectId,
    role: schema.projectMembers.role,
  }).from(schema.projectMembers).where(eq(schema.projectMembers.userId, user.id));

  console.log(JSON.stringify({
    id: user.id,
    email: user.email,
    name: user.name,
    isSuperAdmin: user.isSuperAdmin,
    mustChangePassword: user.mustChangePassword,
    hasPassword: !!user.passwordHash,
    deletedAt: user.deletedAt,
    emailVerifiedAt: user.emailVerifiedAt,
    memberships,
  }, null, 2));
}

async function main() {
  const args = parseCli(process.argv);
  if (args.sub === 'help') { usage(); return; }
  if (args.errors.length) {
    console.error('Error:', args.errors.join('; '));
    console.error('');
    usage();
    process.exit(2);
  }
  if (!args.email) {
    console.error('Falta el email.');
    console.error('');
    usage();
    process.exit(2);
  }

  const client = postgres(URL, { max: 1 });
  const db = drizzle(client, { schema });

  try {
    const [existing] = await db.select().from(schema.users)
      .where(eq(schema.users.email, args.email)).limit(1);

    if (args.sub === 'show') {
      await showUser(db, args.email);
      return;
    }

    if (args.sub === 'create') {
      if (existing) {
        console.error(`Ya existe ${args.email}. Usa "edit" para modificarlo.`);
        process.exit(1);
      }
      if (!args.name) {
        console.error('Falta el nombre. Sintaxis: create <email> "<nombre>" [...]');
        process.exit(2);
      }
      const password = args.password ?? DEFAULT_PASSWORD;
      const passwordHash = await bcrypt.hash(password, 10);
      const [row] = await db.insert(schema.users).values({
        email: args.email,
        name: args.name,
        isSuperAdmin: args.superadmin === true,
        passwordHash,
        // Por defecto forzamos cambio de contraseña salvo que el caller
        // pase --no-must-change. Las cuentas que vienen del flujo de
        // invitación ya marcan emailVerifiedAt, este código es paralelo.
        mustChangePassword: args.mustChange ?? true,
      }).returning();

      console.log(`Creado ${row.email} (${row.id})`);
      console.log(`  is_super_admin       = ${row.isSuperAdmin}`);
      console.log(`  must_change_password = ${row.mustChangePassword}`);
      console.log(`  password provisional = "${password}" — el usuario debe cambiarla en el primer login.`);
      if (args.addTo) await addOrUpdateMembership(db, row.id, args.addTo);
      return;
    }

    // args.sub === 'edit'
    if (!existing) {
      console.error(`No existe ${args.email}. Usa "create" para crearlo.`);
      process.exit(1);
    }

    const updates: Partial<typeof schema.users.$inferInsert> = {};
    if (args.superadmin !== undefined) updates.isSuperAdmin = args.superadmin;
    if (args.password !== undefined) updates.passwordHash = await bcrypt.hash(args.password, 10);
    if (args.mustChange !== undefined) updates.mustChangePassword = args.mustChange;
    updates.updatedAt = new Date();

    if (Object.keys(updates).length > 1 || args.addTo) {
      if (Object.keys(updates).length > 1) {
        await db.update(schema.users).set(updates).where(eq(schema.users.id, existing.id));
        const changed = Object.keys(updates).filter((k) => k !== 'updatedAt').join(', ');
        console.log(`Actualizado ${existing.email}: ${changed}`);
      }
      if (args.addTo) await addOrUpdateMembership(db, existing.id, args.addTo);
    } else {
      console.error('Nada que modificar. Pasa al menos --superadmin / --no-superadmin / --password / --must-change / --add-to-project.');
      process.exit(2);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });