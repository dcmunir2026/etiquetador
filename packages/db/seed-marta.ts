/**
 * One-off: set a real password for the seeded Marta R. superadmin
 * so the prototype is immediately usable end-to-end.
 *
 * Default credentials: marta@etiquetador.local / marta1234
 * Change in production. This script is idempotent.
 */
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { getDb } from './src/client';
import { users } from './src/index';

const DEFAULT_PASSWORD = 'marta1234';

async function main() {
  const db = getDb();
  const email = 'marta@etiquetador.local';
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing[0]) {
    await db
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, existing[0].id));
    console.log(`✓ Updated password for ${email}`);
  } else {
    await db.insert(users).values({
      email,
      name: 'Marta R.',
      avatarColor: 'linear-gradient(135deg,#0e4a52,#1d6e75)',
      isSuperAdmin: true,
      passwordHash,
    });
    console.log(`✓ Created ${email} with default password`);
  }
  console.log(`\nLogin: ${email} / ${DEFAULT_PASSWORD}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
