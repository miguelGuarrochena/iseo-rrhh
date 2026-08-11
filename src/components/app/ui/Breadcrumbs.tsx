import Link from 'next/link';
import { IconArrowLeft, IconChevronRight } from '@tabler/icons-react';

interface Miga {
  etiqueta: string;
  href?: string;
}

/**
 * Migas de pan y vuelta a la sección anterior.
 *
 * En un celular no hay menú lateral, y la barra de abajo lleva a las
 * secciones principales pero no a la que se estaba viendo: entrar a una
 * ficha era un viaje de ida y había que usar el botón del navegador.
 *
 * Por eso abajo de `sm` el rastro completo se reemplaza por un solo
 * "volver" grande —el único salto que se usa de verdad, y con un área de
 * toque cómoda— y las migas enteras quedan para las pantallas que tienen
 * lugar para leerlas.
 */
export const Breadcrumbs = ({ items }: { items: Miga[] }) => {
  const anterior = items.filter((m) => m.href).at(-1);

  return (
    <nav className="mb-3">
      {anterior && (
        <Link
          href={anterior.href ?? '/'}
          className="presionable -ml-2 inline-flex min-h-10 items-center gap-1.5 rounded-xl px-2 text-sm font-semibold text-ink-soft no-underline transition-colors hover:text-ink sm:hidden"
        >
          <IconArrowLeft size={18} />
          {anterior.etiqueta}
        </Link>
      )}

      <div className="hidden flex-wrap items-center gap-1.5 text-sm sm:flex">
        {items.map((item, i) => (
          <span key={item.etiqueta} className="flex items-center gap-1.5">
            {i > 0 && (
              <IconChevronRight size={14} className="text-ink-soft/60" />
            )}
            {item.href ? (
              <Link
                href={item.href}
                className="font-semibold text-brand-700 no-underline transition-colors hover:text-brand-600 hover:underline"
              >
                {item.etiqueta}
              </Link>
            ) : (
              <span className="font-semibold text-ink">{item.etiqueta}</span>
            )}
          </span>
        ))}
      </div>
    </nav>
  );
};
