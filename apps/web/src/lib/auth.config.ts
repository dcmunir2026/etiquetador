/**
 * Auth.js v5 configuration shared between Node and Edge.
 *
 * Must stay free of DB drivers: the middleware imports this file and
 * runs on the Edge runtime. The Credentials provider, which needs the DB,
 * is added in `auth.ts`.
 */
import type { NextAuthConfig } from 'next-auth';

/** Paths reachable without a session. */
const PUBLIC_PATHS = ['/login', '/invite', '/api/auth'];

/** The change-password screen stays reachable while the session is
 *  forced to redirect there; the `authorized` callback below redirects
 *  any other URL back to it. */
const CHANGE_PASSWORD_PATH = '/cuenta/cambiar-password';
PUBLIC_PATHS.push(CHANGE_PASSWORD_PATH);

export const authConfig = {
  pages: { signIn: '/login' },
  session: { strategy: 'jwt' },
  callbacks: {
    /** Edge gate: allow the public paths, require a session for the rest. */
    authorized({ auth, request: { nextUrl } }) {
      const path = nextUrl.pathname;
      const isPublic = PUBLIC_PATHS.some(
        (p) => path === p || path.startsWith(`${p}/`),
      );
      if (isPublic) return true;
      if (!auth?.user) return false; // -> redirect to /login via pages.signIn

      // Force a password change before letting the user past the gate.
      // The change-password screen itself is in PUBLIC_PATHS, so the
      // loop above already let it through. Anything else gets bounced.
      const user = auth.user as { mustChangePassword?: boolean };
      if (user.mustChangePassword && path !== CHANGE_PASSWORD_PATH) {
        const url = nextUrl.clone();
        url.pathname = CHANGE_PASSWORD_PATH;
        return Response.redirect(url);
      }
      return true;
    },
    async jwt({ token, user }) {
      // Only set on first sign-in; afterwards the token already carries it.
      if (user) {
        token.id = (user as { id?: string }).id ?? token.sub;
        token.isSuperAdmin = (user as { isSuperAdmin?: boolean }).isSuperAdmin ?? false;
        token.mustChangePassword =
          (user as { mustChangePassword?: boolean }).mustChangePassword ?? false;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = (token.id as string) ?? token.sub ?? '';
        session.user.isSuperAdmin = (token.isSuperAdmin as boolean) ?? false;
        session.user.mustChangePassword = (token.mustChangePassword as boolean) ?? false;
      }
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
