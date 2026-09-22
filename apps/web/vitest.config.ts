import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  // Sidebar.tsx is imported by the routing test, so JSX must compile.
  esbuild: { jsx: 'automatic' },
  resolve: {
    // Mirrors the `@/*` alias in tsconfig.json so tests import like the app does.
    alias: { '@': resolve(__dirname, 'src') },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
});
