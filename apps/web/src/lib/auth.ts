/**
 * Node-side Auth.js entry. Imports the DB and wires the Credentials provider.
 *
 * Edge code (middleware) must NOT import this file; it should import
 * `auth.config.ts` directly and use `NextAuth(authConfig).auth`.
 */
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { users } from '@/db/schema';
import { authConfig } from '@/lib/auth.config';

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(creds) {
        const email = String(creds?.email ?? '').trim().toLowerCase();
        const password = String(creds?.password ?? '');
        if (!email || !password) return null;

        const db = getDb();
        const rows = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);
        const u = rows[0];
        if (!u || !u.passwordHash) return null;

        const ok = await bcrypt.compare(password, u.passwordHash);
        if (!ok) return null;

        return {
          id: u.id,
          email: u.email,
          name: u.name ?? u.email,
          isSuperAdmin: u.isSuperAdmin,
        };
      },
    }),
  ],
});
