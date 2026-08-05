/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  experimental: {
    optimizePackageImports: ['@mantine/core', '@mantine/hooks'],
  },
  async headers() {
    // Headers de seguridad para todas las rutas. CSP relativamente laxa en
    // script/style (Mantine/Next inyectan estilos inline), pero restringe
    // orígenes: nada de frames externos, nada de contenido embebido de
    // terceros, conexión solo a Supabase/Vercel Analytics/Gemini.
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://generativelanguage.googleapis.com https://vitals.vercel-insights.com",
      // pdf.js corre su parser en un Web Worker propio (/pdf.worker.min.mjs)
      // y en algunos navegadores lo instancia desde un blob. Sin esto, la
      // lectura de recibos muere con un error de CSP difícil de diagnosticar.
      "worker-src 'self' blob:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ');

    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(self), geolocation=(self), microphone=()',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          { key: 'Content-Security-Policy', value: csp },
        ],
      },
      {
        // Los pesos del reconocimiento facial son ~6,8 MB y no cambian
        // salvo que se actualice face-api. Sin cache larga, la tablet de
        // planta se los vuelve a bajar en cada arranque.
        source: '/models/:archivo*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
  webpack: (config) => {
    // supabase-js referencia 'iceberg-js' (buckets analíticos, opcional).
    // No lo usamos: módulo vacío para que webpack no falle.
    config.resolve.alias['iceberg-js'] = false;
    // pdfjs-dist trae un camino para Node que dibuja con 'canvas' y otro
    // con '@napi-rs/canvas'. En el navegador no se usa ninguno —solo
    // extraemos texto— pero webpack igual intenta resolverlos y rompe el
    // build con "Module not found". Se anulan los dos.
    config.resolve.alias['canvas'] = false;
    config.resolve.alias['@napi-rs/canvas'] = false;
    config.ignoreWarnings = [
      ...(config.ignoreWarnings || []),
      {
        module: /@vladmandic\/face-api/,
        message: /require function is used/,
      },
    ];
    return config;
  },
};

module.exports = nextConfig;
