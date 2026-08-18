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
      {Icono && (
        <span className="mb-3 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
          <Icono size={18} stroke={2.2} />
        </span>
      )}
      <p className="text-[0.65rem] font-bold uppercase tracking-wide text-ink-soft sm:text-xs sm:tracking-widest">
        {etiqueta}
      </p>
      <p className="mt-1.5 break-words text-xl font-bold tracking-tight text-ink tabular-nums sm:text-[1.7rem]">
        {valor}
      </p>
      {detalle && (
        <p className="mt-1 break-words text-sm text-ink-soft">{detalle}</p>
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
