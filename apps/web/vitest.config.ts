import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export default defineConfig({
  // Sidebar.tsx is imported by the routing test, so JSX must compile.
  esbuild: { jsx: 'automatic' },
  resolve: {
    // Mirrors the `@/*` alias in tsconfig.json so tests import like the app does.
    //
    // `next/server` needs the explicit `.js`: next-auth's ESM build imports
    // it without the extension, which Node's ESM resolver rejects (and so
    // did vitest's). Without this alias the routing test could not even be
    // collected, and with it the guard over the sidebar's routes was dead.
    alias: {
      '@': resolve(__dirname, 'src'),
      'next/server': require.resolve('next/server.js'),
    },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node',
    server: {
      deps: {
        // next-auth's ESM build imports `next/server` without the `.js`
        // extension, which Node's ESM resolver rejects. Inlining it lets
        // the alias above apply and the routing test can be collected.
        inline: ['next-auth'],
      },
    },
  },
});
