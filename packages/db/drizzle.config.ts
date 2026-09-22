import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/index.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://etiquetador:etiquetador_dev@localhost:5433/etiquetador',
  },
  verbose: true,
  strict: true,
});
