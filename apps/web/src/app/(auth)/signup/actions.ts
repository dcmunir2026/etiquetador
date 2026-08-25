'use server';

import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { getDb } from '@/db/client';
import { users } from '@/db/schema';

export async function signupAction(formData: FormData) {
  const name = String(formData.get('name') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');

  if (!name || !email || !password) {
    return { error: 'Todos los campos son obligatorios.' };
  }
  if (password.length < 8) {
    return { error: 'La contraseña debe tener al menos 8 caracteres.' };
  }
  // Loose email shape check; full RFC 5322 not required for the prototype.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: 'Email no válido.' };
  }

  const db = getDb();
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing[0]) {
    return { error: 'Ya existe una cuenta con ese email.' };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const palette = [
    'linear-gradient(135deg,#0e4a52,#1d6e75)',
    'linear-gradient(135deg,#5b8fb8,#3d6e8f)',
    'linear-gradient(135deg,#8b6db5,#5b4a78)',
    'linear-gradient(135deg,#d97757,#a85a35)',
  ];
  const avatarColor = palette[Math.floor(Math.random() * palette.length)];

  await db.insert(users).values({
    email,
    name,
    passwordHash,
    avatarColor,
    isSuperAdmin: false,
  });

  // For the prototype we auto-sign-in via redirect to /login.
  // TODO: when invite flow lands, sign the user in directly.
  redirect('/login?callbackUrl=/');
}
