/**
 * Auth.js v5 (NextAuth) configuration.
 *
 * Credentials provider with bcrypt-hashed passwords stored on `users.password_hash`.
 * Session strategy: JWT (stored in an httpOnly cookie).
 *
 * This is the SHARED config: it is safe to import from edge code (middleware),
 * so it must NOT pull in better-sqlite3. The actual `authorize` implementation
 * (which needs the DB) lives in `auth.ts`.
 */
import type { NextAuthConfig } from 'next-auth';

export const authConfig = {
  pages: {
    signIn: '/login',
  },
  session: { strategy: 'jwt' },
  callbacks: {
    /**
     * Edge-safe gate used by middleware. We only allow-list public paths and
     * redirect everything else to /login. The real user lookup happens later
     * in the node-only `auth.ts` adapter.
     */
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const publicPaths = ['/login', '/signup', '/api/auth'];
      const isPublic = publicPaths.some(
        (p) => nextUrl.pathname === p || nextUrl.pathname.startsWith(`${p}/`),
      );
      if (isPublic) return true;
      return isLoggedIn;
    },
    async jwt({ token, user }) {
      // First sign-in: copy minimal fields onto the JWT.
      if (user) {
        token.id = (user as { id?: string }).id ?? token.sub;
        token.isSuperAdmin = (user as { isSuperAdmin?: boolean }).isSuperAdmin ?? false;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        (session.user as { id?: string }).id = (token.id as string) ?? token.sub;
        (session.user as { isSuperAdmin?: boolean }).isSuperAdmin =
          (token.isSuperAdmin as boolean) ?? false;
      }
      return session;
    },
  },
  providers: [], // populated in auth.ts (Node-only)
} satisfies NextAuthConfig;
