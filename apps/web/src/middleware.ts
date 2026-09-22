/**
 * Edge middleware: rejects anonymous requests before they reach a page.
 *
 * Role checks are NOT done here — they need the active project and the
 * database, so they happen in the app layout (see `lib/session.ts`).
 */
import NextAuth from 'next-auth';
import { authConfig } from '@/lib/auth.config';

export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|gif|ico|css|js)$).*)',
  ],
};
