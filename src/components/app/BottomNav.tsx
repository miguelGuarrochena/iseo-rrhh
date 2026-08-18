'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Drawer } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconLogout2, IconMenu2 } from '@tabler/icons-react';
import { navItemsPorRol, tabsDeBarra } from './navItems';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useModulos } from '@/lib/auth/useModulos';
import { PendientesResumen } from '@/types/rrhh';
import { usePendientes } from '@/lib/pendientes';

const MAX_TABS = 5;

const Badge = ({ n }: { n: number }) =>
  n > 0 ? (
    <span className="absolute -right-1.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[0.6rem] font-bold text-white">
      {n > 9 ? '9+' : n}
    </span>
  ) : null;

/**
 * Barra de navegación inferior (mobile). Si el rol tiene más secciones
 * que tabs, la última es "Más" y abre el resto en un panel.
 */
export const BottomNav = () => {
  const { usuario, rolEfectivo, empresaVista, salirDeEmpresa } = useAuth();
  const modulos = useModulos();
  const pathname = usePathname();
  const router = useRouter();
  const [masAbierto, { open: abrirMas, close: cerrarMas }] =
    useDisclosure(false);
  const pendientes = usePendientes(Boolean(usuario), usuario?.id);

  if (!usuario || !rolEfectivo) return null;

  const badgeDe = (key?: keyof PendientesResumen) => {
    if (!key || !pendientes || key === 'total') return 0;
    return pendientes[key] ?? 0;
  };

  const items = navItemsPorRol(rolEfectivo, modulos);

  /**
   * El dueño de ISEO adentro de un cliente navega con el menú de esa
   * empresa —su rol efectivo es el de admin— y por eso "Empresas" no
   * está en la barra. Sin esta salida, en un celular o una tablet no
   * había forma de volver a la lista de clientes: el menú lateral, que
   * es donde vivía, no se muestra abajo de `lg`.
   */
  const enEmpresa = usuario.rol === 'superadmin' && empresaVista !== null;
  const salir = () => {
    cerrarMas();
    salirDeEmpresa();
    router.push('/empresas');
  };

  const { tabs, resto, conMas } = tabsDeBarra(items, MAX_TABS, enEmpresa);
  const badgeMas = resto.reduce((acc, i) => acc + badgeDe(i.badgeKey), 0);

  const ruta = pathname.replace(/^\/app(?=\/|$)/, '') || '/';
  const esActivo = (href: string) =>
    href === '/' ? ruta === '/' : ruta.startsWith(href);
  const restoActivo = resto.some((i) => esActivo(i.href));

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line-strong bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
        <div className="mx-auto flex max-w-md items-stretch justify-around">
          {tabs.map((item) => {
            const activo = esActivo(item.href);
            const Icono = item.icono;
            const n = badgeDe(item.badgeKey);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative flex min-w-0 flex-1 flex-col items-center gap-1 px-1 pb-2 pt-2 text-[0.6875rem] font-semibold no-underline transition-colors ${
                  activo ? 'text-brand-700' : 'text-ink-soft'
                }`}
              >
                <span
                  className={`relative flex h-8 w-12 items-center justify-center rounded-full transition-colors ${
                    activo ? 'bg-brand-100' : 'bg-transparent'
                  }`}
                >
                  <Icono size={21} stroke={activo ? 2.1 : 1.6} />
                  <Badge n={n} />
                </span>
                <span className="w-full truncate text-center">
                  {item.etiqueta}
                </span>
              </Link>
            );
          })}
          {conMas && (
            <button
              onClick={abrirMas}
              className={`relative flex min-w-0 flex-1 cursor-pointer flex-col items-center gap-1 border-0 bg-transparent px-1 pb-2 pt-2 text-[0.6875rem] font-semibold transition-colors ${
                restoActivo ? 'text-brand-700' : 'text-ink-soft'
              }`}
            >
              <span
                className={`relative flex h-8 w-12 items-center justify-center rounded-full transition-colors ${
                  restoActivo ? 'bg-brand-100' : 'bg-transparent'
                }`}
              >
                <IconMenu2 size={21} stroke={restoActivo ? 2.1 : 1.6} />
                <Badge n={badgeMas} />
              </span>
              <span className="w-full truncate text-center">Más</span>
            </button>
          )}
        </div>
      </nav>

      <Drawer
        opened={masAbierto}
        onClose={cerrarMas}
        position="bottom"
        title={enEmpresa ? empresaVista.nombre : 'Más secciones'}
        overlayProps={{ backgroundOpacity: 0.35, blur: 2 }}
        styles={{
          title: { fontWeight: 800 },
          content: { height: 'auto', borderRadius: '24px 24px 0 0' },
        }}
      >
        <div className="flex flex-col gap-1 pb-[env(safe-area-inset-bottom)]">
          {resto.map((item) => {
            const activo = esActivo(item.href);
            const Icono = item.icono;
            const n = badgeDe(item.badgeKey);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={cerrarMas}
                className={`relative flex min-h-12 items-center gap-3 rounded-xl border px-3.5 py-3 text-[0.95rem] font-semibold no-underline transition-colors ${
                  activo
                    ? 'border-brand-300 bg-brand-100 text-brand-800'
                    : 'border-transparent text-ink-soft hover:bg-paper hover:text-ink'
                }`}
              >
                <span className="relative">
                  <Icono size={20} stroke={1.8} />
                  <Badge n={n} />
                </span>
                {item.etiqueta}
              </Link>
            );
          })}

          {enEmpresa && (
            <button
              onClick={salir}
              className="mt-2 flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-line-strong bg-surface px-3.5 py-3 text-[0.95rem] font-semibold text-ink transition-colors hover:border-brand-400"
            >
              <IconLogout2 size={20} stroke={1.8} />
              Salir de la empresa
            </button>
          )}
        </div>
      </Drawer>
    </>
  );
};
