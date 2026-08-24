'use server';

import { AuthError } from 'next-auth';
import { signIn } from '@/lib/auth';

export async function loginAction(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const callbackUrl = String(formData.get('callbackUrl') ?? '/') || '/';
  if (!email || !password) {
    return { error: 'Email y contraseña son obligatorios.' };
  }
  try {
    await signIn('credentials', {
      email,
      password,
      redirectTo: callbackUrl,
    });
  } catch (e) {
    if (e instanceof AuthError) {
      if (e.type === 'CredentialsSignin') {
        return { error: 'Email o contraseña incorrectos.' };
      }
      return { error: 'No se pudo iniciar sesión.' };
    }
    // signIn throws a redirect — let Next.js handle it.
    throw e;
  }
  return null;
}
