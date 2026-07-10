import { ReactNode } from 'react';
import Link from 'next/link';
import { Icon } from '@tabler/icons-react';

interface ListaCardProps {
  titulo: string;
  vacio?: string;
  /** Link de acento (azul) a la sección completa, ej. "Ver todas" */
  accion?: { etiqueta: string; href: string };
  /** Mientras carga muestra filas fantasma en vez del texto de vacío */
  cargando?: boolean;
  /** Útil cuando children incluye controles auxiliares como paginación. */
  tieneItems?: boolean;
  children?: ReactNode;
}

/** Fila fantasma mientras cargan los datos. */
const FilaEsqueleto = () => (
  <div className="flex animate-pulse items-center gap-3.5 rounded-2xl border border-line bg-surface px-4 py-3.5 sm:px-5">
    <span className="h-9 w-9 flex-shrink-0 rounded-full bg-paper" />
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <span className="h-3.5 w-2/5 rounded-full bg-paper" />
      <span className="h-3 w-3/5 rounded-full bg-paper/70" />
    </div>
    <span className="h-6 w-16 shrink-0 rounded-full bg-paper" />
  </div>
);

/**
 * Caja blanca grande (como los bloques de la landing) que contiene
 * pastillas internas con borde fino y chip circular. Sin sombras.
 */
export const ListaCard = ({
  titulo,
  vacio,
  accion,
  cargando,
  tieneItems,
  children,
}: ListaCardProps) => {
  const tieneContenido =
    tieneItems ??
    (children !== undefined && children !== null && children !== false);

  return (
    <section className="rounded-3xl border border-line bg-surface p-5 sm:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-bold text-ink">{titulo}</h2>
        {accion && (
          <Link
            href={accion.href}
            className="shrink-0 text-sm font-semibold text-brand-700 no-underline transition-colors hover:text-brand-600 hover:underline"
          >
            {accion.etiqueta} →
          </Link>
        )}
      </div>
      <div className="mt-4 flex flex-col gap-3">
        {cargando ? (
          <>
            <FilaEsqueleto />
            <FilaEsqueleto />
            <FilaEsqueleto />
          </>
        ) : tieneContenido ? (
          children
        ) : (
          <p className="text-sm text-ink-soft">{vacio}</p>
        )}
      </div>
    </section>
  );
};

interface ListaItemProps {
  principal: string;
  secundario?: string;
  extremo?: ReactNode;
  icono?: Icon;
  /** Foto: si está, reemplaza al ícono */
  avatarUrl?: string;
  /** Si se pasa, toda la fila navega al hacer click */
  href?: string;
  /** Alternativa a href: acción al clickear la fila */
  onClick?: () => void;
}

export const ListaItem = ({
  principal,
  secundario,
  extremo,
  icono: Icono,
  avatarUrl,
  href,
  onClick,
}: ListaItemProps) => {
  const clickeable = Boolean(href || onClick);
  const fila = (
    <div
      onClick={onClick}
      className={`flex flex-col gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5 ${
        clickeable
          ? 'hover-bloque cursor-pointer transition-colors duration-200 hover:border-brand-300'
          : ''
      }`}
    >
      <div className="flex min-w-0 items-center gap-3.5">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt={principal}
            className="h-9 w-9 flex-shrink-0 rounded-full border border-line object-cover"
          />
        ) : (
          Icono && (
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
              <Icono size={18} stroke={2.2} />
            </span>
          )
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{principal}</p>
          {secundario && (
            <p className="truncate text-xs text-ink-soft">{secundario}</p>
          )}
        </div>
      </div>
      {extremo && (
        <div
          className="flex shrink-0 items-center justify-end"
          onClick={(e) => {
            // Si el extremo tiene controles (botones, selects), su click
            // no debe disparar la navegación de la fila.
            if (
              clickeable &&
              (e.target as HTMLElement).closest('button, a, select, input')
            ) {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
        >
          {extremo}
        </div>
      )}
    </div>
  );

  return href ? (
    <Link href={href} className="no-underline">
      {fila}
    </Link>
  ) : (
    fila
  );
};
