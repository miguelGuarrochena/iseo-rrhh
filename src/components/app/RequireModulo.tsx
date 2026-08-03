'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { IconLayoutGrid } from '@tabler/icons-react';
import { useModulos } from '@/lib/auth/useModulos';
import {
  moduloActivo,
  MODULOS_OPCIONALES,
  ModuloOpcional,
} from '@/components/app/navItems';

/**
 * Bloquea una sección que la empresa tiene apagada.
 *
 * Esconderla del menú no alcanza: la ruta sigue existiendo y se llega
 * escribiendo la URL, desde un link viejo o desde una notificación
 * anterior al cambio. Sin esto, "apagar" es sólo una sugerencia visual.
 *
 * Mientras la config no llegó (`undefined`) se muestra el contenido: es
 * preferible mostrar de más un instante a hacer parpadear un cartel de
 * "sección no disponible" en cada carga.
 */
export const RequireModulo = ({
  modulo,
  children,
}: {
  modulo: ModuloOpcional;
  children: ReactNode;
}) => {
  const modulos = useModulos();

  if (modulos === undefined || moduloActivo(modulo, modulos)) {
    return <>{children}</>;
  }

  const info = MODULOS_OPCIONALES.find((m) => m.clave === modulo);

  return (
    <div className="flex flex-col items-start gap-3 rounded-2xl border border-line bg-surface px-5 py-6">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-paper text-ink-soft">
        <IconLayoutGrid size={20} />
      </span>
      <div>
        <h1 className="text-lg font-bold text-ink">
          {info?.etiqueta ?? 'Esta sección'} no está habilitada
        </h1>
        <p className="mt-1 max-w-md text-sm leading-relaxed text-ink-soft">
          Tu empresa no tiene activa esta sección. No se perdió nada: si se
          vuelve a habilitar, la información sigue estando.
        </p>
      </div>
      <Link
        href="/"
        className="presionable rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink no-underline hover:border-brand-300"
      >
        Volver al inicio
      </Link>
    </div>
  );
};
