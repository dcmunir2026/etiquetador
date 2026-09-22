/**
 * Auth.js v5 configuration shared between Node and Edge.
 *
 * Must stay free of `better-sqlite3`: the middleware imports this file and
 * runs on the Edge runtime. The Credentials provider, which needs the DB,
 * is added in `auth.ts`.
 */
import type { NextAuthConfig } from 'next-auth';

/** Paths reachable without a session. */
const PUBLIC_PATHS = ['/login', '/api/auth'];

export const authConfig = {
  pages: { signIn: '/login' },
  session: { strategy: 'jwt' },
  callbacks: {
    /** Edge gate: allow the public paths, require a session for the rest. */
    authorized({ auth, request: { nextUrl } }) {
      const isPublic = PUBLIC_PATHS.some(
        (p) => nextUrl.pathname === p || nextUrl.pathname.startsWith(`${p}/`),
      );
      if (isPublic) return true;
      return !!auth?.user;
    },
    async jwt({ token, user }) {
      // Only set on first sign-in; afterwards the token already carries it.
      if (user) {
        token.id = (user as { id?: string }).id ?? token.sub;
        token.isSuperAdmin = (user as { isSuperAdmin?: boolean }).isSuperAdmin ?? false;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = (token.id as string) ?? token.sub ?? '';
        session.user.isSuperAdmin = (token.isSuperAdmin as boolean) ?? false;
      }
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
