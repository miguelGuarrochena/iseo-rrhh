import { ReactNode } from 'react';

interface PanelProps {
  /** Título de la sección. Si se pasa, el panel dibuja su encabezado. */
  titulo?: ReactNode;
  /** Una línea explicando qué se ve acá o qué se puede hacer. */
  descripcion?: ReactNode;
  /** Botones de la sección, alineados a la derecha en escritorio. */
  acciones?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * Caja blanca contenedora, mismo lenguaje visual que los bloques
 * de la landing: contenido en cajas internas tono paper.
 *
 * El encabezado es parte del panel y no algo que arme cada pantalla.
 * Cuando lo armaba cada una, el título, los botones y la primera fila
 * quedaban separados por la misma distancia y no se leía dónde termina
 * el encabezado y empieza el contenido; además cada pantalla elegía su
 * propio tamaño de título. Acá el bloque de arriba se cierra con una
 * línea y el contenido arranca claramente después.
 */
export const Panel = ({
  titulo,
  descripcion,
  acciones,
  children,
  className,
}: PanelProps) => (
  <section
    className={`aparece min-w-0 max-w-full rounded-3xl border border-line bg-surface p-5 sm:p-6 lg:p-7 ${className ?? ''}`}
  >
    {(titulo || acciones) && (
      <>
        <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          {titulo && (
            <div className="min-w-0">
              <h2 className="text-[1.0625rem] font-bold tracking-tight text-ink">
                {titulo}
              </h2>
              {descripcion && (
                <p className="mt-1 max-w-prose text-sm leading-relaxed text-ink-soft">
                  {descripcion}
                </p>
              )}
            </div>
          )}
          {acciones && (
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
              {acciones}
            </div>
          )}
        </div>
        <div className="divisor-panel mt-5 pt-5" />
      </>
    )}
    {children}
  </section>
);
