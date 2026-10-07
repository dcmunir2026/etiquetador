'use server';

/**
 * Workflow mutations: corpus upload, segmentation, teams, package split,
 * annotation and the two validation passes.
 */

import { revalidatePath } from 'next/cache';
import bcrypt from 'bcryptjs';
import { and, asc, eq, inArray, isNull, count, notInArray } from 'drizzle-orm';
import { getDb } from '@/db/client';
import {
  annotations, auditLog, corpusUploads, dimensionValues, dimensions, fragments,
  packageAssignments, packageFragments, packages, projectMembers, projectTaxonomies,
  qualCorrections, qualValidations, segmentationConfigs, taxonomyDimensions,
  teamMembers, teams, users,
  type ConsensusMetric, type SegmentationUnit, type UserRole,
} from '@/db/schema';
import { authorize, requireUser } from '@/lib/session';
import {
  buildCascade, flattenCascade, isComplete, pruneAnswers, type CascadeDimension,
} from '@/lib/cascade';
import { getProjectDimensions } from '@/lib/queries';
import { segTokenize, segSlice, segCount } from '@/lib/segmentation';
import {
  groupPrefragmented, prefragmentedStats, MAX_PREFRAGMENTED, type PrefragmentedPiece,
} from '@/lib/prefragmented';

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

async function audit(action: string, targetType: string, targetId: string, projectId?: string, metadata?: unknown) {
  const db = getDb();
  const user = await requireUser();
  await db.insert(auditLog).values({
    actorId: user.id, projectId: projectId ?? null, action, targetType, targetId,
    metadata: metadata ? JSON.stringify(metadata) : null,
  });
}

// ─── Segmentation config ─────────────────────────────────────────────

export async function saveSegmentationConfig(input: {
  projectId: string; id?: string; name: string; unit: SegmentationUnit;
  maxChunkSize: number; overlap: number; respectBoundaries: boolean; tolerance: number;
}): Promise<ActionResult> {
  const gate = await authorize('segmentation', input.projectId);
  if (!gate.ok) return { ok: false, error: gate.error };
  const db = getDb();
  const name = input.name?.trim();
  if (!name) return { ok: false, error: 'La configuración necesita un nombre.' };
  if (input.maxChunkSize < 10) return { ok: false, error: 'El tamaño máximo no puede ser menor que 10.' };
  if (input.overlap >= input.maxChunkSize) {
    return { ok: false, error: 'El overlap debe ser menor que el tamaño máximo.' };
  }

  const values = {
    projectId: input.projectId, name, unit: input.unit,
    maxChunkSize: input.maxChunkSize, overlap: input.overlap,
    respectBoundaries: input.respectBoundaries, tolerance: input.tolerance,
  };

  if (input.id) {
    await db.update(segmentationConfigs).set(values).where(eq(segmentationConfigs.id, input.id));
    await audit('segmentation.update', 'segmentation_config', input.id, input.projectId);
    revalidatePath('/', 'layout');
    return { ok: true, id: input.id };
  }

  const [existing] = await db.select().from(segmentationConfigs)
    .where(and(eq(segmentationConfigs.projectId, input.projectId), eq(segmentationConfigs.name, name)))
    .limit(1);
  if (existing) {
    await db.update(segmentationConfigs).set(values).where(eq(segmentationConfigs.id, existing.id));
    await audit('segmentation.update', 'segmentation_config', existing.id, input.projectId);
    revalidatePath('/', 'layout');
    return { ok: true, id: existing.id };
  }

  const [row] = await db.insert(segmentationConfigs).values(values).returning();
  await audit('segmentation.create', 'segmentation_config', row!.id, input.projectId);
  revalidatePath('/', 'layout');
  return { ok: true, id: row!.id };
}

// ─── Corpus upload ───────────────────────────────────────────────────

/**
 * Register an uploaded corpus and cut it into fragments using the
 * project's segmentation config.
 *
 * `rows` carries the parsed spreadsheet; the browser does the parsing so
 * the file itself never has to round-trip through the server.
 */
export async function ingestCorpus(input: {
  projectId: string;
  filename: string;
  sheetName?: string;
  sizeBytes?: number;
  columnMapping?: unknown;
  rows: Array<{ conversationId?: string; question?: string; answer: string }>;
}): Promise<ActionResult> {
  const gate = await authorize('upload', input.projectId);
  if (!gate.ok) return { ok: false, error: gate.error };
  const db = getDb();
  const user = await requireUser();
  if (!input.rows?.length) return { ok: false, error: 'El archivo no contiene filas utilizables.' };

  const [cfg] = await db.select().from(segmentationConfigs)
    .where(eq(segmentationConfigs.projectId, input.projectId))
    .orderBy(asc(segmentationConfigs.name)).limit(1);
  const params = {
    unit: (cfg?.unit ?? 'word') as SegmentationUnit,
    maxSize: cfg?.maxChunkSize ?? 120,
    overlap: cfg?.overlap ?? 20,
    respectBoundaries: cfg?.respectBoundaries ?? true,
    tolerance: cfg?.tolerance ?? 15,
  };

  // Deduplicate on conversationId, mirroring the upload screen's warning.
  const seen = new Set<string>();
  const unique: typeof input.rows = [];
  let duplicates = 0;
  for (const r of input.rows) {
    const key = r.conversationId?.trim();
    if (key) {
      if (seen.has(key)) { duplicates++; continue; }
      seen.add(key);
    }
    unique.push(r);
  }

  const [upload] = await db.insert(corpusUploads).values({
    projectId: input.projectId,
    filename: input.filename,
    sheetName: input.sheetName ?? null,
    sizeBytes: input.sizeBytes ?? 0,
    rowCount: input.rows.length,
    uniqueCount: unique.length,
    duplicateCount: duplicates,
    columnMapping: input.columnMapping ? JSON.stringify(input.columnMapping) : null,
    status: 'segmented',
    uploadedBy: user.id,
  }).returning();
  if (!upload) return { ok: false, error: 'No se pudo registrar la carga.' };

  let created = 0;
  let totalTokens = 0;
  let splitRows = 0;

  for (const row of unique) {
    const text = (row.answer ?? '').trim();
    if (!text) continue;
    const pieces = segSlice(segTokenize(text, params.unit), params);
    if (pieces.length > 1) splitRows++;
    for (const [i, piece] of pieces.entries()) {
      const tokens = segCount(piece, 'token');
      totalTokens += tokens;
      await db.insert(fragments).values({
        projectId: input.projectId,
        uploadId: upload.id,
        conversationId: row.conversationId ?? null,
        question: row.question ?? null,
        sourceText: text,
        text: piece,
        fragmentIndex: i + 1,
        fragmentTotal: pieces.length,
        charLength: piece.length,
        tokenCount: tokens,
      });
      created++;
    }
  }

  await db.update(corpusUploads).set({
    avgTokens: created ? Math.round(totalTokens / created) : 0,
    fragmentablePct: unique.length ? Math.round((splitRows / unique.length) * 100) : 0,
  }).where(eq(corpusUploads.id, upload.id));

  await audit('corpus.ingest', 'corpus_upload', upload.id, input.projectId, { created, duplicates });
  revalidatePath('/', 'layout');
  return { ok: true, id: upload.id };
}

/** Rows written per insert when loading an already-fragmented file. */
const FRAGMENT_CHUNK = 500;

/**
 * Register a corpus that arrives already fragmented (JSON from the spaCy
 * pipeline) and store its fragments verbatim.
 *
 * Unlike `ingestCorpus`, nothing is cut here: the cuts came with the file, so
 * the project's segmentation config is deliberately ignored. Fragments are
 * regrouped into the answer they came from only to rebuild `sourceText` and
 * the 1-of-N position shown while annotating.
 */
export async function ingestPrefragmented(input: {
  projectId: string;
  filename: string;
  sizeBytes?: number;
  pieces: PrefragmentedPiece[];
  /** `algoritmo` / `rubrica` blocks of the file, kept as provenance. */
  meta?: { algoritmo?: unknown; rubrica?: unknown };
}): Promise<ActionResult> {
  return ingestPrefragmentedImpl({
    projectId: input.projectId,
    filename: input.filename,
    sizeBytes: input.sizeBytes ?? 0,
    pieces: input.pieces ?? [],
    origen: 'json-prefragmentado',
    campos: { texto: 'fragmento', id: 'id', pregunta: 'preguntaOriginal', hash: 'respuestaHash' },
    meta: input.meta,
    auditAction: 'corpus.ingest.prefragmented',
  });
}

/**
 * CSV variant of `ingestPrefragmented`. Reuses the same insert + audit
 * pipeline; only the `origen` label and the column mapping differ so the
 * loader can tell how the corpus arrived later.
 */
export async function ingestPrefragmentedCsv(input: {
  projectId: string;
  filename: string;
  sizeBytes?: number;
  pieces: PrefragmentedPiece[];
}): Promise<ActionResult> {
  return ingestPrefragmentedImpl({
    projectId: input.projectId,
    filename: input.filename,
    sizeBytes: input.sizeBytes ?? 0,
    pieces: input.pieces ?? [],
    origen: 'csv-prefragmentado',
    campos: { texto: 'fragmento', id: 'respuestaHash', pregunta: 'pregunta', hash: 'respuestaHash' },
    meta: undefined,
    auditAction: 'corpus.ingest.prefragmented_csv',
  });
}

async function ingestPrefragmentedImpl(input: {
  projectId: string;
  filename: string;
  sizeBytes: number;
  pieces: PrefragmentedPiece[];
  /** Tag written to `corpus_uploads.columnMapping.origen` for provenance. */
  origen: string;
  /** Column map persisted alongside the upload so the loader can re-run. */
  campos: Record<string, string>;
  meta?: { algoritmo?: unknown; rubrica?: unknown };
  /** Audit log action. Lets the CSV path leave a distinct trace. */
  auditAction: 'corpus.ingest.prefragmented' | 'corpus.ingest.prefragmented_csv';
}): Promise<ActionResult> {
  const gate = await authorize('upload', input.projectId);
  if (!gate.ok) return { ok: false, error: gate.error };
  const db = getDb();
  const user = await requireUser();

  const pieces = input.pieces.filter((p) => p?.text?.trim());
  if (pieces.length === 0) return { ok: false, error: 'El archivo no contiene fragmentos utilizables.' };
  if (pieces.length > MAX_PREFRAGMENTED) {
    return { ok: false, error: `El archivo supera el máximo de ${MAX_PREFRAGMENTED} fragmentos por carga.` };
  }

  const groups = groupPrefragmented(pieces);
  const stats = prefragmentedStats(pieces, groups);

  const [upload] = await db.insert(corpusUploads).values({
    projectId: input.projectId,
    filename: input.filename,
    sheetName: null,
    sizeBytes: input.sizeBytes,
    rowCount: stats.answers + stats.duplicates,
    uniqueCount: stats.answers,
    duplicateCount: stats.duplicates,
    columnMapping: JSON.stringify({
      origen: input.origen,
      campos: input.campos,
      algoritmo: input.meta?.algoritmo ?? null,
      rubrica: input.meta?.rubrica ?? null,
    }),
    status: 'segmented',
    uploadedBy: user.id,
  }).returning();
  if (!upload) return { ok: false, error: 'No se pudo registrar la carga.' };

  const rows = groups.flatMap((group) =>
    group.pieces.map((piece, i) => ({
      projectId: input.projectId,
      uploadId: upload.id,
      conversationId: group.conversationId,
      question: group.question,
      sourceText: group.sourceText,
      text: piece.text,
      fragmentIndex: i + 1,
      fragmentTotal: group.pieces.length,
      charLength: piece.text.length,
      tokenCount: segCount(piece.text, 'token'),
    })),
  );

  for (let i = 0; i < rows.length; i += FRAGMENT_CHUNK) {
    await db.insert(fragments).values(rows.slice(i, i + FRAGMENT_CHUNK));
  }

  const totalTokens = rows.reduce((sum, r) => sum + r.tokenCount, 0);
  await db.update(corpusUploads).set({
    avgTokens: rows.length ? Math.round(totalTokens / rows.length) : 0,
    fragmentablePct: stats.answers ? Math.round((stats.splitAnswers / stats.answers) * 100) : 0,
  }).where(eq(corpusUploads.id, upload.id));

  await audit(input.auditAction, 'corpus_upload', upload.id, input.projectId, {
    created: rows.length, answers: stats.answers, duplicates: stats.duplicates,
  });
  revalidatePath('/', 'layout');
  return { ok: true, id: upload.id };
}

// ─── Dimension order (dependency graph) ──────────────────────────────

/**
 * Persist the order the dimensions are listed in, as dragged on the
 * dependency graph.
 *
 * The position lives on `taxonomy_dimensions`, so it belongs to the taxonomy
 * rather than to the project: two projects sharing a taxonomy share its
 * order. Every screen that reads `getProjectDimensions` — the graph and the
 * annotation form — follows it.
 *
 * The hierarchy is untouched: which dimension gates which is a dependency,
 * not a position, so dragging only moves siblings relative to each other.
 */
export async function reorderProjectDimensions(input: {
  projectId: string; dimensionIds: string[];
}): Promise<ActionResult> {
  // Ordering drives what annotators see, so it is project configuration.
  const gate = await authorize('dimensions', input.projectId);
  if (!gate.ok) return { ok: false, error: gate.error };
  const db = getDb();

  const ids = input.dimensionIds?.filter((id) => typeof id === 'string' && id) ?? [];
  if (ids.length === 0) return { ok: false, error: 'No se ha recibido ningún orden que guardar.' };
  if (new Set(ids).size !== ids.length) return { ok: false, error: 'El orden recibido repite dimensiones.' };

  const taxIds = (await db.select({ id: projectTaxonomies.taxonomyId })
    .from(projectTaxonomies).where(eq(projectTaxonomies.projectId, input.projectId))).map((r) => r.id);
  if (taxIds.length === 0) return { ok: false, error: 'El proyecto no tiene taxonomías asignadas.' };

  // Only reorder dimensions this project actually reaches.
  const links = await db.select({ dimensionId: taxonomyDimensions.dimensionId })
    .from(taxonomyDimensions).where(inArray(taxonomyDimensions.taxonomyId, taxIds));
  const reachable = new Set(links.map((l) => l.dimensionId));
  const unknown = ids.filter((id) => !reachable.has(id));
  if (unknown.length > 0) {
    return { ok: false, error: 'El orden incluye dimensiones que no pertenecen a este proyecto.' };
  }

  for (const [position, dimensionId] of ids.entries()) {
    await db.update(taxonomyDimensions).set({ order: position })
      .where(and(
        inArray(taxonomyDimensions.taxonomyId, taxIds),
        eq(taxonomyDimensions.dimensionId, dimensionId),
      ));
  }

  await audit('dimensions.reorder', 'project', input.projectId, input.projectId, { count: ids.length });
  revalidatePath('/', 'layout');
  return { ok: true, id: input.projectId };
}

// ─── Teams & roles ───────────────────────────────────────────────────

export async function createTeam(input: {
  projectId: string; name: string; groupSize: number; consensusMetric: ConsensusMetric;
}): Promise<ActionResult> {
  const gate = await authorize('roles', input.projectId);
  if (!gate.ok) return { ok: false, error: gate.error };
  const db = getDb();
  const name = input.name?.trim();
  if (!name) return { ok: false, error: 'El equipo necesita un nombre.' };

  const [clash] = await db.select().from(teams)
    .where(and(eq(teams.projectId, input.projectId), eq(teams.name, name))).limit(1);
  if (clash) return { ok: false, error: `Ya existe un equipo llamado "${name}".` };

  const [row] = await db.insert(teams).values({
    projectId: input.projectId, name,
    groupSize: Math.max(2, input.groupSize), consensusMetric: input.consensusMetric,
  }).returning();
  await audit('team.create', 'team', row!.id, input.projectId);
  revalidatePath('/', 'layout');
  return { ok: true, id: row!.id };
}

export async function setTeamMembers(teamId: string, userIds: string[]): Promise<ActionResult> {
  const gate = await authorize('roles');
  if (!gate.ok) return { ok: false, error: gate.error };
  const db = getDb();
  await db.delete(teamMembers).where(eq(teamMembers.teamId, teamId));
  for (const userId of userIds) {
    await db.insert(teamMembers).values({ teamId, userId, role: 'annotator' });
  }
  await db.update(teams).set({ groupSize: Math.max(2, userIds.length) }).where(eq(teams.id, teamId));
  await audit('team.members.set', 'team', teamId, undefined, { count: userIds.length });
  revalidatePath('/', 'layout');
  return { ok: true, id: teamId };
}

/** Minimum length for a password an admin sets on someone's behalf. */
const MIN_PASSWORD = 8;

/** Set or replace someone's password. Admin-side reset; there is no email flow yet. */
export async function resetPassword(projectId: string, userId: string, password: string): Promise<ActionResult> {
  const gate = await authorize('roles', projectId);
  if (!gate.ok) return { ok: false, error: gate.error };

  const clean = password?.trim() ?? '';
  if (clean.length < MIN_PASSWORD) {
    return { ok: false, error: `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.` };
  }

  const db = getDb();
  const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!target) return { ok: false, error: 'Usuario no encontrado.' };

  // Only a super admin may change another super admin's password.
  if (target.isSuperAdmin && !gate.user.isSuperAdmin) {
    return { ok: false, error: 'Solo un superadministrador puede cambiar esta contraseña.' };
  }

  await db.update(users)
    .set({ passwordHash: await bcrypt.hash(clean, 10), updatedAt: new Date() })
    .where(eq(users.id, userId));

  await audit('member.password.reset', 'user', userId, projectId);
  revalidatePath('/', 'layout');
  return { ok: true, id: userId };
}

/**
 * Replace the full set of roles a member carries in a project. A user
 * can wear more than one (the unique index on `project_members` is on
 * `(project_id, user_id, role)`), so this is an upsert-and-delete
 * operation rather than a column update.
 *
 * 'superadmin' is rejected silently — it is the global flag on
 * `users.is_super_admin`, never a value of `project_members.role`.
 * Refuses to write an empty set so a member always has at least one
 * role; deactivate the user instead if you want to drop them entirely.
 */
export async function setMemberRoles(
  projectId: string, userId: string, roles: UserRole[],
): Promise<ActionResult> {
  const gate = await authorize('roles', projectId);
  if (!gate.ok) return { ok: false, error: gate.error };

  // Drop 'superadmin' defensively. The Edit dialog already filters it
  // out, but a hand-crafted POST should not be able to lift the target
  // to platform admin via this path.
  const deduped = Array.from(new Set(
    roles.filter((r): r is Exclude<UserRole, 'superadmin'> => r !== 'superadmin'),
  ));
  if (deduped.length === 0) {
    return { ok: false, error: 'Un miembro del proyecto debe tener al menos un rol.' };
  }

  const db = getDb();
  const previous = await db.select({ role: projectMembers.role })
    .from(projectMembers)
    .where(and(
      eq(projectMembers.projectId, projectId),
      eq(projectMembers.userId, userId),
    ));
  const prevSet = new Set(previous.map((r) => r.role));

  // Replace the full set: drop what shouldn't be there, insert what should.
  // `onConflictDoNothing` makes the insert idempotent — racing clicks end
  // up with the same end state. The unique constraint on (projectId, userId,
  // role) means a duplicate role can never appear regardless.
  await db.delete(projectMembers)
    .where(and(
      eq(projectMembers.projectId, projectId),
      eq(projectMembers.userId, userId),
      notInArray(projectMembers.role, deduped),
    ));
  for (const role of deduped) {
    await db.insert(projectMembers).values({
      projectId, userId, role,
    }).onConflictDoNothing();
  }

  await audit('member.roles.set', 'user', userId, projectId, {
    previous: [...prevSet],
    next: deduped,
  });
  revalidatePath('/', 'layout');
  return { ok: true, id: userId };
}

/**
 * Replace the full set of teams a member belongs to within a project.
 *
 * Iterates every team in the project and brings `team_members` in line
 * with `teamIds`: deletes rows for teams not in the set, inserts rows
 * for teams in the set. Teams outside the project are ignored, so an
 * admin can't accidentally drop someone into a different project's team.
 */
export async function setMemberTeams(
  projectId: string, userId: string, teamIds: string[],
): Promise<ActionResult> {
  const gate = await authorize('roles', projectId);
  if (!gate.ok) return { ok: false, error: gate.error };
  const db = getDb();

  const projectTeamRows = await db.select({ id: teams.id })
    .from(teams).where(eq(teams.projectId, projectId));
  const validIds = new Set(projectTeamRows.map((t) => t.id));
  const filtered = teamIds.filter((id) => validIds.has(id));

  await db.delete(teamMembers)
    .where(and(eq(teamMembers.userId, userId),
                inArray(teamMembers.teamId, [...validIds])));
  for (const teamId of filtered) {
    await db.insert(teamMembers).values({ teamId, userId, role: 'annotator' });
  }
  await audit('member.teams.set', 'user', userId, projectId, { teamIds: filtered });
  revalidatePath('/', 'layout');
  return { ok: true, id: userId };
}

/**
 * Toggle `is_super_admin` on the target user. Only callable by an
 * existing superadmin; refuses to leave the system with zero active
 * superadmins (the caller could lock everyone else out of the platform
 * otherwise).
 */
export async function setUserSuperAdmin(
  targetUserId: string, isSuperAdmin: boolean,
): Promise<ActionResult> {
  const actor = await requireUser();
  if (!actor.isSuperAdmin) {
    return { ok: false, error: 'Solo un superadministrador puede conceder o quitar el flag de superadmin.' };
  }
  const db = getDb();

  const [target] = await db.select({ id: users.id, isSuperAdmin: users.isSuperAdmin, email: users.email, deletedAt: users.deletedAt })
    .from(users).where(eq(users.id, targetUserId)).limit(1);
  if (!target) return { ok: false, error: 'Usuario no encontrado.' };
  if (target.deletedAt) {
    return { ok: false, error: 'No se puede modificar un usuario desactivado. Reactívalo primero.' };
  }
  if (target.isSuperAdmin === isSuperAdmin) return { ok: true, id: targetUserId };

  // Demoting: refuse if this would leave the platform with zero active
  // superadmins. Self-demote counts against this — if you're the last
  // one, you can't remove yourself.
  if (target.isSuperAdmin && !isSuperAdmin) {
    const [stats] = await db.select({ n: count() }).from(users)
      .where(and(eq(users.isSuperAdmin, true), isNull(users.deletedAt)));
    const activeCount = stats?.n ?? 0;
    if (activeCount <= 1) {
      return { ok: false, error: 'No puedes quitar el flag al último superadministrador activo.' };
    }
  }

  await db.update(users).set({ isSuperAdmin, updatedAt: new Date() })
    .where(eq(users.id, targetUserId));
  await audit(
    isSuperAdmin ? 'user.superadmin.grant' : 'user.superadmin.revoke',
    'user', targetUserId, undefined,
    { actorEmail: actor.email, targetEmail: target.email },
  );
  revalidatePath('/', 'layout');
  return { ok: true, id: targetUserId };
}

// ─── Package split (H8) ──────────────────────────────────────────────

export type SplitStrategy = 'by-count' | 'by-size';
export type Distribution = 'stratified' | 'random' | 'natural';

/**
 * Divide the project's un-packaged fragments across its teams and assign
 * every package to all members of its team (paquete espejo).
 */
export async function generatePackages(input: {
  projectId: string;
  strategy: SplitStrategy;
  /** Number of packages (by-count) or fragments per package (by-size). */
  amount: number;
  distribution: Distribution;
  consensusMetric: ConsensusMetric;
}): Promise<ActionResult> {
  const gate = await authorize('paquetes', input.projectId);
  if (!gate.ok) return { ok: false, error: gate.error };
  const db = getDb();
  if (input.amount < 1) return { ok: false, error: 'La cantidad debe ser mayor que cero.' };

  const [teamRows, allFragments, taken] = await Promise.all([
    db.select().from(teams).where(eq(teams.projectId, input.projectId)).orderBy(asc(teams.name)),
    db.select({ id: fragments.id }).from(fragments).where(eq(fragments.projectId, input.projectId)).orderBy(asc(fragments.id)),
    db.select({ fragmentId: packageFragments.fragmentId }).from(packageFragments),
  ]);
  if (teamRows.length === 0) return { ok: false, error: 'Crea al menos un equipo antes de dividir el corpus.' };

  const used = new Set(taken.map((t) => t.fragmentId));
  let pool = allFragments.map((f) => f.id).filter((id) => !used.has(id));
  if (pool.length === 0) return { ok: false, error: 'No quedan fragmentos sin empaquetar.' };

  if (input.distribution === 'random' || input.distribution === 'stratified') {
    // Deterministic shuffle, so previewing and applying agree.
    let s = 0x9e3779b9;
    const rand = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 0xffffffff; };
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    }
  }

  const packageCount = input.strategy === 'by-count'
    ? Math.min(input.amount, pool.length)
    : Math.max(1, Math.ceil(pool.length / input.amount));
  const perPackage = Math.ceil(pool.length / packageCount);

  const members = await db.select({ teamId: teamMembers.teamId, userId: teamMembers.userId })
    .from(teamMembers).where(inArray(teamMembers.teamId, teamRows.map((t) => t.id)));
  const membersByTeam = new Map<string, string[]>();
  for (const m of members) {
    const bucket = membersByTeam.get(m.teamId) ?? [];
    bucket.push(m.userId);
    membersByTeam.set(m.teamId, bucket);
  }

  const existingCodes = new Set(
    (await db.select({ code: packages.code }).from(packages).where(eq(packages.projectId, input.projectId)))
      .map((p) => p.code),
  );

  let created = 0;
  for (let i = 0; i < packageCount; i++) {
    const slice = pool.slice(i * perPackage, (i + 1) * perPackage);
    if (slice.length === 0) break;
    const team = teamRows[i % teamRows.length]!;
    const letter = team.name.replace(/[^A-Za-z]/g, '').slice(-1).toUpperCase() || 'X';

    let n = 1;
    let code = `PK-${letter}-${String(n).padStart(3, '0')}`;
    while (existingCodes.has(code)) { n++; code = `PK-${letter}-${String(n).padStart(3, '0')}`; }
    existingCodes.add(code);

    const [pkg] = await db.insert(packages).values({
      projectId: input.projectId, teamId: team.id, code,
      isMirror: true, status: 'assigned', version: 1,
    }).returning();
    if (!pkg) continue;

    for (const [order, fragmentId] of slice.entries()) {
      await db.insert(packageFragments).values({ packageId: pkg.id, fragmentId, order });
    }
    const teamMemberIds = membersByTeam.get(team.id) ?? [];
    for (const [idx, userId] of teamMemberIds.entries()) {
      await db.insert(packageAssignments).values({
        packageId: pkg.id, userId, status: 'assigned', version: 0, isLead: idx === 0,
      });
    }
    if (input.consensusMetric) {
      await db.update(teams).set({ consensusMetric: input.consensusMetric }).where(eq(teams.id, team.id));
    }
    created++;
  }

  await audit('packages.generate', 'project', input.projectId, input.projectId, { created });
  revalidatePath('/', 'layout');
  return { ok: true, id: String(created) };
}

// ─── Annotation (H10-H12) ────────────────────────────────────────────

/**
 * Persist one annotator's answers for a fragment.
 *
 * Answers hidden by skip-logic are stored as explicit skips rather than
 * dropped: a skip is a real, comparable outcome when measuring agreement.
 */
export async function saveAnnotations(input: {
  projectId: string; fragmentId: string; packageId?: string | null;
  answers: Record<string, string>;
  notes?: Record<string, string>;
}): Promise<ActionResult> {
  const gate = await authorize('tagging', input.projectId);
  if (!gate.ok) return { ok: false, error: gate.error };
  const db = getDb();
  const user = await requireUser();

  const dims = await getProjectDimensions(input.projectId);
  const cascadeDims: CascadeDimension[] = dims.map((d) => ({
    id: d.id, name: d.name, kind: d.kind, values: d.values, dependency: d.dependency,
  }));

  // Drop answers whose gate no longer matches before writing.
  const cleaned = pruneAnswers(cascadeDims, input.answers);
  const nodes = flattenCascade(buildCascade(cascadeDims, cleaned));

  for (const node of nodes) {
    const skipped = node.visibility === 'skipped';
    const raw = cleaned[node.dim.id];
    const value = skipped ? null : (raw ?? null);

    const [existing] = await db.select().from(annotations)
      .where(and(
        eq(annotations.fragmentId, input.fragmentId),
        eq(annotations.userId, user.id),
        eq(annotations.dimensionId, node.dim.id),
      )).limit(1);

    const payload = {
      value, skipped,
      notes: input.notes?.[node.dim.id] ?? null,
      packageId: input.packageId ?? null,
      updatedAt: new Date(),
    };

    if (existing) {
      await db.update(annotations).set(payload).where(eq(annotations.id, existing.id));
    } else {
      await db.insert(annotations).values({
        fragmentId: input.fragmentId, userId: user.id, dimensionId: node.dim.id, ...payload,
      });
    }
  }

  // First save on a package moves the assignment out of "assigned".
  if (input.packageId) {
    const [assignment] = await db.select().from(packageAssignments)
      .where(and(eq(packageAssignments.packageId, input.packageId), eq(packageAssignments.userId, user.id)))
      .limit(1);
    if (assignment && assignment.status === 'assigned') {
      await db.update(packageAssignments).set({ status: 'in_progress' }).where(eq(packageAssignments.id, assignment.id));
      await db.update(packages).set({ status: 'in_progress', updatedAt: new Date() }).where(eq(packages.id, input.packageId));
    }
  }

  revalidatePath('/', 'layout');
  return { ok: true, id: input.fragmentId };
}

export async function submitPackage(packageId: string): Promise<ActionResult> {
  const gate = await authorize('tagging');
  if (!gate.ok) return { ok: false, error: gate.error };
  const db = getDb();
  const user = await requireUser();

  const [assignment] = await db.select().from(packageAssignments)
    .where(and(eq(packageAssignments.packageId, packageId), eq(packageAssignments.userId, user.id))).limit(1);
  if (!assignment) return { ok: false, error: 'No tienes este paquete asignado.' };

  // A package is only finished when every fragment in it is. Checked here
  // and not just on screen, so the rule holds however the call arrives.
  const [pkgRow] = await db.select().from(packages).where(eq(packages.id, packageId)).limit(1);
  if (!pkgRow) return { ok: false, error: 'Paquete no encontrado.' };

  const dims = await getProjectDimensions(pkgRow.projectId);
  const cascadeDims: CascadeDimension[] = dims.map((d) => ({
    id: d.id, name: d.name, kind: d.kind, values: d.values, dependency: d.dependency,
  }));

  const links = await db.select({ fragmentId: packageFragments.fragmentId, order: packageFragments.order })
    .from(packageFragments).where(eq(packageFragments.packageId, packageId))
    .orderBy(asc(packageFragments.order));

  const saved = await db.select({
    fragmentId: annotations.fragmentId, dimensionId: annotations.dimensionId,
    value: annotations.value, skipped: annotations.skipped,
  }).from(annotations)
    .where(and(eq(annotations.packageId, packageId), eq(annotations.userId, user.id)));

  const answersByFragment = new Map<string, Record<string, string>>();
  for (const a of saved) {
    const bucket = answersByFragment.get(a.fragmentId) ?? {};
    if (!a.skipped && a.value !== null) bucket[a.dimensionId] = a.value;
    answersByFragment.set(a.fragmentId, bucket);
  }

  const pending: number[] = [];
  for (const [i, link] of links.entries()) {
    if (!isComplete(cascadeDims, answersByFragment.get(link.fragmentId) ?? {})) pending.push(i + 1);
  }
  if (pending.length > 0) {
    const first = pending[0];
    return {
      ok: false,
      error: pending.length === 1
        ? `Queda 1 fragmento sin etiquetar por completo (el ${first}). Complétalo antes de enviar el paquete.`
        : `Quedan ${pending.length} fragmentos sin etiquetar por completo. El primero es el ${first}.`,
    };
  }

  await db.update(packageAssignments).set({
    status: 'submitted', version: assignment.version + 1, submittedAt: new Date(),
  }).where(eq(packageAssignments.id, assignment.id));

  const all = await db.select().from(packageAssignments).where(eq(packageAssignments.packageId, packageId));
  const everyoneIn = all.every((a) => a.id === assignment.id || a.status === 'submitted');
  if (everyoneIn) {
    await db.update(packages).set({ status: 'submitted', updatedAt: new Date() }).where(eq(packages.id, packageId));
  }

  await audit('package.submit', 'package', packageId);
  revalidatePath('/', 'layout');
  return { ok: true, id: packageId };
}

/** Send a package back for another annotation round. */
export async function returnPackageToTeam(packageId: string, reason?: string): Promise<ActionResult> {
  const gate = await authorize('quant-validation');
  if (!gate.ok) return { ok: false, error: gate.error };
  const db = getDb();
  const [pkg] = await db.select().from(packages).where(eq(packages.id, packageId)).limit(1);
  if (!pkg) return { ok: false, error: 'Paquete no encontrado.' };

  await db.update(packages).set({
    status: 'returned',
    version: pkg.version + 1,
    returnCount: pkg.returnCount + 1,
    notes: reason?.trim() || pkg.notes,
    updatedAt: new Date(),
  }).where(eq(packages.id, packageId));

  await db.update(packageAssignments).set({ status: 'in_progress' })
    .where(eq(packageAssignments.packageId, packageId));

  await audit('package.return', 'package', packageId, pkg.projectId, { reason });
  revalidatePath('/', 'layout');
  return { ok: true, id: packageId };
}

// ─── Qualitative validation (H18-H19) ────────────────────────────────

/** Draw a fresh random sample of a team's fragments for review. */
export async function buildQualSample(input: {
  projectId: string; teamId: string; percent: number;
}): Promise<ActionResult> {
  const gate = await authorize('validacion', input.projectId);
  if (!gate.ok) return { ok: false, error: gate.error };
  const db = getDb();
  const pct = Math.min(30, Math.max(5, input.percent));

  const [pkg] = await db.select().from(packages)
    .where(and(eq(packages.projectId, input.projectId), eq(packages.teamId, input.teamId))).limit(1);
  if (!pkg) return { ok: false, error: 'Este equipo no tiene paquete asignado.' };

  const links = await db.select({ fragmentId: packageFragments.fragmentId })
    .from(packageFragments).where(eq(packageFragments.packageId, pkg.id))
    .orderBy(asc(packageFragments.order));
  if (links.length === 0) return { ok: false, error: 'El paquete no tiene fragmentos.' };

  const size = Math.max(1, Math.round((links.length * pct) / 100));
  let s = 0x2545f491;
  const rand = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 0xffffffff; };
  const shuffled = [...links];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }

  // Keep decisions already made; only top up the sample.
  const existing = await db.select().from(qualValidations).where(eq(qualValidations.teamId, input.teamId));
  const have = new Set(existing.map((v) => v.fragmentId));
  let added = 0;
  for (const link of shuffled) {
    if (have.size >= size) break;
    if (have.has(link.fragmentId)) continue;
    await db.insert(qualValidations).values({
      projectId: input.projectId, teamId: input.teamId, packageId: pkg.id,
      fragmentId: link.fragmentId, status: 'pending',
    });
    have.add(link.fragmentId);
    added++;
  }

  await audit('qual.sample', 'team', input.teamId, input.projectId, { size, added });
  revalidatePath('/', 'layout');
  return { ok: true, id: String(added) };
}

export async function approveQualFragment(validationId: string): Promise<ActionResult> {
  const gate = await authorize('validacion');
  if (!gate.ok) return { ok: false, error: gate.error };
  const db = getDb();
  const user = await requireUser();
  await db.update(qualValidations).set({
    status: 'approved', validatorId: user.id, reviewedAt: new Date(), rejectReason: null,
  }).where(eq(qualValidations.id, validationId));
  await db.delete(qualCorrections).where(eq(qualCorrections.validationId, validationId));
  await audit('qual.approve', 'qual_validation', validationId);
  revalidatePath('/', 'layout');
  return { ok: true, id: validationId };
}

/** Record the validator's overrides for a fragment. */
export async function correctQualFragment(input: {
  validationId: string;
  corrections: Array<{ dimensionId: string; originalValue: string; correctedValue: string }>;
  reason?: string;
}): Promise<ActionResult> {
  const gate = await authorize('validacion');
  if (!gate.ok) return { ok: false, error: gate.error };
  const db = getDb();
  const user = await requireUser();
  const changed = input.corrections.filter((c) => c.correctedValue !== c.originalValue);
  if (changed.length === 0) {
    return { ok: false, error: 'No has cambiado ningún valor. Usa "Aprobar" si el etiquetado es correcto.' };
  }

  await db.update(qualValidations).set({
    status: 'corrected', validatorId: user.id, reviewedAt: new Date(),
    rejectReason: input.reason?.trim() || null,
  }).where(eq(qualValidations.id, input.validationId));

  await db.delete(qualCorrections).where(eq(qualCorrections.validationId, input.validationId));
  for (const c of changed) {
    await db.insert(qualCorrections).values({
      validationId: input.validationId, dimensionId: c.dimensionId,
      originalValue: c.originalValue, correctedValue: c.correctedValue,
    });
  }

  await audit('qual.correct', 'qual_validation', input.validationId, undefined, { count: changed.length });
  revalidatePath('/', 'layout');
  return { ok: true, id: input.validationId };
}

// ─── User soft-delete ──────────────────────────────────────────────────

/**
 * Mark a user as deactivated. Only superadmins can do this. The user
 * row stays so that annotations, package assignments and team memberships
 * keep their referential integrity; the next login attempt is rejected
 * by `lib/auth.ts` because `deleted_at IS NOT NULL`.
 *
 * Refuses to delete yourself (no last-admin lockout) and the only other
 * superadmin, if any (we'd need a separate confirm for that, but the
 * caller can still proceed if it's intentional).
 */
export async function deactivateUser(userId: string): Promise<ActionResult> {
  const gate = await authorize('taxonomies'); // superadmin only (see permissions.ts)
  if (!gate.ok) return { ok: false, error: gate.error };

  if (!userId) return { ok: false, error: 'Falta el usuario a desactivar.' };

  const db = getDb();
  const me = gate.user;

  if (userId === me.id) {
    return { ok: false, error: 'No puedes desactivarte a ti mismo.' };
  }

  const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!target) return { ok: false, error: 'Usuario no encontrado.' };
  if (target.deletedAt) {
    return { ok: true, id: userId }; // already inactive — no-op
  }

  await db.update(users)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(users.id, userId));

  await audit('user.deactivate', 'user', userId, undefined, { name: target.name, email: target.email });

  revalidatePath('/', 'layout');
  return { ok: true, id: userId };
}

/**
 * Reverse of `deactivateUser`: clear the soft-delete tombstone so the
 * account can sign in again. Only superadmins can reactivate. Reactivating
 * yourself is allowed (handy when another admin deactivated you by
 * accident); we still audit it for traceability.
 *
 * `password_hash`, `must_change_password`, project role and team
 * memberships are all preserved — we only flip `deleted_at` back to NULL.
 */
export async function reactivateUser(userId: string): Promise<ActionResult> {
  const gate = await authorize('taxonomies'); // superadmin only (see permissions.ts)
  if (!gate.ok) return { ok: false, error: gate.error };

  if (!userId) return { ok: false, error: 'Falta el usuario a reactivar.' };

  const db = getDb();

  const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!target) return { ok: false, error: 'Usuario no encontrado.' };
  if (!target.deletedAt) {
    return { ok: true, id: userId }; // already active — no-op
  }

  await db.update(users)
    .set({ deletedAt: null, updatedAt: new Date() })
    .where(eq(users.id, userId));

  await audit('user.reactivate', 'user', userId, undefined, { name: target.name, email: target.email });

  revalidatePath('/', 'layout');
  return { ok: true, id: userId };
}

/**
 * Reset an existing account to the default password (`etiquetador` or
 * whatever `DEV_PASSWORD` resolves to). Only superadmins can do this.
 * The user is allowed to flip themselves in this help-loop (the admin
 * may have forgotten their own password and locked themselves out).
 *
 * The flag `must_change_password` is set so the recipient is forced
 * through the change-password flow on next sign-in — they won't be
 * able to use the default past the first session.
 *
 * NOTE: Auth.js sessions are issued as JWTs that don't include the
 * password hash, so existing sessions for the affected user stay
 * valid until they expire or the user signs out. To immediately
 * invalidate them, the user must log out (the admin can ask them to).
 * A future enhancement would be a server-side JWT revocation list,
 * but that's out of scope for this action.
 *
 * Returns the new default password so the admin can communicate it to
 * the person (since the recipient has no email-based password recovery
 * flow yet).
 */
export async function resetPasswordToDefault(userId: string): Promise<ActionResult & { defaultPassword?: string }> {
  const gate = await authorize('taxonomies'); // superadmin only
  if (!gate.ok) return { ok: false, error: gate.error };

  if (!userId) return { ok: false, error: 'Falta el usuario.' };

  const db = getDb();
  const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!target) return { ok: false, error: 'Usuario no encontrado.' };
  if (target.deletedAt) {
    return { ok: false, error: 'No puedes reiniciar la contraseña de una persona desactivada. Reactívala primero.' };
  }

  const defaultPassword = process.env.DEV_PASSWORD || 'etiquetador';
  const passwordHash = await bcrypt.hash(defaultPassword, 10);
  await db.update(users)
    .set({ passwordHash, mustChangePassword: true, updatedAt: new Date() })
    .where(eq(users.id, userId));

  await audit('user.password.reset_to_default', 'user', userId, undefined, {
    name: target.name, email: target.email,
  });

  revalidatePath('/', 'layout');
  return { ok: true, id: userId, defaultPassword };
}
