'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { IconSparkles } from '@tabler/icons-react';
import { useServicios } from '@/lib/auth/useModulos';
import {
  servicioActivo,
  SERVICIOS_OPCIONALES,
  ServicioOpcional,
} from '@/components/app/navItems';

/**
 * Bloquea una sección que depende de un servicio contratado.
 *
 * Esconderla del menú no alcanza: la ruta existe igual y se llega
 * escribiendo la URL o desde un link viejo. Es el mismo razonamiento que
 * `RequireModulo`, con una diferencia importante en el default.
 *
 * Mientras la config no llegó (`undefined`) acá se BLOQUEA, al revés que
 * con los módulos. Con un módulo, mostrar de más un instante no cuesta
 * nada: la empresa igual lo tiene. Con un servicio sí: sería enseñarle
 * por un segundo algo que no contrató.
 *
 * Esto es una cortesía de la UI, no el control de acceso. Los datos que
 * la sección muestra están protegidos por RLS como todo el resto: una
 * empresa sin asesoría que llegue igual a la ruta no ve nada de otra
 * empresa, sólo lo suyo.
 */
export const RequireServicio = ({
  servicio,
  children,
}: {
  servicio: ServicioOpcional;
  children: ReactNode;
}) => {
  const servicios = useServicios();

  if (servicios !== undefined && servicioActivo(servicio, servicios)) {
    return <>{children}</>;
  }

  const info = SERVICIOS_OPCIONALES.find((s) => s.clave === servicio);

  if (servicios === undefined) {
    return <p className="text-sm text-ink-soft">Cargando…</p>;
  }

  return (
    <div className="flex flex-col items-start gap-3 rounded-2xl border border-line bg-surface px-5 py-6">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-paper text-ink-soft">
        <IconSparkles size={20} />
      </span>
      <div>
        <h1 className="text-lg font-bold text-ink">
          {info?.etiqueta ?? 'Este servicio'} no está habilitado
        </h1>
        <p className="mt-1 max-w-md text-sm leading-relaxed text-ink-soft">
          {info?.descripcion ??
            'Esta sección forma parte de un servicio que se contrata aparte.'}{' '}
          Si te interesa, hablalo con ISEO.
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
