import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(here, 'src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    // DB-touching tests (RBAC, audit log) are integration-only; we mark
    // them with `.integration.test.ts` and skip by default.
    exclude: ['**/*.integration.test.ts', 'node_modules', '.next'],
  },
});
