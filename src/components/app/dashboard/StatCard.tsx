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
      className={`flex h-full flex-col rounded-2xl border border-line bg-surface p-4 sm:p-5 ${
        href
          ? 'hover-bloque transition-colors duration-200 hover:border-brand-300'
          : ''
      }`}
    >
      {Icono && (
        <span className="mb-3 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
          <Icono size={18} stroke={2.2} />
        </span>
      )}
      <p className="text-xs font-bold uppercase tracking-widest text-ink-soft">
        {etiqueta}
      </p>
      <p className="mt-1.5 text-[1.7rem] font-bold tracking-tight text-ink">
        {valor}
      </p>
      {detalle && <p className="mt-1 text-sm text-ink-soft">{detalle}</p>}
    </div>
  );

  return href ? (
    <Link href={href} className="no-underline">
      {contenido}
    </Link>
  ) : (
    contenido
  );
};
