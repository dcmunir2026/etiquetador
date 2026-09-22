import 'next-auth';
import 'next-auth/jwt';

// The project role is deliberately NOT on the JWT: it depends on which
// project is active, so it is resolved per request in `session.ts`.
declare module 'next-auth' {
  interface User {
    id?: string;
    isSuperAdmin?: boolean;
  }
  interface Session {
    user: {
      id: string;
      email?: string | null;
      name?: string | null;
      image?: string | null;
      isSuperAdmin: boolean;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string;
    isSuperAdmin?: boolean;
  }
}
