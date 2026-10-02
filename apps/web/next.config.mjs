/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Standalone output produces a self-contained .next/standalone tree that
  // the production Dockerfile copies into the runner stage. See
  // Dockerfile.web for the post-build COPY steps (.next/static and public/
  // are NOT included in the standalone output and must be added separately).
  output: 'standalone',
  experimental: {
    typedRoutes: true,
    // drizzle-orm keeps its native bits out of the bundle so its optional
    // drivers (better-sqlite3, etc.) are not pulled in by webpack. The app
    // itself only uses postgres-js at runtime.
    serverComponentsExternalPackages: ['drizzle-orm'],
    // Force Next's standalone outputFileTracing to include these modules in
    // /app/node_modules so external scripts (e.g. apps/web/scripts/migrate-runner.cjs)
    // can `require()` them. Without this, `postgres` and `drizzle-orm/postgres-js/migrator`
    // are tree-traced only via the Next bundle, and a plain `node` invocation
    // outside the Next runtime throws MODULE_NOT_FOUND.
    outputFileTracingIncludes: {
      '/apps/web/scripts/migrate-runner.cjs': [
        './node_modules/postgres/**/*',
        './node_modules/drizzle-orm/**/*',
      ],
    },
  },
  transpilePackages: ['@etiquetador/shared', '@etiquetador/ui'],
};

export default nextConfig;
