/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: true,
  },
  transpilePackages: ['@etiquetador/db', '@etiquetador/shared', '@etiquetador/ui'],
};

export default nextConfig;
