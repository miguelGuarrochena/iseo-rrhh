'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import {
  IconAlertTriangle,
  IconBuildingFactory2,
  IconRefresh,
} from '@tabler/icons-react';
import { Boton } from '@/components/app/ui/Boton';
import { ErrorInterpretado } from '@/lib/errores';
import { Carga } from '@/lib/useCarga';

/** Fila fantasma mientras carga. */
const Esqueleto = () => (
  <div className="flex animate-pulse items-center gap-3.5 rounded-2xl border border-line bg-surface px-4 py-3.5">
    <span className="h-9 w-9 flex-shrink-0 rounded-full bg-paper" />
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <span className="h-3.5 w-2/5 rounded-full bg-paper" />
      <span className="h-3 w-3/5 rounded-full bg-paper/70" />
    </div>
  </div>
);

/**
 * Bloque de error con la explicación y, sólo cuando sirve, el botón de
 * reintentar. Ofrecer "reintentar" ante un "elegí una empresa" hace que
 * la persona lo apriete tres veces y concluya que la app está rota.
 */
export const BloqueError = ({
  error,
  onReintentar,
}: {
  error: ErrorInterpretado;
  onReintentar?: () => void;
}) => (
  <div className="flex flex-col items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
    <p className="flex items-center gap-2 text-sm font-bold text-amber-900">
      <IconAlertTriangle size={18} />
      {error.titulo}
    </p>
    <p className="max-w-md text-xs leading-relaxed text-amber-900/90">
      {error.detalle}
    </p>
    {error.reintentable && onReintentar && (
      <Boton variante="secundario" tamano="sm" onClick={onReintentar}>
        <IconRefresh size={14} />
        Reintentar
      </Boton>
    )}
    {/* "Elegí una empresa" sin nada más era un cartel sin salida: en una
        tablet, donde no está el menú lateral, no había forma de llegar a
        la lista de clientes. El aviso que dice qué falta tiene que llevar
        al lugar donde se arregla. */}
    {error.tipo === 'empresa' && (
      <Link
        href="/empresas"
        className="presionable inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-surface px-3 py-1.5 text-xs font-bold text-amber-900 no-underline"
      >
        <IconBuildingFactory2 size={14} />
        Ver empresas
      </Link>
    )}
  </div>
);

interface EstadoCargaProps<T> {
  carga: Carga<T>;
  /** Qué mostrar cuando la consulta salió bien pero no trajo nada. */
  vacio?: ReactNode;
  /** Cómo saber si "no trajo nada". Por defecto, lista vacía. */
  estaVacio?: (datos: T) => boolean;
  /** Cuántas filas fantasma mostrar mientras carga. */
  filas?: number;
  children: (datos: T) => ReactNode;
}

const vacioPorDefecto = (datos: unknown): boolean =>
  Array.isArray(datos) ? datos.length === 0 : datos == null;

/**
 * Separa los cuatro estados que una pantalla puede tener y que hasta
 * ahora se veían casi todos igual: cargando, falló, no hay nada, y hay
 * datos. Que "no cargó" y "no hay nada" se vean distinto es la diferencia
 * entre que alguien reintente o que asuma que el mes está vacío.
 */
export const EstadoCarga = <T,>({
  carga,
  vacio,
  estaVacio,
  filas = 3,
  children,
}: EstadoCargaProps<T>) => {
  if (carga.fase === 'cargando') {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: filas }).map((_, i) => (
          <Esqueleto key={i} />
        ))}
      </div>
    );
  }

  if (carga.fase === 'error' && carga.error) {
    return <BloqueError error={carga.error} onReintentar={carga.recargar} />;
  }

  if (carga.datos === undefined) return null;

  const sinDatos = (estaVacio ?? vacioPorDefecto)(carga.datos);
  if (sinDatos && vacio !== undefined) {
    return <div className="text-sm text-ink-soft">{vacio}</div>;
  }

  return <>{children(carga.datos)}</>;
};
