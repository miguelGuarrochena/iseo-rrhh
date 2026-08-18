'use client';

import { useEffect, useState } from 'react';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';

interface PaginacionProps {
  pagina: number;
  totalPaginas: number;
  onCambiar: (pagina: number) => void;
}

const botonClase =
  'boton-app presionable flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-line-strong bg-surface text-[1.05rem] text-ink-soft hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700 disabled:cursor-default disabled:opacity-40 disabled:hover:border-line-strong disabled:hover:bg-surface disabled:hover:text-ink-soft sm:h-10 sm:w-10';

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
    <div className="flex items-center justify-center gap-4 pt-2">
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

/**
 * Paginación lista para usar: devuelve el tramo visible y se acomoda sola
 * cuando la lista se achica. Sin esto, al filtrar estando en la página 5
 * la pantalla queda en blanco: hay resultados, pero no en esa página.
 */
export const usePaginacion = <T,>(items: T[], porPagina: number) => {
  const [pagina, setPagina] = useState(1);
  const totalPaginas = totalPaginasDe(items.length, porPagina);

  useEffect(() => {
    setPagina((actual) => (actual > totalPaginas ? 1 : actual));
  }, [totalPaginas]);

  const seguro = Math.min(pagina, totalPaginas);

  return {
    pagina: seguro,
    setPagina,
    totalPaginas,
    visibles: paginar(items, seguro, porPagina),
  };
};
