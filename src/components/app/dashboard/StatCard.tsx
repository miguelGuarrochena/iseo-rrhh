import { ReactNode } from 'react';
import Link from 'next/link';
import { Icon } from '@tabler/icons-react';

interface StatCardProps {
  etiqueta: string;
  valor: ReactNode;
  detalle?: string;
  href?: string;
  icono?: Icon;
}

/**
 * Caja de indicador con el lenguaje visual de la landing:
 * pastilla blanca con borde, sombra suave y chip circular con gradiente.
 *
 * El ícono va en la misma línea que la etiqueta, no arriba de todo.
 * En el celular no: ahí las tarjetas van de a dos y al lado del ícono
 * le quedan ~92px a la etiqueta, donde "COLABORADORES" no entra. Como
 * la app aplica `overflow-wrap: break-word` a todo, la palabra se
 * partía al medio ("COLABORADO / RES"). Debajo de `sm` el ícono vuelve
 * arriba y la etiqueta usa el ancho completo de la tarjeta.
 * Apilado se comía 48px de alto por tarjeta y, en la grilla de dos
 * columnas del celular, empujaba el número —lo único que se viene a
 * mirar— abajo del pliegue. Al costado, además, las etiquetas de las
 * cuatro tarjetas quedan alineadas y la fila se lee de un vistazo.
 */
export const StatCard = ({
  etiqueta,
  valor,
  detalle,
  href,
  icono: Icono,
}: StatCardProps) => {
  const contenido = (
    <div
      className={`aparece flex h-full min-w-0 flex-col rounded-2xl border border-line bg-surface p-4 sm:p-5 ${
        href
          ? 'hover-bloque transition-[background-color,border-color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:border-brand-300'
          : ''
      }`}
    >
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
        {Icono && (
          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
            <Icono size={17} stroke={2.2} />
          </span>
        )}
        <p className="min-w-0 text-[0.65rem] font-bold uppercase leading-tight tracking-wide text-ink-soft sm:text-xs">
          {etiqueta}
        </p>
      </div>
      <p className="mt-3 break-words text-[1.35rem] font-bold leading-none tracking-tight text-ink tabular-nums sm:text-2xl xl:text-[1.75rem]">
        {valor}
      </p>
      {detalle && (
        <p className="mt-2 break-words text-[0.8125rem] leading-snug text-ink-soft">
          {detalle}
        </p>
      )}
    </div>
  );

  return href ? (
    <Link href={href} className="min-w-0 no-underline">
      {contenido}
    </Link>
  ) : (
    contenido
  );
};
