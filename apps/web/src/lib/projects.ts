import { and, desc, eq, ne } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { projects, type Project } from '@/db/schema';
import { dedupeSlug, slugify } from '@/lib/slug';

export type ProjectInput = {
  name: string;
  description?: string | null;
};

export async function listProjects(opts?: { status?: 'active' | 'archived' }): Promise<Project[]> {
  const db = getDb();
  const where = opts?.status ? eq(projects.status, opts.status) : undefined;
  return db
    .select()
    .from(projects)
    .where(where)
    .orderBy(desc(projects.createdAt));
}

export async function getProject(id: string): Promise<Project | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(projects)
    .where(eq(projects.id, id))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Generate a unique slug for a new project, based on the name and
 * current slugs in the DB. Pure-ish: only the slug set is read.
 */
export async function generateProjectSlug(name: string): Promise<string> {
  const base = slugify(name);
  if (!base) {
    throw new Error('Project name produces an empty slug');
  }
  const db = getDb();
  const rows = await db
    .select({ slug: projects.slug })
    .from(projects)
    .where(ne(projects.slug, ''));
  const taken = new Set(rows.map((r) => r.slug));
  return dedupeSlug(base, taken);
}

export async function isSlugTaken(slug: string, exceptId?: string): Promise<boolean> {
  const db = getDb();
  const where = exceptId
    ? and(eq(projects.slug, slug), ne(projects.id, exceptId))
    : eq(projects.slug, slug);
  const rows = await db
    .select({ id: projects.id })
    .from(projects)
    .where(where)
    .limit(1);
  return rows.length > 0;
}
