/**
 * Edge middleware. Uses the edge-safe `authConfig` to gate routes.
 * The DB-touching authorize() runs in Node (see lib/auth.ts) — middleware
 * just checks the JWT cookie and the public-path allow-list.
 */
import NextAuth from 'next-auth';
import { authConfig } from '@/lib/auth.config';

export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  // Skip Next internals and static files. Everything else is gated.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|gif|ico|css|js)$).*)'],
};
