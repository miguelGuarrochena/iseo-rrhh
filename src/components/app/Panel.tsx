import { ReactNode } from 'react';

interface PanelProps {
  children: ReactNode;
  className?: string;
}

/**
 * Caja blanca contenedora, mismo lenguaje visual que los bloques
 * de la landing: contenido en cajas internas tono paper.
 */
export const Panel = ({ children, className }: PanelProps) => (
  <section
    className={`rounded-3xl border border-line bg-surface p-5 sm:p-7 ${className ?? ''}`}
  >
    {children}
  </section>
);
