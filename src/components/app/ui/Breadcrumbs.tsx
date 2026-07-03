import Link from 'next/link';
import { IconChevronRight } from '@tabler/icons-react';

interface Miga {
  etiqueta: string;
  href?: string;
}

/**
 * Migas de pan para páginas anidadas. El último ítem es la página actual.
 */
export const Breadcrumbs = ({ items }: { items: Miga[] }) => (
  <nav className="mb-3 flex flex-wrap items-center gap-1.5 text-sm">
    {items.map((item, i) => (
      <span key={item.etiqueta} className="flex items-center gap-1.5">
        {i > 0 && <IconChevronRight size={14} className="text-ink-soft/60" />}
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
  </nav>
);
