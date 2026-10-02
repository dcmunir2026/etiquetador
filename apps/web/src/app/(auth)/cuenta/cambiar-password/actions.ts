'use server';

import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { revalidatePath } from 'next/cache';
import { getDb } from '@/db/client';
import { auditLog, users } from '@/db/schema';
import { requireUser } from '@/lib/session';
import { signOut } from '@/lib/auth';

/** Minimum length for any password on the platform. */
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 200;

export type ChangePasswordResult = { error: string } | { ok: true };

/**
 * Change the password for the signed-in user.
 *
 * `forced = true` requires the current password (used for first-login
 * rotations where the default is shared across all accounts). When the
 * change clears `must_change_password`, we sign the user out and redirect
 * to /login so the JWT is reissued with the fresh flag value — otherwise
 * the middleware would still see the stale `mustChangePassword=true` and
 * keep bouncing them.
 *
 * `forced = false` is the voluntary path: the session itself proves
 * identity, so we don't ask for the current one. Just hash the new
 * password, save it, and reload.
 *
 * Returns `{ error }` for validation failures the client should display.
 * On success, this calls `redirect()` (which throws `NEXT_REDIRECT`) and
 * the caller never sees a return value. We do NOT use `useFormState` for
 * this form because mixing `redirect()` with the reducer shape of
 * `useFormState` leaves `state === undefined` on the client and crashes
 * the form render.
 */
export async function changePasswordAction(
  formData: FormData,
): Promise<ChangePasswordResult> {
  const user = await requireUser();
  const forced = String(formData.get('forced') ?? '') === 'true';

  const currentPwd = String(formData.get('current') ?? '');
  const newPwd = String(formData.get('new') ?? '');
  const confirmPwd = String(formData.get('confirm') ?? '');

  if (forced && !currentPwd) {
    return { error: 'Introduce tu contraseña actual.' };
  }
  if (newPwd.length < MIN_PASSWORD) {
    return { error: `La nueva contraseña debe tener al menos ${MIN_PASSWORD} caracteres.` };
  }
  if (newPwd.length > MAX_PASSWORD) {
    return { error: 'La nueva contraseña es demasiado larga.' };
  }
  if (newPwd !== confirmPwd) {
    return { error: 'La nueva contraseña y la confirmación no coinciden.' };
  }
  if (currentPwd && currentPwd === newPwd) {
    return { error: 'La nueva contraseña debe ser distinta de la actual.' };
  }

  const db = getDb();
  const [row] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  if (!row) return { error: 'Tu cuenta ya no existe.' };

  if (forced || currentPwd) {
    if (!row.passwordHash) return { error: 'La cuenta no tiene contraseña configurada.' };
    if (!(await bcrypt.compare(currentPwd, row.passwordHash))) {
      return { error: 'La contraseña actual no es correcta.' };
    }
  }

  const passwordHash = await bcrypt.hash(newPwd, 10);
  // Always clear the flag when the password changes, regardless of mode.
  // Voluntary callers won't see the difference (flag was already false),
  // but it covers the case where an admin resets a password later.
  await db.update(users)
    .set({ passwordHash, mustChangePassword: false, updatedAt: new Date() })
    .where(eq(users.id, user.id));

  await db.insert(auditLog).values({
    actorId: user.id,
    action: forced ? 'user.password.change.forced' : 'user.password.change',
    targetType: 'user',
    targetId: user.id,
    metadata: null,
  });

  revalidatePath('/', 'layout');

  // Force a fresh sign-in. The JWT still carries mustChangePassword=true
  // from before, so without this the middleware would keep redirecting.
  // Call signOut with `redirect: false` to clear the cookie without
  // emitting a NEXT_REDIRECT of its own, then emit our redirect to the
  // post-change login screen. If signOut's behaviour ever changes to
  // throw on its own, the redirect below still wins because redirect()
  // throws and Next.js handles it.
  try { await signOut({ redirect: false }); } catch {}
  redirect('/login?reason=password-changed');
}