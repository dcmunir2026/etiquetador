import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(here, 'src'),
      // The `server-only` package is a bundler guard from Vercel; it's a
      // no-op at runtime, so stub it for vitest so we can import modules
      // that contain it (e.g. lib/session.ts).
      'server-only': path.resolve(here, 'test-shims/server-only.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['**/*.integration.test.ts', 'node_modules', '.next'],
  },
});
