'use client';

import { ButtonHTMLAttributes, ReactNode } from 'react';

type Variante = 'neutro' | 'peligro';
type Tamano = 'md' | 'sm';

interface BotonIconoProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  /** Qué hace el botón. Va al lector de pantalla y al tooltip nativo. */
  etiqueta: string;
  variante?: Variante;
  tamano?: Tamano;
  children: ReactNode;
}

/**
 * Botón de una sola acción dibujada con un ícono (editar, borrar,
 * descargar) dentro de una fila o una tarjeta.
 *
 * Existe porque cada pantalla lo venía escribiendo a mano y salía
 * distinto: el de Remuneraciones medía 27px de lado en escritorio —muy
 * por debajo de los 44 recomendados y difícil de acertar—, otros no
 * tenían `aria-label`, y el borde `--line` sobre blanco no se veía.
 * Acá la etiqueta es obligatoria y la superficie táctil es la misma en
 * toda la app: 44px con el dedo, 40 con el mouse.
 */
const tamanos: Record<Tamano, string> = {
  md: 'h-11 w-11 sm:h-10 sm:w-10',
  sm: 'h-10 w-10 sm:h-9 sm:w-9',
};

const variantes: Record<Variante, string> = {
  neutro:
    'border-line-strong bg-surface text-ink-soft hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700',
  peligro:
    'border-red-200 bg-red-50 text-red-700 hover:border-red-400 hover:bg-red-100',
};

export const BotonIcono = ({
  etiqueta,
  variante = 'neutro',
  tamano = 'md',
  children,
  className,
  ...props
}: BotonIconoProps) => (
  <button
    {...props}
    type={props.type ?? 'button'}
    aria-label={etiqueta}
    title={etiqueta}
    className={`boton-app presionable inline-flex shrink-0 cursor-pointer items-center justify-center rounded-full border text-[1.05rem] disabled:cursor-default disabled:opacity-55 ${tamanos[tamano]} ${variantes[variante]} ${className ?? ''}`}
  >
    {children}
  </button>
);
