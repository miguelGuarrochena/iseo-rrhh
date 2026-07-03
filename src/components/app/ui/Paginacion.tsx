'use client';

import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';

interface PaginacionProps {
  pagina: number;
  totalPaginas: number;
  onCambiar: (pagina: number) => void;
}

const botonClase =
  'flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-line bg-surface text-ink-soft transition-colors hover:border-brand-300 hover:text-brand-700 disabled:cursor-default disabled:opacity-40 disabled:hover:border-line disabled:hover:text-ink-soft';

/**
 * Paginación simple. Solo se muestra si hay más de una página.
 */
export const Paginacion = ({
  pagina,
  totalPaginas,
  onCambiar,
}: PaginacionProps) => {
  if (totalPaginas <= 1) return null;

  return (
    <div className="flex items-center justify-center gap-3 pt-1">
      <button
        onClick={() => onCambiar(pagina - 1)}
        disabled={pagina <= 1}
        aria-label="Página anterior"
        className={botonClase}
      >
        <IconChevronLeft size={18} />
      </button>
      <span className="text-sm font-semibold text-ink-soft">
        {pagina} de {totalPaginas}
      </span>
      <button
        onClick={() => onCambiar(pagina + 1)}
        disabled={pagina >= totalPaginas}
        aria-label="Página siguiente"
        className={botonClase}
      >
        <IconChevronRight size={18} />
      </button>
    </div>
  );
};

/** Recorta una lista a la página actual. */
export const paginar = <T,>(items: T[], pagina: number, porPagina: number) =>
  items.slice((pagina - 1) * porPagina, pagina * porPagina);

export const totalPaginasDe = (total: number, porPagina: number) =>
  Math.max(1, Math.ceil(total / porPagina));
