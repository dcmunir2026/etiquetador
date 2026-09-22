/**
 * One-off cleanup: delete the `djromer@gmail.com` user row (scoped to that
 * email only — never wipe the whole users table, which holds the seeded
 * personas we want to keep). Cascading FKs clean the dependent rows.
 */
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://etiquetador:etiquetador_dev@localhost:5433/etiquetador';
const TARGET_EMAIL = 'djromer@gmail.com';

const sql = postgres(DATABASE_URL);

(async () => {
  const found = await sql<{ id: string }[]>`
    SELECT id FROM users WHERE email = ${TARGET_EMAIL} LIMIT 1
  `;
  const userId = found[0]?.id;
  if (!userId) {
    console.log('NOT_FOUND: no user with that email, nothing to do.');
    await sql.end();
    return;
  }

  // Snapshot of dependent rows so we can show what CASCADE cleaned up.
  const [pm, tk, pa, tm, an] = await Promise.all([
    sql<{ c: number }[]>`SELECT count(*)::int AS c FROM project_members WHERE user_id = ${userId}`,
    sql<{ c: number }[]>`SELECT count(*)::int AS c FROM invitation_tokens WHERE user_id = ${userId}`,
    sql<{ c: number }[]>`SELECT count(*)::int AS c FROM package_assignments WHERE user_id = ${userId}`,
    sql<{ c: number }[]>`SELECT count(*)::int AS c FROM team_members WHERE user_id = ${userId}`,
    sql<{ c: number }[]>`SELECT count(*)::int AS c FROM annotations WHERE user_id = ${userId}`,
  ]);
  console.log('BEFORE', JSON.stringify({
    project_members: pm[0].c,
    invitation_tokens: tk[0].c,
    package_assignments: pa[0].c,
    team_members: tm[0].c,
    annotations: an[0].c,
  }));

  // Scoped delete — exactly one row, identified by id (also fetched by email above).
  await sql`DELETE FROM users WHERE id = ${userId}`;

  const [remaining, total] = await Promise.all([
    sql<{ c: number }[]>`SELECT count(*)::int AS c FROM users WHERE id = ${userId}`,
    sql<{ c: number }[]>`SELECT count(*)::int AS c FROM users`,
  ]);
  console.log('AFTER', JSON.stringify({ remainingUsers: remaining[0].c, totalUsers: total[0].c }));
  await sql.end();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
