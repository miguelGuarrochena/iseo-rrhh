'use client';

import { ButtonHTMLAttributes, ReactNode } from 'react';

type Variante =
  | 'primario'
  | 'negro'
  | 'secundario'
  | 'aprobar'
  | 'rechazar'
  | 'sutil';
type Tamano = 'md' | 'sm';

interface BotonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
  tamano?: Tamano;
  children: ReactNode;
}

const base =
  'inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border-0 font-semibold transition-all duration-300 disabled:cursor-default disabled:opacity-60 disabled:hover:translate-y-0';

const tamanos: Record<Tamano, string> = {
  md: 'px-5 py-2.5 text-[0.95rem]',
  sm: 'px-3.5 py-1.5 text-xs',
};

/**
 * Sistema de botones de la app: pastel + borde fino, sin sombras.
 * Los colores viven en globals.css (variables, con tema claro/oscuro).
 */
const estilos: Record<Variante, string> = {
  primario: 'btn-primario',
  negro: 'btn-negro',
  secundario:
    'border border-line bg-surface text-ink hover:border-brand-300 hover:text-brand-700',
  aprobar: 'btn-aprobar',
  rechazar: 'btn-rechazar',
  sutil: 'border-0 bg-transparent text-ink-soft hover:bg-paper hover:text-ink',
};

export const Boton = ({
  variante = 'primario',
  tamano = 'md',
  children,
  className,
  ...props
}: BotonProps) => (
  <button
    {...props}
    className={`${base} ${tamanos[tamano]} ${estilos[variante]} ${className ?? ''}`}
  >
    {children}
  </button>
);
