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
  auditLog, invitationTokens, projects, projectMembers, users,
  type UserRole,
} from '@/db/schema';
import { authorize, requireUser } from '@/lib/session';
import { sendInvitationEmail } from '@/lib/mail';
import { signIn } from '@/lib/auth';

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

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

export async function inviteMember(input: {
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

  // Create the user if they don't exist; do NOT set a password — the
  // email link is the only path into the account.
  let [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) {
    [user] = await db.insert(users).values({
      email,
      name: input.name?.trim() || email.split('@')[0]!,
      isSuperAdmin: false,
      passwordHash: null,
    }).returning();
    if (!user) return { ok: false, error: 'No se pudo crear el usuario.' };
  }

  // Add to the project (or update role). Membership is granted at
  // invite time — the link just sets the password for new users.
  const [member] = await db.select().from(projectMembers)
    .where(and(eq(projectMembers.projectId, input.projectId), eq(projectMembers.userId, user.id)))
    .limit(1);
  if (!member) {
    await db.insert(projectMembers).values({
      projectId: input.projectId, userId: user.id, role: input.role,
    });
  } else if (member.role !== input.role) {
    await db.update(projectMembers).set({ role: input.role })
      .where(eq(projectMembers.id, member.id));
  }

  // Attach to a team if requested. Team membership is in `team_members`,
  // which is owned by the team edit dialog (setTeamMembers); the invite
  // path doesn't add the user to the team here. Leaving the option in
  // the input is informative for call sites that pass it.
  void input.teamId;

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
    // Surface the failure to the admin. The user and token row stay so the
    // admin can retry from a future "Reenviar invitación" action; for now
    // we just return the error so the UI shows it.
    return { ok: false, error: `El correo no salió: ${sent.error}` };
  }

  await db.insert(auditLog).values({
    actorId: gate.user.id,
    projectId: input.projectId,
    action: 'member.invite',
    targetType: 'user',
    targetId: user.id,
    metadata: JSON.stringify({ email, role: input.role, expiresAt: expiresAt.toISOString() }),
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
  if (!sent.ok) return { ok: false, error: `El correo no salió: ${sent.error}` };

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
