/**
 * Read models for the views.
 *
 * Each exported function returns exactly what one screen needs. Aggregates
 * (discrepancies, kappa, progress) are computed from `annotations` rather
 * than stored, so they never drift from the underlying data.
 */

import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import {
  annotations, corpusUploads, dimensionDependencies, dimensionValues, dimensions,
  fragments, intensityScales, packageAssignments, packageFragments, packages,
  projectMembers, projectTaxonomies, projects, qualCorrections, qualValidations,
  segmentationConfigs, taxonomies, taxonomyDimensions, teamMembers, teams, users,
} from '@/db/schema';
import type { CascadeDimension } from './cascade';
import { computeDiscrepancies, fleissKappa, type RatingRow } from './metrics';

// ─── Catalogue ───────────────────────────────────────────────────────

export type DimensionRow = CascadeDimension & {
  status: string;
  shortDescription: string | null;
  longDescription: string | null;
  scaleName: string | null;
  scaleKind: string | null;
  createdByName: string | null;
  createdAt: Date;
  taxonomyCount: number;
  projectCount: number;
  annotationCount: number;
  dependencyLabel: string | null;
  parentName: string | null;
};

/** Every dimension with its values, scale, dependency and usage counts. */
export async function getDimensionCatalog(): Promise<DimensionRow[]> {
  const db = getDb();

  const [dimRows, valueRows, depRows, taxCounts, annCounts, projCounts] = await Promise.all([
    db.select({ d: dimensions, scale: intensityScales, creator: users })
      .from(dimensions)
      .leftJoin(intensityScales, eq(intensityScales.id, dimensions.scaleId))
      .leftJoin(users, eq(users.id, dimensions.createdBy))
      .orderBy(asc(dimensions.name)),
    db.select().from(dimensionValues).orderBy(asc(dimensionValues.order)),
    db.select({ dep: dimensionDependencies, parent: dimensions })
      .from(dimensionDependencies)
      .leftJoin(dimensions, eq(dimensions.id, dimensionDependencies.dependsOnId)),
    db.select({ dimensionId: taxonomyDimensions.dimensionId, c: count() })
      .from(taxonomyDimensions).groupBy(taxonomyDimensions.dimensionId),
    db.select({ dimensionId: annotations.dimensionId, c: count() })
      .from(annotations).groupBy(annotations.dimensionId),
    db.select({ dimensionId: taxonomyDimensions.dimensionId, projectId: projectTaxonomies.projectId })
      .from(taxonomyDimensions)
      .innerJoin(projectTaxonomies, eq(projectTaxonomies.taxonomyId, taxonomyDimensions.taxonomyId)),
  ]);

  const valuesByDim = new Map<string, string[]>();
  for (const v of valueRows) {
    const bucket = valuesByDim.get(v.dimensionId) ?? [];
    bucket.push(v.label);
    valuesByDim.set(v.dimensionId, bucket);
  }
  const depByDim = new Map(depRows.map((r) => [r.dep.dimensionId, r]));
  const taxCountBy = new Map(taxCounts.map((r) => [r.dimensionId, Number(r.c)]));
  const annCountBy = new Map(annCounts.map((r) => [r.dimensionId, Number(r.c)]));
  const projectsByDim = new Map<string, Set<string>>();
  for (const r of projCounts) {
    const set = projectsByDim.get(r.dimensionId) ?? new Set();
    set.add(r.projectId);
    projectsByDim.set(r.dimensionId, set);
  }

  return dimRows.map(({ d, scale, creator }) => {
    const dep = depByDim.get(d.id);
    return {
      id: d.id,
      name: d.name,
      slug: d.slug,
      kind: d.kind,
      status: d.status,
      shortDescription: d.shortDescription,
      longDescription: d.longDescription,
      scaleName: scale?.name ?? null,
      scaleKind: scale?.kind ?? null,
      values: valuesByDim.get(d.id) ?? [],
      dependency: dep
        ? {
            parentId: dep.dep.dependsOnId,
            operator: dep.dep.operator,
            values: JSON.parse(dep.dep.values) as string[],
            label: dep.dep.label,
          }
        : null,
      dependencyLabel: dep?.dep.label ?? null,
      parentName: dep?.parent?.name ?? null,
      createdByName: creator?.name ?? creator?.email ?? null,
      createdAt: d.createdAt,
      taxonomyCount: taxCountBy.get(d.id) ?? 0,
      projectCount: projectsByDim.get(d.id)?.size ?? 0,
      annotationCount: annCountBy.get(d.id) ?? 0,
    };
  });
}

export type TaxonomyRow = {
  id: string;
  name: string;
  slug: string;
  shortDescription: string | null;
  color: string | null;
  status: string;
  createdByName: string | null;
  createdAt: Date;
  dimensions: Array<{ id: string; name: string; kind: string }>;
  projectIds: string[];
};

export async function getTaxonomyCatalog(): Promise<TaxonomyRow[]> {
  const db = getDb();
  const [taxRows, links, assignments] = await Promise.all([
    db.select({ t: taxonomies, creator: users })
      .from(taxonomies)
      .leftJoin(users, eq(users.id, taxonomies.createdBy))
      .orderBy(asc(taxonomies.name)),
    db.select({ taxonomyId: taxonomyDimensions.taxonomyId, d: dimensions })
      .from(taxonomyDimensions)
      .innerJoin(dimensions, eq(dimensions.id, taxonomyDimensions.dimensionId))
      .orderBy(asc(taxonomyDimensions.order)),
    db.select().from(projectTaxonomies),
  ]);

  const dimsByTax = new Map<string, Array<{ id: string; name: string; kind: string }>>();
  for (const l of links) {
    const bucket = dimsByTax.get(l.taxonomyId) ?? [];
    bucket.push({ id: l.d.id, name: l.d.name, kind: l.d.kind });
    dimsByTax.set(l.taxonomyId, bucket);
  }
  const projectsByTax = new Map<string, string[]>();
  for (const a of assignments) {
    const bucket = projectsByTax.get(a.taxonomyId) ?? [];
    bucket.push(a.projectId);
    projectsByTax.set(a.taxonomyId, bucket);
  }

  return taxRows.map(({ t, creator }) => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    shortDescription: t.shortDescription,
    color: t.color,
    status: t.status,
    createdByName: creator?.name ?? creator?.email ?? null,
    createdAt: t.createdAt,
    dimensions: dimsByTax.get(t.id) ?? [],
    projectIds: projectsByTax.get(t.id) ?? [],
  }));
}

export async function getScales() {
  const db = getDb();
  return db.select().from(intensityScales).orderBy(asc(intensityScales.name));
}

// ─── Project dimensions (through its taxonomies) ─────────────────────

/** The dimensions an annotator will actually see in a given project. */
export async function getProjectDimensions(projectId: string): Promise<DimensionRow[]> {
  const db = getDb();
  const taxIds = (await db.select({ id: projectTaxonomies.taxonomyId })
    .from(projectTaxonomies).where(eq(projectTaxonomies.projectId, projectId))).map((r) => r.id);
  if (taxIds.length === 0) return [];

  const dimIds = (await db.select({ id: taxonomyDimensions.dimensionId })
    .from(taxonomyDimensions).where(inArray(taxonomyDimensions.taxonomyId, taxIds))).map((r) => r.id);
  if (dimIds.length === 0) return [];

  const all = await getDimensionCatalog();
  const wanted = new Set(dimIds);
  return all.filter((d) => wanted.has(d.id) && d.status === 'active');
}

// ─── Dashboard ───────────────────────────────────────────────────────

export type ProjectSummary = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: string;
  createdAt: Date;
  fragmentCount: number;
  annotatedCount: number;
  memberCount: number;
  teamCount: number;
  progress: number;
  kappa: number | null;
};

export async function getDashboard(): Promise<{ projects: ProjectSummary[]; totals: {
  activeProjects: number; fragments: number; annotators: number; teams: number; kappa: number | null;
} }> {
  const db = getDb();
  const [projectRows, fragCounts, memberCounts, teamCounts, annotatedCounts] = await Promise.all([
    db.select().from(projects).orderBy(desc(projects.createdAt)),
    db.select({ projectId: fragments.projectId, c: count() }).from(fragments).groupBy(fragments.projectId),
    db.select({ projectId: projectMembers.projectId, c: count() }).from(projectMembers).groupBy(projectMembers.projectId),
    db.select({ projectId: teams.projectId, c: count() }).from(teams).groupBy(teams.projectId),
    db.select({ projectId: fragments.projectId, c: sql<number>`count(distinct ${annotations.fragmentId})` })
      .from(annotations)
      .innerJoin(fragments, eq(fragments.id, annotations.fragmentId))
      .groupBy(fragments.projectId),
  ]);

  const fragBy = new Map(fragCounts.map((r) => [r.projectId, Number(r.c)]));
  const memberBy = new Map(memberCounts.map((r) => [r.projectId, Number(r.c)]));
  const teamBy = new Map(teamCounts.map((r) => [r.projectId, Number(r.c)]));
  const annotatedBy = new Map(annotatedCounts.map((r) => [r.projectId, Number(r.c)]));

  const summaries: ProjectSummary[] = [];
  for (const p of projectRows) {
    const total = fragBy.get(p.id) ?? 0;
    const done = annotatedBy.get(p.id) ?? 0;
    summaries.push({
      id: p.id, name: p.name, slug: p.slug, description: p.description,
      status: p.status, createdAt: p.createdAt,
      fragmentCount: total,
      annotatedCount: done,
      memberCount: memberBy.get(p.id) ?? 0,
      teamCount: teamBy.get(p.id) ?? 0,
      progress: total ? done / total : 0,
      kappa: null,
    });
  }

  // Global kappa across every project that has comparable annotations.
  const allRatings = await db.select({
    fragmentId: annotations.fragmentId, dimensionId: annotations.dimensionId,
    userId: annotations.userId, value: annotations.value, skipped: annotations.skipped,
  }).from(annotations);
  const freeText = await freeTextDimensionIds();
  const report = computeDiscrepancies(allRatings as RatingRow[], freeText);

  const totalAnnotators = await db.select({ c: sql<number>`count(distinct ${annotations.userId})` }).from(annotations);

  return {
    projects: summaries,
    totals: {
      activeProjects: projectRows.filter((p) => p.status === 'active').length,
      fragments: Array.from(fragBy.values()).reduce((a, b) => a + b, 0),
      annotators: Number(totalAnnotators[0]?.c ?? 0),
      teams: Array.from(teamBy.values()).reduce((a, b) => a + b, 0),
      kappa: report.overallKappa,
    },
  };
}

/** Free-text dimensions are excluded from every agreement statistic. */
export async function freeTextDimensionIds(): Promise<Set<string>> {
  const db = getDb();
  const rows = await db.select({ id: dimensions.id })
    .from(dimensions).where(eq(dimensions.kind, 'free-text'));
  return new Set(rows.map((r) => r.id));
}

// ─── Teams, packages, roles ──────────────────────────────────────────

export type TeamRow = {
  id: string;
  name: string;
  groupSize: number;
  consensusMetric: string;
  members: Array<{ id: string; name: string; email: string; color: string | null }>;
};

export async function getTeams(projectId: string): Promise<TeamRow[]> {
  const db = getDb();
  const teamRows = await db.select().from(teams).where(eq(teams.projectId, projectId)).orderBy(asc(teams.name));
  if (teamRows.length === 0) return [];
  const memberRows = await db.select({ teamId: teamMembers.teamId, u: users })
    .from(teamMembers)
    .innerJoin(users, eq(users.id, teamMembers.userId))
    .where(inArray(teamMembers.teamId, teamRows.map((t) => t.id)));

  const byTeam = new Map<string, TeamRow['members']>();
  for (const m of memberRows) {
    const bucket = byTeam.get(m.teamId) ?? [];
    bucket.push({ id: m.u.id, name: m.u.name ?? m.u.email, email: m.u.email, color: m.u.avatarColor });
    byTeam.set(m.teamId, bucket);
  }
  return teamRows.map((t) => ({
    id: t.id, name: t.name, groupSize: t.groupSize, consensusMetric: t.consensusMetric,
    members: byTeam.get(t.id) ?? [],
  }));
}

export type MemberRow = {
  id: string; name: string; email: string; color: string | null;
  role: string; isSuperAdmin: boolean; teamNames: string[];
};

export async function getProjectMembers(projectId: string): Promise<MemberRow[]> {
  const db = getDb();
  const rows = await db.select({ m: projectMembers, u: users })
    .from(projectMembers)
    .innerJoin(users, eq(users.id, projectMembers.userId))
    .where(eq(projectMembers.projectId, projectId))
    .orderBy(asc(users.name));

  const teamRows = await db.select({ userId: teamMembers.userId, teamName: teams.name })
    .from(teamMembers)
    .innerJoin(teams, eq(teams.id, teamMembers.teamId))
    .where(eq(teams.projectId, projectId));

  const teamsByUser = new Map<string, string[]>();
  for (const t of teamRows) {
    const bucket = teamsByUser.get(t.userId) ?? [];
    bucket.push(t.teamName);
    teamsByUser.set(t.userId, bucket);
  }

  return rows.map(({ m, u }) => ({
    id: u.id, name: u.name ?? u.email, email: u.email, color: u.avatarColor,
    role: m.role, isSuperAdmin: u.isSuperAdmin,
    teamNames: teamsByUser.get(u.id) ?? [],
  }));
}

export type PackageRow = {
  id: string; code: string; status: string; version: number; returnCount: number;
  isMirror: boolean; notes: string | null;
  teamId: string | null; teamName: string | null; groupSize: number;
  fragmentCount: number;
  assignments: Array<{ userId: string; name: string; color: string | null; status: string; version: number; isLead: boolean }>;
};

export async function getPackages(projectId: string): Promise<PackageRow[]> {
  const db = getDb();
  const pkgRows = await db.select({ p: packages, t: teams })
    .from(packages)
    .leftJoin(teams, eq(teams.id, packages.teamId))
    .where(eq(packages.projectId, projectId))
    .orderBy(asc(packages.code));
  if (pkgRows.length === 0) return [];

  const ids = pkgRows.map((r) => r.p.id);
  const [fragCounts, assignRows] = await Promise.all([
    db.select({ packageId: packageFragments.packageId, c: count() })
      .from(packageFragments).where(inArray(packageFragments.packageId, ids))
      .groupBy(packageFragments.packageId),
    db.select({ a: packageAssignments, u: users })
      .from(packageAssignments)
      .innerJoin(users, eq(users.id, packageAssignments.userId))
      .where(inArray(packageAssignments.packageId, ids))
      .orderBy(desc(packageAssignments.isLead)),
  ]);

  const fragBy = new Map(fragCounts.map((r) => [r.packageId, Number(r.c)]));
  const assignBy = new Map<string, PackageRow['assignments']>();
  for (const { a, u } of assignRows) {
    const bucket = assignBy.get(a.packageId) ?? [];
    bucket.push({
      userId: u.id, name: u.name ?? u.email, color: u.avatarColor,
      status: a.status, version: a.version, isLead: a.isLead,
    });
    assignBy.set(a.packageId, bucket);
  }

  return pkgRows.map(({ p, t }) => ({
    id: p.id, code: p.code, status: p.status, version: p.version, returnCount: p.returnCount,
    isMirror: p.isMirror, notes: p.notes,
    teamId: p.teamId, teamName: t?.name ?? null, groupSize: t?.groupSize ?? 0,
    fragmentCount: fragBy.get(p.id) ?? 0,
    assignments: assignBy.get(p.id) ?? [],
  }));
}

// ─── Ratings helper ──────────────────────────────────────────────────

async function ratingsForPackages(packageIds: string[]): Promise<RatingRow[]> {
  if (packageIds.length === 0) return [];
  const db = getDb();
  const rows = await db.select({
    fragmentId: annotations.fragmentId, dimensionId: annotations.dimensionId,
    userId: annotations.userId, value: annotations.value, skipped: annotations.skipped,
  }).from(annotations).where(inArray(annotations.packageId, packageIds));
  return rows as RatingRow[];
}

// ─── Quantitative validation ─────────────────────────────────────────

export type TeamValidationRow = {
  teamId: string; teamName: string; members: string[];
  packageId: string | null; packageCode: string | null;
  fragmentTotal: number; fragmentDone: number; progress: number;
  discrepantFragments: number; comparableFragments: number;
  disagreedRatings: number; comparableRatings: number;
  /** Rating-level disagreement — the figure the threshold is applied to. */
  errorRate: number | null;
  status: 'progress' | 'ok' | 'fail';
  kappa: number | null;
  byDimension: Array<{ dimensionId: string; name: string; pct: number; disagreed: number; comparable: number }>;
};

/** Per-team agreement, recomputed from annotations on every request. */
export async function getTeamValidations(projectId: string): Promise<TeamValidationRow[]> {
  const db = getDb();
  const [teamRows, pkgRows, dimRows, freeText] = await Promise.all([
    getTeams(projectId),
    getPackages(projectId),
    db.select({ id: dimensions.id, name: dimensions.name }).from(dimensions),
    freeTextDimensionIds(),
  ]);
  const dimName = new Map(dimRows.map((d) => [d.id, d.name]));

  const out: TeamValidationRow[] = [];
  for (const team of teamRows) {
    const pkg = pkgRows.find((p) => p.teamId === team.id) ?? null;
    const ratings = pkg ? await ratingsForPackages([pkg.id]) : [];
    const report = computeDiscrepancies(ratings, freeText);

    const fragmentTotal = pkg?.fragmentCount ?? 0;
    const fragmentDone = new Set(ratings.map((r) => r.fragmentId)).size;
    const errorRate = report.comparableRatings ? report.ratingPct : null;

    // A package is only judged once every annotator has submitted.
    const allSubmitted = (pkg?.assignments.length ?? 0) > 0
      && pkg!.assignments.every((a) => a.status === 'submitted');
    const status: TeamValidationRow['status'] = !allSubmitted
      ? 'progress'
      : (errorRate ?? 0) < DISCREPANCY_THRESHOLD ? 'ok' : 'fail';

    out.push({
      teamId: team.id, teamName: team.name, members: team.members.map((m) => m.name),
      packageId: pkg?.id ?? null, packageCode: pkg?.code ?? null,
      fragmentTotal, fragmentDone,
      progress: fragmentTotal ? fragmentDone / fragmentTotal : 0,
      discrepantFragments: report.discrepantFragments,
      comparableFragments: report.comparableFragments,
      disagreedRatings: report.disagreedRatings,
      comparableRatings: report.comparableRatings,
      errorRate, status,
      kappa: report.overallKappa,
      byDimension: report.byDimension.map((d) => ({
        dimensionId: d.dimensionId, name: dimName.get(d.dimensionId) ?? '—',
        pct: d.pct, disagreed: d.disagreed, comparable: d.comparable,
      })),
    });
  }
  return out;
}

/** Project-wide discrepancy threshold above which a package is returned. */
export const DISCREPANCY_THRESHOLD = 0.12;

// ─── Team discrepancies (fragment level) ─────────────────────────────

export type DiscrepantFragment = {
  fragmentId: string; index: number; question: string | null; text: string;
  dims: Array<{
    dimensionId: string; name: string;
    values: Record<string, string>;
    consensus: { value: string; agree: number; total: number };
  }>;
};

export async function getTeamDiscrepantFragments(teamId: string): Promise<DiscrepantFragment[]> {
  const db = getDb();
  const [pkg] = await db.select().from(packages).where(eq(packages.teamId, teamId)).limit(1);
  if (!pkg) return [];

  const [rows, dimRows, memberRows, freeText] = await Promise.all([
    db.select({
      a: annotations, f: fragments, u: users,
    }).from(annotations)
      .innerJoin(fragments, eq(fragments.id, annotations.fragmentId))
      .innerJoin(users, eq(users.id, annotations.userId))
      .where(eq(annotations.packageId, pkg.id)),
    db.select({ id: dimensions.id, name: dimensions.name }).from(dimensions),
    db.select({ userId: teamMembers.userId }).from(teamMembers).where(eq(teamMembers.teamId, teamId)),
    freeTextDimensionIds(),
  ]);
  const dimName = new Map(dimRows.map((d) => [d.id, d.name]));
  const memberCount = memberRows.length;

  type Bucket = { fragment: typeof rows[number]['f']; dims: Map<string, Map<string, string>> };
  const byFragment = new Map<string, Bucket>();
  for (const { a, f, u } of rows) {
    if (freeText.has(a.dimensionId)) continue;
    let b = byFragment.get(f.id);
    if (!b) { b = { fragment: f, dims: new Map() }; byFragment.set(f.id, b); }
    const perDim = b.dims.get(a.dimensionId) ?? new Map<string, string>();
    perDim.set(u.name ?? u.email, a.skipped || a.value === null ? '—' : a.value);
    b.dims.set(a.dimensionId, perDim);
  }

  const out: DiscrepantFragment[] = [];
  let index = 0;
  for (const [fragmentId, b] of byFragment) {
    index++;
    const disagreeing: DiscrepantFragment['dims'] = [];
    for (const [dimensionId, perAnnotator] of b.dims) {
      const values = Array.from(perAnnotator.values());
      if (values.length < 2 || new Set(values).size === 1) continue;
      const counts = new Map<string, number>();
      for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
      let best = values[0] ?? ''; let bestCount = 0;
      for (const [v, c] of counts) if (c > bestCount) { best = v; bestCount = c; }
      disagreeing.push({
        dimensionId, name: dimName.get(dimensionId) ?? '—',
        values: Object.fromEntries(perAnnotator),
        consensus: { value: best, agree: bestCount, total: values.length },
      });
    }
    if (disagreeing.length === 0) continue;
    out.push({
      fragmentId, index, question: b.fragment.question, text: b.fragment.text,
      dims: disagreeing,
    });
  }
  return out.sort((a, b) => b.dims.length - a.dims.length);
}

/** Full per-annotator breakdown for one fragment (read-only modal). */
export async function getFragmentBreakdown(teamId: string, fragmentId: string) {
  const db = getDb();
  const [rows, dimRows] = await Promise.all([
    db.select({ a: annotations, u: users })
      .from(annotations)
      .innerJoin(users, eq(users.id, annotations.userId))
      .where(eq(annotations.fragmentId, fragmentId)),
    db.select({ id: dimensions.id, name: dimensions.name }).from(dimensions),
  ]);
  const memberRows = await db.select({ userId: teamMembers.userId })
    .from(teamMembers).where(eq(teamMembers.teamId, teamId));
  const memberIds = new Set(memberRows.map((m) => m.userId));
  const dimName = new Map(dimRows.map((d) => [d.id, d.name]));

  const annotators: string[] = [];
  const byDim = new Map<string, Record<string, string>>();
  for (const { a, u } of rows) {
    if (!memberIds.has(u.id)) continue;
    const label = u.name ?? u.email;
    if (!annotators.includes(label)) annotators.push(label);
    const rec = byDim.get(a.dimensionId) ?? {};
    rec[label] = a.skipped || a.value === null ? '—' : a.value;
    byDim.set(a.dimensionId, rec);
  }

  const [fragment] = await db.select().from(fragments).where(eq(fragments.id, fragmentId)).limit(1);
  const dims = Array.from(byDim.entries()).map(([dimensionId, values]) => {
    const list = Object.values(values);
    const counts = new Map<string, number>();
    for (const v of list) counts.set(v, (counts.get(v) ?? 0) + 1);
    let best = list[0] ?? ''; let bestCount = 0;
    for (const [v, c] of counts) if (c > bestCount) { best = v; bestCount = c; }
    return { dimensionId, name: dimName.get(dimensionId) ?? '—', values, consensus: best, agree: bestCount, total: list.length };
  });

  return { fragment, annotators, dims };
}

// ─── Tagging ─────────────────────────────────────────────────────────

export type TaggingData = {
  package: PackageRow | null;
  fragment: (typeof fragments.$inferSelect) | null;
  position: number;
  total: number;
  answers: Record<string, string>;
  dimensions: DimensionRow[];
  doneCount: number;
};

/**
 * The next fragment this user should annotate in a project, plus whatever
 * they already answered for it.
 */
export async function getTaggingData(projectId: string, userId: string, fragmentIndex?: number): Promise<TaggingData> {
  const db = getDb();
  const dims = await getProjectDimensions(projectId);

  const assigned = await db.select({ a: packageAssignments, p: packages })
    .from(packageAssignments)
    .innerJoin(packages, eq(packages.id, packageAssignments.packageId))
    .where(and(eq(packageAssignments.userId, userId), eq(packages.projectId, projectId)))
    .limit(1);

  const empty: TaggingData = {
    package: null, fragment: null, position: 0, total: 0,
    answers: {}, dimensions: dims, doneCount: 0,
  };
  if (assigned.length === 0) return empty;

  const pkgId = assigned[0]!.p.id;
  const [allPackages, fragLinks] = await Promise.all([
    getPackages(projectId),
    db.select({ f: fragments, order: packageFragments.order })
      .from(packageFragments)
      .innerJoin(fragments, eq(fragments.id, packageFragments.fragmentId))
      .where(eq(packageFragments.packageId, pkgId))
      .orderBy(asc(packageFragments.order)),
  ]);
  const pkg = allPackages.find((p) => p.id === pkgId) ?? null;
  if (fragLinks.length === 0) return { ...empty, package: pkg };

  const answered = await db.select({ fragmentId: annotations.fragmentId })
    .from(annotations)
    .where(and(eq(annotations.packageId, pkgId), eq(annotations.userId, userId)));
  const answeredSet = new Set(answered.map((a) => a.fragmentId));

  // Default to the first unanswered fragment; honour an explicit index.
  let idx = fragmentIndex;
  if (idx === undefined || idx < 0 || idx >= fragLinks.length) {
    const firstPending = fragLinks.findIndex((l) => !answeredSet.has(l.f.id));
    idx = firstPending === -1 ? 0 : firstPending;
  }

  const link = fragLinks[idx];
  if (!link) return { ...empty, package: pkg };
  const fragment = link.f;
  const existing = await db.select()
    .from(annotations)
    .where(and(eq(annotations.fragmentId, fragment.id), eq(annotations.userId, userId)));

  const answers: Record<string, string> = {};
  for (const a of existing) {
    if (!a.skipped && a.value !== null) answers[a.dimensionId] = a.value;
  }

  return {
    package: pkg, fragment, position: idx + 1, total: fragLinks.length,
    answers, dimensions: dims, doneCount: answeredSet.size,
  };
}

// ─── Mirror discrepancies (package level, annotator vs annotator) ────

export type MirrorComparison = {
  packageCode: string;
  annotators: string[];
  comparedFragments: number;
  discrepantFragments: number;
  pct: number;
  byDimension: Array<{ name: string; pct: number; disagreed: number; comparable: number }>;
  rows: Array<{
    index: number; fragmentId: string; text: string;
    dimension: string;
    values: Record<string, string>;
    agreed: boolean;
  }>;
};

export async function getMirrorComparison(projectId: string, packageId?: string): Promise<MirrorComparison | null> {
  const db = getDb();
  const pkgs = await getPackages(projectId);
  const pkg = packageId ? pkgs.find((p) => p.id === packageId) : pkgs[0];
  if (!pkg) return null;

  const [rows, dimRows, freeText] = await Promise.all([
    db.select({ a: annotations, f: fragments, u: users })
      .from(annotations)
      .innerJoin(fragments, eq(fragments.id, annotations.fragmentId))
      .innerJoin(users, eq(users.id, annotations.userId))
      .where(eq(annotations.packageId, pkg.id)),
    db.select({ id: dimensions.id, name: dimensions.name }).from(dimensions),
    freeTextDimensionIds(),
  ]);
  const dimName = new Map(dimRows.map((d) => [d.id, d.name]));

  const ratings: RatingRow[] = rows
    .filter((r) => !freeText.has(r.a.dimensionId))
    .map((r) => ({
      fragmentId: r.a.fragmentId, dimensionId: r.a.dimensionId, userId: r.a.userId,
      value: r.a.value, skipped: r.a.skipped,
    }));
  const report = computeDiscrepancies(ratings);

  // Fragment-by-fragment rows, only where annotators diverged.
  type Cell = { text: string; values: Record<string, string> };
  const cells = new Map<string, Cell>();
  const order: string[] = [];
  for (const { a, f, u } of rows) {
    if (freeText.has(a.dimensionId)) continue;
    const key = `${f.id}::${a.dimensionId}`;
    if (!cells.has(key)) { cells.set(key, { text: f.text, values: {} }); order.push(key); }
    cells.get(key)!.values[u.name ?? u.email] = a.skipped || a.value === null ? '—' : a.value;
  }

  const outRows: MirrorComparison['rows'] = [];
  let i = 0;
  for (const key of order) {
    const [fragmentId = '', dimensionId = ''] = key.split('::');
    const cell = cells.get(key)!;
    const values = Object.values(cell.values);
    if (values.length < 2) continue;
    const agreed = new Set(values).size === 1;
    if (agreed) continue;
    i++;
    outRows.push({
      index: i, fragmentId, text: cell.text,
      dimension: dimName.get(dimensionId) ?? '—',
      values: cell.values, agreed,
    });
  }

  return {
    packageCode: pkg.code,
    annotators: pkg.assignments.map((a) => a.name),
    comparedFragments: report.comparableFragments,
    discrepantFragments: report.discrepantFragments,
    pct: report.ratingPct,
    byDimension: report.byDimension.map((d) => ({
      name: dimName.get(d.dimensionId) ?? '—', pct: d.pct,
      disagreed: d.disagreed, comparable: d.comparable,
    })),
    rows: outRows.slice(0, 60),
  };
}

// ─── Qualitative validation ──────────────────────────────────────────

export type QualTeamRow = {
  teamId: string; teamName: string; members: string[];
  packageCode: string | null;
  total: number; reviewed: number; pending: number; corrected: number;
  status: 'pending' | 'progress' | 'done';
  lastReview: Date | null;
};

export async function getQualValidationTeams(projectId: string): Promise<QualTeamRow[]> {
  const db = getDb();
  const [teamRows, rows] = await Promise.all([
    getTeams(projectId),
    db.select({ v: qualValidations, p: packages })
      .from(qualValidations)
      .leftJoin(packages, eq(packages.id, qualValidations.packageId))
      .where(eq(qualValidations.projectId, projectId)),
  ]);

  return teamRows.map((team) => {
    const mine = rows.filter((r) => r.v.teamId === team.id);
    const reviewed = mine.filter((r) => r.v.status !== 'pending').length;
    const corrected = mine.filter((r) => r.v.status === 'corrected').length;
    const dates = mine.map((r) => r.v.reviewedAt).filter(Boolean) as Date[];
    const status: QualTeamRow['status'] = reviewed === 0 ? 'pending'
      : reviewed === mine.length ? 'done' : 'progress';
    return {
      teamId: team.id, teamName: team.name, members: team.members.map((m) => m.name),
      packageCode: mine[0]?.p?.code ?? null,
      total: mine.length, reviewed, pending: mine.length - reviewed, corrected,
      status,
      lastReview: dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : null,
    };
  });
}

export type QualSampleFragment = {
  validationId: string; fragmentId: string;
  question: string | null; answer: string;
  status: string; rejectReason: string | null;
  labels: Array<{ dimensionId: string; name: string; value: string; options: string[] }>;
  corrections: Record<string, string>;
};

export async function getQualSample(teamId: string): Promise<QualSampleFragment[]> {
  const db = getDb();
  const validations = await db.select({ v: qualValidations, f: fragments })
    .from(qualValidations)
    .innerJoin(fragments, eq(fragments.id, qualValidations.fragmentId))
    .where(eq(qualValidations.teamId, teamId))
    .orderBy(asc(qualValidations.createdAt));
  if (validations.length === 0) return [];

  const fragmentIds = validations.map((v) => v.f.id);
  const [rows, dimRows, valueRows, corrections] = await Promise.all([
    db.select({ a: annotations }).from(annotations).where(inArray(annotations.fragmentId, fragmentIds)),
    db.select({ id: dimensions.id, name: dimensions.name, kind: dimensions.kind }).from(dimensions),
    db.select().from(dimensionValues).orderBy(asc(dimensionValues.order)),
    db.select().from(qualCorrections).where(inArray(qualCorrections.validationId, validations.map((v) => v.v.id))),
  ]);

  const dimInfo = new Map(dimRows.map((d) => [d.id, d]));
  const optionsBy = new Map<string, string[]>();
  for (const v of valueRows) {
    const bucket = optionsBy.get(v.dimensionId) ?? [];
    bucket.push(v.label);
    optionsBy.set(v.dimensionId, bucket);
  }
  const correctionsBy = new Map<string, Record<string, string>>();
  for (const c of corrections) {
    const rec = correctionsBy.get(c.validationId) ?? {};
    rec[c.dimensionId] = c.correctedValue ?? '';
    correctionsBy.set(c.validationId, rec);
  }

  // Majority answer per (fragment, dimension) — what the validator reviews.
  const byFragment = new Map<string, Map<string, string[]>>();
  for (const { a } of rows) {
    if (a.skipped || a.value === null) continue;
    let dims = byFragment.get(a.fragmentId);
    if (!dims) { dims = new Map(); byFragment.set(a.fragmentId, dims); }
    const bucket = dims.get(a.dimensionId) ?? [];
    bucket.push(a.value);
    dims.set(a.dimensionId, bucket);
  }

  return validations.map(({ v, f }) => {
    const dims = byFragment.get(f.id) ?? new Map();
    const labels: QualSampleFragment['labels'] = [];
    for (const [dimensionId, values] of dims) {
      const info = dimInfo.get(dimensionId);
      if (!info || info.kind === 'free-text') continue;
      const counts = new Map<string, number>();
      for (const val of values) counts.set(val, (counts.get(val) ?? 0) + 1);
      let best: string = values[0] ?? ''; let bestCount = 0;
      for (const [val, c] of counts) if (c > bestCount) { best = val; bestCount = c; }
      labels.push({ dimensionId, name: info.name, value: best, options: optionsBy.get(dimensionId) ?? [] });
    }
    return {
      validationId: v.id, fragmentId: f.id,
      question: f.question, answer: f.text,
      status: v.status, rejectReason: v.rejectReason,
      labels: labels.sort((a, b) => a.name.localeCompare(b.name)),
      corrections: correctionsBy.get(v.id) ?? {},
    };
  });
}

// ─── Kappa view ──────────────────────────────────────────────────────

export type KappaData = {
  overall: number | null;
  byDimension: Array<{ name: string; kappa: number | null; comparable: number }>;
  comparableFragments: number;
  threshold: number;
};

export const KAPPA_THRESHOLD = 0.85;

export async function getKappaData(projectId: string): Promise<KappaData> {
  const db = getDb();
  const pkgs = await getPackages(projectId);
  const [ratings, dimRows, freeText] = await Promise.all([
    ratingsForPackages(pkgs.map((p) => p.id)),
    db.select({ id: dimensions.id, name: dimensions.name }).from(dimensions),
    freeTextDimensionIds(),
  ]);
  const dimName = new Map(dimRows.map((d) => [d.id, d.name]));
  const report = computeDiscrepancies(ratings, freeText);

  return {
    overall: report.overallKappa,
    comparableFragments: report.comparableFragments,
    threshold: KAPPA_THRESHOLD,
    byDimension: report.byDimension
      .map((d) => ({ name: dimName.get(d.dimensionId) ?? '—', kappa: d.kappa, comparable: d.comparable }))
      .sort((a, b) => (b.kappa ?? -1) - (a.kappa ?? -1)),
  };
}

// ─── Upload & segmentation ───────────────────────────────────────────

export async function getUploads(projectId: string) {
  const db = getDb();
  return db.select().from(corpusUploads)
    .where(eq(corpusUploads.projectId, projectId))
    .orderBy(desc(corpusUploads.createdAt));
}

export async function getSegmentationConfigs(projectId: string) {
  const db = getDb();
  return db.select().from(segmentationConfigs)
    .where(eq(segmentationConfigs.projectId, projectId))
    .orderBy(asc(segmentationConfigs.name));
}

export async function getFragmentSample(projectId: string, limit = 1) {
  const db = getDb();
  return db.select().from(fragments)
    .where(eq(fragments.projectId, projectId))
    .orderBy(asc(fragments.id))
    .limit(limit);
}

// ─── Report ──────────────────────────────────────────────────────────

export type ReportData = {
  packagesReviewed: number;
  fragmentsCompared: number;
  inconsistencyRate: number;
  threshold: number;
  overThreshold: number;
  worstDimension: { name: string; pct: number } | null;
  byDimension: Array<{ name: string; pct: number }>;
  returnedPackages: Array<{ code: string; returns: number; version: number; status: string; notes: string | null }>;
};

export async function getReportData(projectId: string): Promise<ReportData> {
  const db = getDb();
  const [pkgs, teamValidations, dimRows, freeText] = await Promise.all([
    getPackages(projectId),
    getTeamValidations(projectId),
    db.select({ id: dimensions.id, name: dimensions.name }).from(dimensions),
    freeTextDimensionIds(),
  ]);
  const dimName = new Map(dimRows.map((d) => [d.id, d.name]));
  const ratings = await ratingsForPackages(pkgs.map((p) => p.id));
  const report = computeDiscrepancies(ratings, freeText);

  const byDimension = report.byDimension.map((d) => ({ name: dimName.get(d.dimensionId) ?? '—', pct: d.pct }));

  return {
    packagesReviewed: pkgs.length,
    fragmentsCompared: report.comparableFragments,
    inconsistencyRate: report.ratingPct,
    threshold: DISCREPANCY_THRESHOLD,
    overThreshold: teamValidations.filter((t) => (t.errorRate ?? 0) >= DISCREPANCY_THRESHOLD).length,
    worstDimension: byDimension[0] ?? null,
    byDimension: byDimension.slice(0, 8),
    returnedPackages: pkgs
      .filter((p) => p.returnCount > 0 || p.status === 'returned' || p.status === 'blocked')
      .map((p) => ({ code: p.code, returns: p.returnCount, version: p.version, status: p.status, notes: p.notes })),
  };
}
