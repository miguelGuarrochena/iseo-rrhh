'use client';

import { useEffect, useRef, useState } from 'react';
import { IconCheck, IconChevronDown } from '@tabler/icons-react';

export interface Opcion {
  valor: string;
  etiqueta: string;
}

/** Convierte un Record<valor, etiqueta> en opciones del Selector. */
export const aOpciones = (obj: Record<string, string>): Opcion[] =>
  Object.entries(obj).map(([valor, etiqueta]) => ({ valor, etiqueta }));

interface SelectorProps {
  valor: string;
  onCambiar: (valor: string) => void;
  opciones: Opcion[];
  tamano?: 'md' | 'sm';
  error?: boolean;
  className?: string;
}

/**
 * Dropdown propio (no nativo): botón + panel de opciones con el
 * lenguaje visual de la app. Cierra con click afuera o Esc.
 */
export const Selector = ({
  valor,
  onCambiar,
  opciones,
  tamano = 'md',
  error,
  className,
}: SelectorProps) => {
  const [abierto, setAbierto] = useState(false);
  const [resaltada, setResaltada] = useState(0);
  const contenedor = useRef<HTMLDivElement>(null);

  const actual = opciones.find((o) => o.valor === valor);

  useEffect(() => {
    const cerrar = (e: MouseEvent) => {
      if (!contenedor.current?.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener('mousedown', cerrar);
    return () => document.removeEventListener('mousedown', cerrar);
  }, []);

  useEffect(() => {
    if (abierto) {
      setResaltada(
        Math.max(
          0,
          opciones.findIndex((o) => o.valor === valor)
        )
      );
    }
  }, [abierto, opciones, valor]);

  const elegir = (v: string) => {
    onCambiar(v);
    setAbierto(false);
  };

  const alTeclear = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') setAbierto(false);
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!abierto) setAbierto(true);
      else if (opciones[resaltada]) elegir(opciones[resaltada].valor);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAbierto(true);
      setResaltada((r) => Math.min(r + 1, opciones.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setResaltada((r) => Math.max(r - 1, 0));
    }
  };

  const claseBoton =
    tamano === 'sm'
      ? 'rounded-lg px-2.5 py-1.5 text-xs font-semibold'
      : 'rounded-xl px-4 py-2.5 text-sm font-medium';

  return (
    <div ref={contenedor} className={`relative ${className ?? ''}`}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        onKeyDown={alTeclear}
        className={`flex w-full cursor-pointer items-center justify-between gap-2 border bg-surface text-ink transition-colors ${claseBoton} ${
          error
            ? 'border-red-300'
            : abierto
              ? 'border-brand-600'
              : 'border-line hover:border-brand-300'
        }`}
      >
        <span className="truncate">{actual?.etiqueta ?? '—'}</span>
        <IconChevronDown
          size={tamano === 'sm' ? 14 : 16}
          className={`shrink-0 text-ink-soft transition-transform duration-200 ${abierto ? 'rotate-180' : ''}`}
        />
      </button>

      {abierto && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1.5 max-h-64 min-w-max overflow-y-auto rounded-xl border border-line bg-surface py-1.5">
          {opciones.map((o, i) => {
            const elegida = o.valor === valor;
            return (
              <button
                key={o.valor || '__vacio'}
                type="button"
                onClick={() => elegir(o.valor)}
                onMouseEnter={() => setResaltada(i)}
                className={`flex w-full cursor-pointer items-center justify-between gap-3 px-3.5 py-2 text-left text-sm transition-colors ${
                  i === resaltada
                    ? 'bg-brand-100 text-brand-800'
                    : 'bg-transparent text-ink'
                } ${elegida ? 'font-semibold' : 'font-medium'}`}
              >
                <span className="truncate">{o.etiqueta}</span>
                {elegida && <IconCheck size={15} className="shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
