import { eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { projects } from '@/db/schema';

/** Default applied at the schema level for fresh rows and as a fallback
 *  when the read returns something we can't trust (null after a bad write). */
export const DEFAULT_THRESHOLD = 0.12;

/**
 * Project-wide rating disagreement threshold above which a package is
 * returned to the team.
 *
 * Read on every request — the project setting can change at any time,
 * and a Node-level cache here would be invalidated only by the dev
 * server restarting, which would make mid-session edits invisible.
 * The query is a single indexed PK lookup (~ms), and the screens that
 * use it already do much heavier work.
 */
export async function getProjectThreshold(projectId: string): Promise<number> {
  if (!projectId) return DEFAULT_THRESHOLD;
  const db = getDb();
  const rows = await db.select({ v: projects.discrepancyThreshold })
    .from(projects).where(eq(projects.id, projectId)).limit(1);
  const raw = rows[0]?.v;
  if (raw === null || raw === undefined) return DEFAULT_THRESHOLD;
  const n = typeof raw === 'string' ? Number(raw) : Number(raw);
  return Number.isFinite(n) && n > 0 && n < 1 ? n : DEFAULT_THRESHOLD;
}