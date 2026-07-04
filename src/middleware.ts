import { NextRequest, NextResponse } from 'next/server';

/**
 * Separación landing / plataforma por dominio.
 *
 * - iseo-rh.com (y www)  → sitio de marketing. Si alguien entra a una ruta
 *   de la app (por un link viejo), lo mandamos al subdominio.
 * - app.iseo-rh.com      → la plataforma. La raíz lleva directo al login/app.
 * - localhost / *.vercel.app → sin separación: todo funciona junto, como en dev.
 *
 * No agrega seguridad (el login siempre es público): las rutas privadas
 * las protege RequireAuth + las reglas de Supabase. Esto es sólo prolijidad
 * de producto: cada cosa vive en su dominio.
 */

const HOST_APP = 'app.iseo-rh.com';
const HOSTS_RAIZ = ['iseo-rh.com', 'www.iseo-rh.com'];

/** Rutas que pertenecen a la plataforma (deben vivir en el subdominio). */
const RUTAS_APP = [
  '/app',
  '/login',
  '/demo',
  '/recuperar-contrasena',
  '/crear-contrasena',
];

const esRutaApp = (path: string): boolean =>
  RUTAS_APP.some((base) => path === base || path.startsWith(`${base}/`));

export function middleware(req: NextRequest) {
  const host = (req.headers.get('host') ?? '').split(':')[0].toLowerCase();
  const { pathname, search } = req.nextUrl;

  // Subdominio de la app: su raíz lleva a la plataforma (que exige login).
  if (host === HOST_APP) {
    if (pathname === '/') {
      return NextResponse.redirect(new URL('/app', req.url));
    }
    return NextResponse.next();
  }

  // Dominio raíz (marketing): las rutas de la app se mudan al subdominio.
  if (HOSTS_RAIZ.includes(host)) {
    if (esRutaApp(pathname)) {
      return NextResponse.redirect(`https://${HOST_APP}${pathname}${search}`);
    }
    return NextResponse.next();
  }

  // Local, previews de Vercel, etc.: sin separación.
  return NextResponse.next();
}

export const config = {
  // Corre en páginas, no en assets ni API.
  matcher: ['/((?!_next/|api/|.*\\..*).*)'],
};
