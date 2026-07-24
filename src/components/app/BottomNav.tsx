'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Drawer } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconMenu2 } from '@tabler/icons-react';
import { navItemsPorRol } from './navItems';
import { useAuth } from '@/lib/auth/AuthProvider';
import { getPendientesResumen } from '@/lib/services/rrhh';
import { PendientesResumen } from '@/types/rrhh';

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
  const { usuario, rolEfectivo } = useAuth();
  const pathname = usePathname();
  const [masAbierto, { open: abrirMas, close: cerrarMas }] =
    useDisclosure(false);
  const [pendientes, setPendientes] = useState<PendientesResumen | null>(null);

  useEffect(() => {
    if (!usuario) return;
    void getPendientesResumen()
      .then(setPendientes)
      .catch(() => undefined);
    const id = window.setInterval(() => {
      void getPendientesResumen()
        .then(setPendientes)
        .catch(() => undefined);
    }, 60_000);
    return () => window.clearInterval(id);
  }, [usuario]);

  if (!usuario || !rolEfectivo) return null;

  const badgeDe = (key?: keyof PendientesResumen) => {
    if (!key || !pendientes || key === 'total') return 0;
    return pendientes[key] ?? 0;
  };

  const items = navItemsPorRol(rolEfectivo);
  const conMas = items.length > MAX_TABS;
  const tabs = conMas ? items.slice(0, MAX_TABS - 1) : items;
  const resto = conMas ? items.slice(MAX_TABS - 1) : [];
  const badgeMas = resto.reduce((acc, i) => acc + badgeDe(i.badgeKey), 0);

  const ruta = pathname.replace(/^\/app(?=\/|$)/, '') || '/';
  const esActivo = (href: string) =>
    href === '/' ? ruta === '/' : ruta.startsWith(href);
  const restoActivo = resto.some((i) => esActivo(i.href));

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
        <div className="mx-auto flex max-w-md items-stretch justify-around">
          {tabs.map((item) => {
            const activo = esActivo(item.href);
            const Icono = item.icono;
            const n = badgeDe(item.badgeKey);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 pb-2 pt-2.5 text-[0.65rem] font-semibold no-underline transition-colors ${
                  activo ? 'text-brand-600' : 'text-ink-soft'
                }`}
              >
                <span className="relative">
                  <Icono size={22} stroke={activo ? 2 : 1.6} />
                  <Badge n={n} />
                </span>
                <span className="truncate">{item.etiqueta}</span>
              </Link>
            );
          })}
          {conMas && (
            <button
              onClick={abrirMas}
              className={`relative flex min-w-0 flex-1 cursor-pointer flex-col items-center gap-0.5 border-0 bg-transparent px-1 pb-2 pt-2.5 text-[0.65rem] font-semibold transition-colors ${
                restoActivo ? 'text-brand-600' : 'text-ink-soft'
              }`}
            >
              <span className="relative">
                <IconMenu2 size={22} stroke={restoActivo ? 2 : 1.6} />
                <Badge n={badgeMas} />
              </span>
              <span className="truncate">Más</span>
            </button>
          )}
        </div>
      </nav>

      <Drawer
        opened={masAbierto}
        onClose={cerrarMas}
        position="bottom"
        title="Más secciones"
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
                className={`relative flex items-center gap-3 rounded-xl border px-3.5 py-3 text-[0.95rem] font-semibold no-underline transition-colors ${
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
        </div>
      </Drawer>
    </>
  );
};
