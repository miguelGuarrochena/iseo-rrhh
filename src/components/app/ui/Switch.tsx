'use client';

import { InputHTMLAttributes } from 'react';

interface SwitchProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  /** Texto para lectores de pantalla si el switch va sin etiqueta visible. */
  etiquetaAccesible?: string;
}

/**
 * Interruptor de encendido/apagado.
 *
 * Para "esto está prendido o apagado" un switch se lee mejor que un
 * checkbox: el tilde dice "seleccionado", que no es lo mismo que "activo".
 *
 * Por dentro sigue siendo un `input type="checkbox"` escondido: así el
 * teclado (Tab + Espacio), los lectores de pantalla y el click en la
 * etiqueta que lo envuelve funcionan solos, sin reimplementar nada.
 *
 * El estado se distingue por dos cosas a la vez —color de la pista y
 * posición de la perilla— para que no dependa sólo del color: con
 * daltonismo, dos pistas de tono parecido son indistinguibles, pero la
 * perilla a izquierda o derecha se ve siempre.
 */
export const Switch = ({
  etiquetaAccesible,
  className,
  disabled,
  ...props
}: SwitchProps) => (
  <span
    className={`relative inline-flex h-6 w-11 shrink-0 items-center ${
      disabled ? 'opacity-50' : 'cursor-pointer'
    } ${className ?? ''}`}
  >
    <input
      {...props}
      type="checkbox"
      disabled={disabled}
      aria-label={etiquetaAccesible}
      className="peer absolute inset-0 z-10 m-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-default"
    />

    {/* Pista: gris apagada, color de marca encendida. */}
    <span
      aria-hidden="true"
      className="absolute inset-0 rounded-full border border-line-strong bg-paper transition-colors duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] peer-checked:border-brand-600 peer-checked:bg-brand-600 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-600/40"
    />

    {/*
      Perilla. El punto del centro cambia de color con una variante
      anidada: `peer-checked:` sólo alcanza a hermanos del input, y el
      punto está adentro de la perilla.
    */}
    <span
      aria-hidden="true"
      className="pointer-events-none relative ml-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-surface shadow-sm transition-transform duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] peer-checked:translate-x-5 peer-checked:[&>span]:bg-brand-600"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-ink-soft/40 transition-colors duration-150" />
    </span>
  </span>
);
