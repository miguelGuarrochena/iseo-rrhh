import { NextRequest, NextResponse } from 'next/server';

/**
 * Separación landing / plataforma por dominio, con URLs limpias.
 *
 * - iseo-rh.com (y www)   → marketing. Los links viejos con /app o las rutas
 *   de auth se redirigen al subdominio (sin /app).
 * - app.iseo-rh.com       → la plataforma en la raíz: `/` es el tablero,
 *   `/colaboradores`, `/ausencias`, etc. Internamente se sirven desde la
 *   carpeta `/app` vía rewrite, pero la URL nunca muestra `/app`.
 * - localhost / *.vercel.app → sin separación (todo junto, como en dev).
 *   Para probar la app en local, usá `app.localhost:3000`.
 *
 * No agrega seguridad (el login siempre es público): las rutas privadas las
 * protege RequireAuth + las reglas de Supabase.
 */

const HOST_APP = 'app.iseo-rh.com';
const HOSTS_RAIZ = ['iseo-rh.com', 'www.iseo-rh.com'];

/** Páginas de auth que viven en la raíz (no se reescriben a /app). */
const RUTAS_AUTH = [
  '/login',
  '/demo',
  '/recuperar-contrasena',
  '/crear-contrasena',
];

const esAuth = (path: string): boolean =>
  RUTAS_AUTH.some((base) => path === base || path.startsWith(`${base}/`));

/** Dominio real de la request (detrás de proxy viene en x-forwarded-host). */
const dominioDe = (req: NextRequest): string =>
  (req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? '')
    .split(':')[0]
    .toLowerCase()
    .trim();

const esHostApp = (host: string): boolean => host.startsWith('app.');

export function middleware(req: NextRequest) {
  const host = dominioDe(req);
  const { pathname, search } = req.nextUrl;

  // ----- Subdominio de la app: URLs limpias, servidas desde /app -----
  if (esHostApp(host)) {
    // Alguien entró con /app en la URL: lo limpiamos.
    if (pathname === '/app' || pathname.startsWith('/app/')) {
      const limpio = pathname.replace(/^\/app/, '') || '/';
      return NextResponse.redirect(new URL(`${limpio}${search}`, req.url));
    }
    // Páginas de auth se sirven tal cual.
    if (esAuth(pathname)) return NextResponse.next();
    // Todo lo demás se reescribe internamente a /app/... (URL sin cambios).
    const url = req.nextUrl.clone();
    url.pathname = pathname === '/' ? '/app' : `/app${pathname}`;
    return NextResponse.rewrite(url);
  }

  // ----- Dominio raíz (marketing): la plataforma vive en el subdominio -----
  if (HOSTS_RAIZ.includes(host)) {
    const esDeLaApp =
      esAuth(pathname) || pathname === '/app' || pathname.startsWith('/app/');
    if (esDeLaApp) {
      const destino = pathname.replace(/^\/app/, '') || '/';
      return NextResponse.redirect(`https://${HOST_APP}${destino}${search}`);
    }
    return NextResponse.next();
  }

  // ----- Local / previews: sin separación -----
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/|api/|.*\\..*).*)'],
};
