'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { IconBuildingFactory2 } from '@tabler/icons-react';
import { useAuth } from '@/lib/auth/AuthProvider';

/**
 * Bloquea las secciones que trabajan sobre una empresa concreta cuando
 * no hay ninguna activa.
 *
 * El dueño de ISEO no pertenece a ninguna empresa: su `empresaId` es
 * null hasta que entra a un cliente. Sin esto, abrir una de estas
 * pantallas dispara las consultas igual, `empresaId()` lanza "Sin empresa
 * activa" y quedan errores sueltos en la consola con la pantalla vacía.
 *
 * Es preferible frenar antes de pedir datos que pedirlos sabiendo que van
 * a fallar.
 */
export const RequireEmpresa = ({ children }: { children: ReactNode }) => {
  const { usuario, empresaVista } = useAuth();

  // Todavía no sabemos quién es: que decida el guard de sesión.
  if (!usuario) return <>{children}</>;

  const hayEmpresa = Boolean(empresaVista?.id ?? usuario.empresaId);
  if (hayEmpresa) return <>{children}</>;

  return (
    <div className="flex flex-col items-start gap-3 rounded-2xl border border-line bg-surface px-5 py-6">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-paper text-ink-soft">
        <IconBuildingFactory2 size={20} />
      </span>
      <div>
        <h1 className="text-lg font-bold text-ink">Elegí una empresa</h1>
        <p className="mt-1 max-w-md text-sm leading-relaxed text-ink-soft">
          Esta sección trabaja sobre los datos de una empresa en particular.
          Entrá a la que quieras administrar y volvé.
        </p>
      </div>
      <Link
        href="/empresas"
        className="presionable rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink no-underline hover:border-brand-300"
      >
        Ver empresas
      </Link>
    </div>
  );
};
