/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  experimental: {
    optimizePackageImports: ['@mantine/core', '@mantine/hooks'],
  },
  webpack: (config) => {
    // supabase-js referencia 'iceberg-js' (buckets analíticos, opcional).
    // No lo usamos: módulo vacío para que webpack no falle.
    config.resolve.alias['iceberg-js'] = false;
    return config;
  },
};

module.exports = nextConfig;
