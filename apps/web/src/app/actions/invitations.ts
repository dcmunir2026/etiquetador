'use server';

/**
 * Invitation flow: invite a person to a project, and redeem the
 * one-time link they receive by email.
 *
 * `inviteMember` is the action the Roles view calls. It does NOT take
 * a password any more: the recipient sets theirs by clicking the magic
 * link, which lands them on `/invite/[token]`.
 *
 * The token is generated server-side, stored hashed (SHA-256), and the
 * raw value only travels in the email. The redeem path verifies the
 * hash, checks expiry and unused state, sets the password, signs the
 * user in via Auth.js credentials, and lands them at `/`.
 */

import { redirect } from 'next/navigation';
import { and, eq, isNull } from 'drizzle-orm';
import { randomBytes, createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { revalidatePath } from 'next/cache';
import { getDb } from '@/db/client';
import {
  auditLog, invitationTokens, projects, projectMembers, teamMembers, teams, users,
  type UserRole,
} from '@/db/schema';
import { authorize, requireUser } from '@/lib/session';
import { sendInvitationEmail } from '@/lib/mail';
import { signIn } from '@/lib/auth';

export type ActionResult =
  | { ok: true; id?: string; usedDefaultPassword?: boolean; defaultPassword?: string }
  | { ok: false; error: string };

const TOKEN_BYTES = 32;
const DEFAULT_EXPIRES_HOURS = 24 * 7;

/** Produce a fresh random token (raw) and its SHA-256 hex digest. */
function newToken(): { raw: string; hash: string } {
  const raw = randomBytes(TOKEN_BYTES).toString('base64url');
  const hash = createHash('sha256').update(raw).digest('hex');
  return { raw, hash };
}

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/** Public app URL: prefer the request's origin, fall back to env. */
function publicOrigin(): string {
  if (process.env.AUTH_URL) return process.env.AUTH_URL.replace(/\/$/, '');
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL.replace(/\/$/, '');
  return 'http://localhost:3000';
}

export async function inviteNewMemberToProject(input: {
  projectId: string;
  email: string;
  name?: string;
  role: UserRole;
  teamId?: string;
}): Promise<ActionResult> {
  const gate = await authorize('roles', input.projectId);
  if (!gate.ok) return { ok: false, error: gate.error };
  const db = getDb();

  const email = input.email?.trim().toLowerCase();
  if (!email || !email.includes('@')) return { ok: false, error: 'Introduce un email válido.' };

  const [project] = await db.select().from(projects).where(eq(projects.id, input.projectId)).limit(1);
  if (!project) return { ok: false, error: 'Proyecto no encontrado.' };

  // This action is only for people who don't exist yet. Existing users
  // must be shared via the typeahead (`addExistingMemberToProject`):
  // emailing them a magic link would silently overwrite their password
  // when they redeem it. Catch the case before we touch anything.
  const [existing] = await db.select({ id: users.id }).from(users)
    .where(eq(users.email, email)).limit(1);
  if (existing) {
    return {
      ok: false,
      error: 'Esta persona ya existe. Búscala en el listado para añadirla al proyecto.',
    };
  }

  // Create the user with no password — the email link is the only path
  // into the account. If the email send fails later, the fallback handler
  // seeds the default password so the admin can deliver them by hand.
  const [user] = await db.insert(users).values({
    email,
    name: input.name?.trim() || email.split('@')[0]!,
    isSuperAdmin: false,
    passwordHash: null,
  }).returning();
  if (!user) return { ok: false, error: 'No se pudo crear el usuario.' };

  // Membership is granted at invite time — the link just sets the password.
  // `onConflictDoNothing` makes the action safe against the admin double-
  // clicking or two browser tabs racing the same submit.
  await db.insert(projectMembers).values({
    projectId: input.projectId, userId: user.id, role: input.role,
  }).onConflictDoNothing();

  // Attach to a team if requested. `team_members` is the join table
  // between users and teams; we just insert a row with `role:
  // 'annotator'` (the default in the schema). We verify the team belongs
  // to the same project first so a stale or foreign teamId can't sneak
  // someone into the wrong project.
  if (input.teamId) {
    const [team] = await db.select({ id: teams.id, projectId: teams.projectId })
      .from(teams)
      .where(eq(teams.id, input.teamId))
      .limit(1);
    if (!team || team.projectId !== input.projectId) {
      return { ok: false, error: 'El equipo seleccionado no pertenece a este proyecto.' };
    }
    // Skip if already a member (PK is (team_id, user_id); the insert
    // would otherwise raise a unique-violation).
    const [existingMembership] = await db.select({ userId: teamMembers.userId })
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, input.teamId), eq(teamMembers.userId, user.id)))
      .limit(1);
    if (!existingMembership) {
      await db.insert(teamMembers).values({
        teamId: input.teamId,
        userId: user.id,
        role: 'annotator',
      });
    }
  }

  // Issue the token.
  const { raw, hash } = newToken();
  const expiresAt = new Date(Date.now() + DEFAULT_EXPIRES_HOURS * 60 * 60 * 1000);
  await db.insert(invitationTokens).values({
    userId: user.id,
    projectId: input.projectId,
    tokenHash: hash,
    expiresAt,
    invitedBy: gate.user.id,
  });

  const inviteUrl = `${publicOrigin()}/invite/${raw}`;
  const sent = await sendInvitationEmail({
    to: email,
    inviterName: gate.user.name,
    projectName: project.name,
    inviteUrl,
    expiresInHours: DEFAULT_EXPIRES_HOURS,
  });
  if (!sent.ok) {
    // Mail didn't go out. Don't strand the account — if the user has no
    // password yet, seed the default so the admin can hand the
    // credentials to the person directly. The recipient will be asked to
    // change it on first sign-in via `must_change_password`.
    const seeded = await maybeSeedDefaultPassword(user.id);
    if (seeded) {
      await db.insert(auditLog).values({
        actorId: gate.user.id,
        projectId: input.projectId,
        action: 'member.invite.fallback_password',
        targetType: 'user',
        targetId: user.id,
        metadata: JSON.stringify({ email, reason: sent.error, teamId: input.teamId ?? null }),
      });
      revalidatePath('/', 'layout');
      return {
        ok: true,
        id: user.id,
        usedDefaultPassword: true,
        defaultPassword: DEFAULT_INVITATION_PASSWORD,
      };
    }
    // Already had a password — they can still sign in via their existing
    // credentials; just couldn't email the magic link. Surface the send
    // error so the admin knows.
    return { ok: false, error: `El correo no salió: ${sent.error}` };
  }

  await db.insert(auditLog).values({
    actorId: gate.user.id,
    projectId: input.projectId,
    action: 'member.invite.new',
    targetType: 'user',
    targetId: user.id,
    metadata: JSON.stringify({
      email, role: input.role, expiresAt: expiresAt.toISOString(),
      teamId: input.teamId ?? null,
    }),
  });

  revalidatePath('/', 'layout');
  return { ok: true, id: user.id };
}

/**
 * Add a user who already exists (has signed in, has a password) to a
 * project. No email is sent and no token is minted: the recipient is
 * already a known collaborator being shared across projects.
 *
 * This is the path the new-member typeahead uses. The membership upsert
 * is `onConflictDoNothing` so a double-click or two racing tabs won't
 * raise a unique-violation.
 */
export async function addExistingMemberToProject(input: {
  projectId: string;
  userId: string;
  role: UserRole;
  teamId?: string;
}): Promise<ActionResult> {
  const gate = await authorize('roles', input.projectId);
  if (!gate.ok) return { ok: false, error: gate.error };
  const db = getDb();

  const [user] = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
  if (!user) return { ok: false, error: 'Usuario no encontrado.' };
  if (user.deletedAt) return { ok: false, error: 'Este usuario está desactivado.' };

  await db.insert(projectMembers).values({
    projectId: input.projectId, userId: user.id, role: input.role,
  }).onConflictDoNothing();

  // Same team-handling as the invite path: validate the team belongs to
  // the project, skip if already a member. The unique index on
  // (team_id, user_id) would otherwise raise.
  if (input.teamId) {
    const [team] = await db.select({ id: teams.id, projectId: teams.projectId })
      .from(teams)
      .where(eq(teams.id, input.teamId))
      .limit(1);
    if (!team || team.projectId !== input.projectId) {
      return { ok: false, error: 'El equipo seleccionado no pertenece a este proyecto.' };
    }
    const [existingMembership] = await db.select({ userId: teamMembers.userId })
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, input.teamId), eq(teamMembers.userId, user.id)))
      .limit(1);
    if (!existingMembership) {
      await db.insert(teamMembers).values({
        teamId: input.teamId,
        userId: user.id,
        role: 'annotator',
      });
    }
  }

  await db.insert(auditLog).values({
    actorId: gate.user.id,
    projectId: input.projectId,
    action: 'member.add_existing',
    targetType: 'user',
    targetId: user.id,
    metadata: JSON.stringify({
      email: user.email, role: input.role, teamId: input.teamId ?? null,
    }),
  });

  revalidatePath('/', 'layout');
  return { ok: true, id: user.id };
}

/**
 * Re-send the invitation for an existing project member who hasn't
 * accepted yet. Reuses the latest unused + unexpired token if there is
 * one (raw value isn't recoverable once hashed, so we mint a new one and
 * mark the old one used by expiry — actually we just rotate: new token
 * row, leave the old one in place; it's harmless since it's already
 * expired). Idempotent: calling repeatedly just keeps giving the
 * recipient the freshest link.
 */
export async function resendInvitation(input: {
  projectId: string;
  userId: string;
}): Promise<ActionResult> {
  const gate = await authorize('roles', input.projectId);
  if (!gate.ok) return { ok: false, error: gate.error };
  const db = getDb();

  const [user] = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
  if (!user) return { ok: false, error: 'Persona no encontrada.' };
  if (user.passwordHash) {
    return { ok: false, error: 'Esta persona ya aceptó su invitación.' };
  }

  const [project] = await db.select().from(projects).where(eq(projects.id, input.projectId)).limit(1);
  if (!project) return { ok: false, error: 'Proyecto no encontrado.' };

  // Confirm they're actually a member of this project.
  const [member] = await db.select().from(projectMembers)
    .where(and(eq(projectMembers.projectId, input.projectId), eq(projectMembers.userId, user.id)))
    .limit(1);
  if (!member) return { ok: false, error: 'Esta persona no es miembro del proyecto.' };

  const { raw, hash } = newToken();
  const expiresAt = new Date(Date.now() + DEFAULT_EXPIRES_HOURS * 60 * 60 * 1000);
  await db.insert(invitationTokens).values({
    userId: user.id,
    projectId: input.projectId,
    tokenHash: hash,
    expiresAt,
    invitedBy: gate.user.id,
  });

  const inviteUrl = `${publicOrigin()}/invite/${raw}`;
  const sent = await sendInvitationEmail({
    to: user.email,
    inviterName: gate.user.name,
    projectName: project.name,
    inviteUrl,
    expiresInHours: DEFAULT_EXPIRES_HOURS,
  });
  if (!sent.ok) {
    // Same fallback as `inviteMember`: if the account is still password-
    // less, seed the default so the admin can hand the credentials to
    // the person directly instead of leaving the account stranded.
    const seeded = await maybeSeedDefaultPassword(input.userId);
    if (seeded) {
      await db.insert(auditLog).values({
        actorId: gate.user.id,
        projectId: input.projectId,
        action: 'member.invite.resend.fallback_password',
        targetType: 'user',
        targetId: user.id,
        metadata: JSON.stringify({ email: user.email, reason: sent.error }),
      });
      revalidatePath('/', 'layout');
      return {
        ok: true,
        id: user.id,
        usedDefaultPassword: true,
        defaultPassword: DEFAULT_INVITATION_PASSWORD,
      };
    }
    return { ok: false, error: `El correo no salió: ${sent.error}` };
  }

  await db.insert(auditLog).values({
    actorId: gate.user.id,
    projectId: input.projectId,
    action: 'member.invite.resend',
    targetType: 'user',
    targetId: user.id,
    metadata: JSON.stringify({ email: user.email, expiresAt: expiresAt.toISOString() }),
  });

  revalidatePath('/', 'layout');
  return { ok: true, id: user.id };
}

export type InviteStatus =
  | { kind: 'valid'; email: string; name: string; projectName: string }
  | { kind: 'expired' }
  | { kind: 'used' }
  | { kind: 'invalid' };

/** Look up an invitation by its raw token (read-only, used by the page). */
export async function checkInvitation(rawToken: string): Promise<InviteStatus> {
  if (!rawToken) return { kind: 'invalid' };
  const db = getDb();
  const hash = hashToken(rawToken);
  const rows = await db
    .select({
      tokenId: invitationTokens.id,
      usedAt: invitationTokens.usedAt,
      expiresAt: invitationTokens.expiresAt,
      email: users.email,
      name: users.name,
      projectName: projects.name,
    })
    .from(invitationTokens)
    .innerJoin(users, eq(users.id, invitationTokens.userId))
    .innerJoin(projects, eq(projects.id, invitationTokens.projectId))
    .where(eq(invitationTokens.tokenHash, hash))
    .limit(1);
  const row = rows[0];
  if (!row) return { kind: 'invalid' };
  if (row.usedAt) return { kind: 'used' };
  if (row.expiresAt.getTime() <= Date.now()) return { kind: 'expired' };

  return {
    kind: 'valid',
    email: row.email,
    name: row.name ?? row.email,
    projectName: row.projectName,
  };
}

const MIN_PASSWORD = 8;

/**
 * The default password seeded onto an account when its invitation email
 * could not be delivered (RESEND_API_KEY missing in dev, or any send
 * failure). The recipient is forced to change it on first sign-in via
 * the `must_change_password` flag and the middleware redirect.
 */
const DEFAULT_INVITATION_PASSWORD = process.env.DEV_PASSWORD || 'etiquetador';

/**
 * If the email send failed and the user account has no password yet,
 * fall back to seeding the default password so the admin can hand the
 * credentials to the person directly. Returns true if the fallback
 * actually applied.
 */
async function maybeSeedDefaultPassword(userId: string): Promise<boolean> {
  const db = getDb();
  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!u || u.passwordHash) return false;
  const hash = await bcrypt.hash(DEFAULT_INVITATION_PASSWORD, 10);
  await db.update(users).set({
    passwordHash: hash,
    mustChangePassword: true,
    updatedAt: new Date(),
  }).where(eq(users.id, userId));
  return true;
}

/** Set a password on the invited user and sign them in. */
export async function redeemInvitation(input: {
  token: string;
  password: string;
}): Promise<ActionResult | never> {
  const rawToken = input.token?.trim();
  if (!rawToken) return { ok: false, error: 'Enlace incompleto.' };
  const password = input.password?.trim() ?? '';
  if (password.length < MIN_PASSWORD) {
    return { ok: false, error: `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.` };
  }
  if (password.length > 200) {
    return { ok: false, error: 'Contraseña demasiado larga.' };
  }

  const db = getDb();
  const hash = hashToken(rawToken);
  const [row] = await db.select().from(invitationTokens)
    .where(eq(invitationTokens.tokenHash, hash)).limit(1);
  if (!row) return { ok: false, error: 'Invitación no encontrada.' };
  if (row.usedAt) return { ok: false, error: 'Esta invitación ya fue utilizada.' };
  if (row.expiresAt.getTime() <= Date.now()) return { ok: false, error: 'Esta invitación ha caducado.' };

  const [user] = await db.select().from(users).where(eq(users.id, row.userId)).limit(1);
  if (!user) return { ok: false, error: 'El usuario invitado ya no existe.' };

  const passwordHash = await bcrypt.hash(password, 10);
  await db.update(users).set({ passwordHash, updatedAt: new Date() })
    .where(eq(users.id, user.id));
  // Mark the token used atomically; the unique hash index ensures a
  // double-click can't reuse it.
  const updated = await db.update(invitationTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(invitationTokens.id, row.id), isNull(invitationTokens.usedAt)))
    .returning({ id: invitationTokens.id });
  if (updated.length === 0) return { ok: false, error: 'Esta invitación ya fue utilizada.' };

  await db.insert(auditLog).values({
    actorId: user.id,
    projectId: row.projectId,
    action: 'member.redeem',
    targetType: 'user',
    targetId: user.id,
    metadata: JSON.stringify({ via: 'invitation' }),
  });

  // Sign the user in. signIn throws NEXT_REDIRECT, which Next.js handles.
  await signIn('credentials', {
    email: user.email,
    password,
    redirectTo: '/',
  });
  // Unreachable: signIn always throws.
  redirect('/');
}
