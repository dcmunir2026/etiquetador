'use server';

import { AuthError } from 'next-auth';
import { signIn, signOut } from '@/lib/auth';

export type LoginState = { error: string | null };

/**
 * Sign in with email and password.
 *
 * Credential failures are reported with one generic message on purpose:
 * distinguishing "unknown email" from "wrong password" tells an attacker
 * which accounts exist.
 */
export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (!email || !password) return { error: 'Introduce tu email y tu contraseña.' };

  try {
    // `redirectTo` makes Auth.js throw a redirect on success, which Next
    // turns into the actual navigation.
    await signIn('credentials', { email, password, redirectTo: '/' });
    return { error: null };
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: 'Email o contraseña incorrectos.' };
    }
    throw err; // redirects land here; rethrow so Next can handle them
  }
}

export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: '/login' });
}
