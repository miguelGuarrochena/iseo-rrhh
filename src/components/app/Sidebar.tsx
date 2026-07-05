'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { IconLogout2 } from '@tabler/icons-react';
import { Logo } from '@/components/Logo';
import { navItemsPorRol } from './navItems';
import { Boton } from './ui/Boton';
import { useAuth } from '@/lib/auth/AuthProvider';
import { getEmpresa } from '@/lib/services/rrhh';
import { Empresa } from '@/types/rrhh';

/** Marca de la empresa: su logo si lo cargaron, si no el nombre. */
const MarcaEmpresa = ({
  nombre,
  logoUrl,
}: {
  nombre: string;
  logoUrl?: string;
}) => (
  <div className="flex items-center rounded-2xl border border-line bg-paper/70 px-3.5 py-3">
    {logoUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt={nombre}
        className="max-h-9 w-auto max-w-full object-contain"
      />
    ) : (
      <p className="truncate text-sm font-bold text-ink">{nombre}</p>
    )}
  </div>
);

/**
 * Navegación lateral (desktop). En mobile se usa BottomNav.
 */
export const Sidebar = () => {
  const { usuario, rolEfectivo, empresaVista, salirDeEmpresa } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [empresa, setEmpresa] = useState<Empresa | null>(null);

  // La gente de la empresa ve su empresa en el menú: los hace sentir en casa.
  useEffect(() => {
    if (usuario && usuario.rol !== 'superadmin') {
      void getEmpresa().then(setEmpresa);
    }
  }, [usuario]);

  if (!usuario || !rolEfectivo) return null;

  const enEmpresa = usuario.rol === 'superadmin' && empresaVista;

  const salir = () => {
    salirDeEmpresa();
    router.push('/empresas');
  };

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-line bg-surface px-4 py-6 lg:flex">
      <Link href="/" className="px-2 no-underline">
        <Logo size="sm" />
      </Link>

      <nav className="mt-8 flex flex-1 flex-col gap-1 overflow-y-auto">
        {navItemsPorRol(rolEfectivo).map((item) => {
          // Normaliza por si el rewrite deja el path interno con /app.
          const ruta = pathname.replace(/^\/app(?=\/|$)/, '') || '/';
          const activo =
            item.href === '/' ? ruta === '/' : ruta.startsWith(item.href);
          const Icono = item.icono;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-[0.95rem] font-semibold no-underline transition-colors ${
                activo
                  ? 'border-brand-300 bg-brand-100 text-brand-800'
                  : 'border-transparent text-ink-soft hover:bg-paper hover:text-ink'
              }`}
            >
              <Icono size={20} stroke={1.8} />
              {item.etiqueta}
            </Link>
          );
        })}
      </nav>

      {enEmpresa ? (
        <div className="flex flex-col gap-3 border-t border-line pt-4">
          <MarcaEmpresa
            nombre={empresaVista.nombre}
            logoUrl={empresaVista.logoUrl}
          />
          <Boton
            variante="secundario"
            onClick={salir}
            className="w-full justify-start"
          >
            <IconLogout2 size={18} stroke={1.8} />
            Salir de la empresa
          </Boton>
        </div>
      ) : (
        empresa && (
          <div className="border-t border-line pt-4">
            <MarcaEmpresa nombre={empresa.nombre} logoUrl={empresa.logoUrl} />
          </div>
        )
      )}
    </aside>
  );
};
