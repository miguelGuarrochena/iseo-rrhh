/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  experimental: {
    optimizePackageImports: ['@mantine/core', '@mantine/hooks'],
  },
  async headers() {
    /*
     * En desarrollo se permite además el Supabase local (`supabase
     * start`, puerto 54321). Sin esto la app **no se puede correr contra
     * la base local**: el login falla con un error de CSP en la consola
     * y en pantalla se ve "Email o contraseña incorrectos", que manda a
     * buscar el problema al lado equivocado.
     *
     * Va sólo en desarrollo. En producción la lista queda igual que
     * siempre: si un build de producción necesitara hablar con
     * localhost, sería un error de configuración y conviene que falle.
     */
    const enDesarrollo = process.env.NODE_ENV !== 'production';
    const supabaseLocal = enDesarrollo
      ? ' http://localhost:54321 http://127.0.0.1:54321 ws://localhost:54321'
      : '';

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
      `connect-src 'self'${supabaseLocal} https://*.supabase.co wss://*.supabase.co https://generativelanguage.googleapis.com https://vitals.vercel-insights.com`,
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
        // Todo el módulo facial: el runtime WASM de MediaPipe, su modelo
        // de landmarks, los pesos de dlib y los binarios WASM de TF.js.
        // Son ~22 MB que no cambian salvo que se actualice una
        // dependencia, y la tablet de planta los usa todos los días. Sin
        // cache inmutable se los vuelve a bajar en cada arranque, que es
        // exactamente el momento en que hay una fila esperando.
        //
        // Los nombres de archivo están fijados por versión (`/1/` en la
        // URL del modelo de MediaPipe, `package-lock` para el resto), así
        // que `immutable` es seguro: una actualización cambia el
        // contenido de `public/facial` en el deploy, no la validez de lo
        // ya cacheado en una tablet vieja.
        source: '/facial/:ruta*',
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
