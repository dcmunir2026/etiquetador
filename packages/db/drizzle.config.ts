import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/index.ts',
  out: './migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'file:./etiquetador.db',
  },
  verbose: true,
  strict: true,
});
