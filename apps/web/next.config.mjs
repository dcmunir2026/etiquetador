/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: true,
    // better-sqlite3 has a native .node binding that webpack can't bundle.
    serverComponentsExternalPackages: ['better-sqlite3', 'drizzle-orm'],
  },
  transpilePackages: ['@etiquetador/shared', '@etiquetador/ui'],
};

export default nextConfig;
