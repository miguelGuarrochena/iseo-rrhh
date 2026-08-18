'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { IconCheck, IconChevronDown } from '@tabler/icons-react';

export interface Opcion {
  valor: string;
  etiqueta: string;
}

/** Convierte un Record<valor, etiqueta> en opciones del Selector. */
export const aOpciones = (obj: Record<string, string>): Opcion[] =>
  Object.entries(obj).map(([valor, etiqueta]) => ({ valor, etiqueta }));

/** Alto máximo del panel, en px (≈ 12 opciones). */
const ALTO_MAXIMO = 440;
/** Por debajo de esto no vale la pena abrir hacia ese lado. */
const ALTO_MINIMO = 176;
/** Aire contra el borde de la ventana. */
const MARGEN = 12;

interface SelectorProps {
  valor: string;
  onCambiar: (valor: string) => void;
  opciones: Opcion[];
  tamano?: 'md' | 'sm';
  error?: boolean;
  className?: string;
}

/** Dónde y con qué tamaño dibujar el panel, en coordenadas de ventana. */
interface Posicion {
  izquierda: number;
  ancho: number;
  alto: number;
  /** Se abre hacia arriba: se ancla el borde inferior. */
  arriba: boolean;
  /** `top` si abre hacia abajo, `bottom` si abre hacia arriba. */
  offset: number;
}

/**
 * Dropdown propio (no nativo): botón + panel de opciones con el
 * lenguaje visual de la app. Cierra con click afuera o Esc.
 *
 * El panel se dibuja en un portal sobre `document.body` con posición
 * `fixed`, no como hijo absoluto del campo. La razón es concreta: dentro
 * de un Modal de Mantine (o de cualquier contenedor con scroll propio)
 * un panel absoluto queda recortado por el contenedor, y las opciones de
 * abajo simplemente no se podían ver ni elegir. Con el portal el panel
 * vive fuera de todo eso y se posiciona midiendo el botón.
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
  const [pos, setPos] = useState<Posicion | null>(null);
  const contenedor = useRef<HTMLDivElement>(null);
  const lista = useRef<HTMLDivElement>(null);

  const actual = opciones.find((o) => o.valor === valor);

  useEffect(() => {
    const cerrar = (e: MouseEvent) => {
      const destino = e.target as Node;
      if (contenedor.current?.contains(destino)) return;
      if (lista.current?.contains(destino)) return;
      setAbierto(false);
    };
    document.addEventListener('mousedown', cerrar);
    return () => document.removeEventListener('mousedown', cerrar);
  }, []);

  /**
   * Calcula posición y alto disponible. Antes el panel tenía un alto
   * fijo (`max-h-64` ≈ 6 opciones) y siempre caía hacia abajo: en un
   * combo cerca del pie de la pantalla quedaban tres opciones visibles y
   * el resto fuera de la vista. Ahora usa el espacio real que hay y, si
   * abajo hay menos que arriba, se da vuelta.
   */
  const medir = useCallback(() => {
    const caja = contenedor.current?.getBoundingClientRect();
    if (!caja) return;
    const espacioAbajo = window.innerHeight - caja.bottom - MARGEN;
    const espacioArriba = caja.top - MARGEN;
    const haciaArriba =
      espacioAbajo < ALTO_MINIMO && espacioArriba > espacioAbajo;
    const disponible = haciaArriba ? espacioArriba : espacioAbajo;
    setPos({
      izquierda: caja.left,
      ancho: caja.width,
      alto: Math.max(ALTO_MINIMO, Math.min(ALTO_MAXIMO, disponible)),
      arriba: haciaArriba,
      offset: haciaArriba ? window.innerHeight - caja.top + 6 : caja.bottom + 6,
    });
  }, []);

  useLayoutEffect(() => {
    if (!abierto) {
      setPos(null);
      return;
    }
    medir();
    window.addEventListener('resize', medir);
    // `true` = fase de captura, para enterarse también del scroll de los
    // contenedores internos (el cuerpo de un Modal), no solo del de la
    // ventana. Sin esto el panel quedaría flotando donde estaba.
    window.addEventListener('scroll', medir, true);
    return () => {
      window.removeEventListener('resize', medir);
      window.removeEventListener('scroll', medir, true);
    };
  }, [abierto, medir]);

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

  // Al moverse con las flechas, la opción resaltada tiene que entrar en
  // el panel: si no, se navega a ciegas por una lista larga.
  useEffect(() => {
    if (!abierto) return;
    lista.current?.children[resaltada]?.scrollIntoView({ block: 'nearest' });
  }, [abierto, resaltada, pos]);

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
    } else if (e.key === 'Home') {
      e.preventDefault();
      setResaltada(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setResaltada(opciones.length - 1);
    }
  };

  /**
   * Mismo alto que un `Campo` y que un `Boton`: estos selectores viven
   * en las barras de filtros al lado de un buscador y de un botón, y
   * cada uno medía distinto. Los mínimos son los de siempre —44px con
   * el dedo, 40 con el mouse— así que la pantalla ya no tiene que
   * forzarlos a mano con `[&>button]:h-12`.
   */
  const claseBoton =
    tamano === 'sm'
      ? 'min-h-10 rounded-lg px-3 py-1.5 text-[0.8125rem] font-semibold sm:min-h-9'
      : 'min-h-11 rounded-xl px-4 py-2.5 text-sm font-medium sm:min-h-10';

  const panel = pos && (
    <div
      ref={lista}
      role="listbox"
      style={{
        position: 'fixed',
        left: pos.izquierda,
        minWidth: pos.ancho,
        maxWidth: `min(28rem, calc(100vw - ${MARGEN * 2}px))`,
        maxHeight: pos.alto,
        ...(pos.arriba ? { bottom: pos.offset } : { top: pos.offset }),
      }}
      className="z-[400] overflow-y-auto overscroll-contain rounded-xl border border-line-strong bg-surface py-1.5 shadow-xl"
    >
      {opciones.map((o, i) => {
        const elegida = o.valor === valor;
        return (
          <button
            key={o.valor || '__vacio'}
            type="button"
            role="option"
            aria-selected={elegida}
            onClick={() => elegir(o.valor)}
            onMouseEnter={() => setResaltada(i)}
            className={`flex min-h-10 w-full cursor-pointer items-center justify-between gap-3 px-3.5 py-2 text-left text-sm transition-colors ${
              i === resaltada
                ? 'bg-brand-100 text-brand-800'
                : 'bg-transparent text-ink'
            } ${elegida ? 'font-semibold' : 'font-medium'}`}
          >
            {/* Sin `truncate`: el punto del pedido era poder leer las
                opciones enteras. El panel crece hasta 28rem y recién ahí
                corta, en vez de recortar a lo ancho del campo. */}
            <span className="min-w-0 flex-1">{o.etiqueta}</span>
            {elegida && <IconCheck size={15} className="shrink-0" />}
          </button>
        );
      })}
    </div>
  );

  return (
    <div ref={contenedor} className={`relative ${className ?? ''}`}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
        onKeyDown={alTeclear}
        className={`flex w-full cursor-pointer items-center justify-between gap-2 border bg-surface text-ink transition-colors ${claseBoton} ${
          error
            ? 'border-red-300'
            : abierto
              ? 'border-brand-500 shadow-[0_0_0_3px_rgba(74,122,245,0.18)]'
              : 'border-line-strong hover:border-brand-400'
        }`}
      >
        <span className="truncate">{actual?.etiqueta ?? '—'}</span>
        <IconChevronDown
          size={tamano === 'sm' ? 14 : 16}
          className={`shrink-0 text-ink-soft transition-transform duration-200 ${abierto ? 'rotate-180' : ''}`}
        />
      </button>

      {abierto &&
        typeof document !== 'undefined' &&
        createPortal(panel, document.body)}
    </div>
  );
};
