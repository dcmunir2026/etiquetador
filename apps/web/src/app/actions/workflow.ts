'use server';

/**
 * Workflow mutations: corpus upload, segmentation, teams, package split,
 * annotation and the two validation passes.
 */

import { revalidatePath } from 'next/cache';
import bcrypt from 'bcryptjs';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db/client';
import {
  annotations, auditLog, corpusUploads, dimensionValues, dimensions, fragments,
  packageAssignments, packageFragments, packages, projectMembers, qualCorrections,
  qualValidations, segmentationConfigs, teamMembers, teams, users,
  type ConsensusMetric, type SegmentationUnit, type UserRole,
} from '@/db/schema';
import { authorize, requireUser } from '@/lib/session';
import { buildCascade, flattenCascade, pruneAnswers, type CascadeDimension } from '@/lib/cascade';
import { getProjectDimensions } from '@/lib/queries';
import { segTokenize, segSlice, segCount } from '@/lib/segmentation';

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

export async function inviteMember(input: {
  projectId: string; email: string; name?: string; role: UserRole;
  teamId?: string; password?: string;
}): Promise<ActionResult> {
  const gate = await authorize('roles', input.projectId);
  if (!gate.ok) return { ok: false, error: gate.error };
  const db = getDb();
  const email = input.email?.trim().toLowerCase();
  if (!email || !email.includes('@')) return { ok: false, error: 'Introduce un email válido.' };

  const password = input.password?.trim();
  if (password && password.length < MIN_PASSWORD) {
    return { ok: false, error: `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.` };
  }

  let [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) {
    // Without a password the account exists but cannot sign in, which is
    // the intended state until an admin sets one.
    [user] = await db.insert(users).values({
      email, name: input.name?.trim() || email.split('@')[0]!, isSuperAdmin: false,
      passwordHash: password ? await bcrypt.hash(password, 10) : null,
    }).returning();
  } else if (password) {
    await db.update(users).set({ passwordHash: await bcrypt.hash(password, 10), updatedAt: new Date() })
      .where(eq(users.id, user.id));
  }
  if (!user) return { ok: false, error: 'No se pudo crear el usuario.' };

  const [member] = await db.select().from(projectMembers)
    .where(and(eq(projectMembers.projectId, input.projectId), eq(projectMembers.userId, user.id))).limit(1);
  if (!member) {
    await db.insert(projectMembers).values({ projectId: input.projectId, userId: user.id, role: input.role });
  } else {
    await db.update(projectMembers).set({ role: input.role }).where(eq(projectMembers.id, member.id));
  }

  if (input.teamId) {
    const [tm] = await db.select().from(teamMembers)
      .where(and(eq(teamMembers.teamId, input.teamId), eq(teamMembers.userId, user.id))).limit(1);
    if (!tm) await db.insert(teamMembers).values({ teamId: input.teamId, userId: user.id, role: 'annotator' });
  }

  await audit('member.invite', 'user', user.id, input.projectId, { email, role: input.role });
  revalidatePath('/', 'layout');
  return { ok: true, id: user.id };
}

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

export async function setMemberRole(projectId: string, userId: string, role: UserRole): Promise<ActionResult> {
  const gate = await authorize('roles', projectId);
  if (!gate.ok) return { ok: false, error: gate.error };
  const db = getDb();
  await db.update(projectMembers).set({ role })
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
  await audit('member.role.set', 'user', userId, projectId, { role });
  revalidatePath('/', 'layout');
  return { ok: true, id: userId };
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
