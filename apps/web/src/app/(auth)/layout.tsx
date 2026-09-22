import type { ReactNode } from 'react';

/** Bare layout for the auth screens — deliberately without the app shell. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return <main className="auth-main">{children}</main>;
}
