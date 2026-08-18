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

/**
 * `presionable` (globals.css) da el feedback al apretar y transiciona
 * sólo las propiedades que cambian. Antes era `transition-all
 * duration-300`: 300ms se siente lento en el botón que más se toca de la
 * app, y `all` anima de más (incluido el layout) por si acaso.
 *
 * `boton-app` normaliza el tamaño del ícono contra la tipografía del
 * botón: los llamadores pasaban `size={14}`, `16` y `18` para el mismo
 * botón según la pantalla y la fila de acciones quedaba despareja.
 */
const base =
  'boton-app presionable inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold leading-none disabled:cursor-default disabled:opacity-55 disabled:hover:translate-y-0 disabled:active:transform-none';

/**
 * Alturas pensadas para el dedo primero: 44px en `md` y 40px en `sm`,
 * el mínimo que recomiendan Apple y Google.
 *
 * Con mouse bajan a 40 y 36 —no a "lo que salga": antes `sm:min-h-0`
 * dejaba el `sm` en 28px de alto con texto de 12px, y una barra de
 * herramientas hecha de esos botones se leía como una fila de links.
 */
const tamanos: Record<Tamano, string> = {
  md: 'min-h-11 px-5 py-2.5 text-[0.95rem] sm:min-h-10',
  sm: 'min-h-10 px-3.5 py-2 text-[0.8125rem] sm:min-h-9',
};

/**
 * Sistema de botones de la app: pastel + borde fino, sin sombras.
 * Los colores viven en globals.css (variables, con tema claro/oscuro).
 *
 * Todas las variantes llevan 1px de borde —`sutil` uno transparente—
 * para que dos botones distintos puestos uno al lado del otro midan lo
 * mismo de alto.
 */
const estilos: Record<Variante, string> = {
  primario: 'btn-primario',
  negro: 'btn-negro',
  secundario: 'btn-secundario',
  aprobar: 'btn-aprobar',
  rechazar: 'btn-rechazar',
  sutil:
    'border border-transparent bg-transparent text-ink-soft hover:bg-paper hover:text-ink',
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
