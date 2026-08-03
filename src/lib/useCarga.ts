'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ErrorInterpretado, interpretarError } from '@/lib/errores';
import { registrarErrorApp } from '@/lib/erroresApp';

export type FaseCarga = 'cargando' | 'ok' | 'error';

export interface Carga<T> {
  datos: T | undefined;
  fase: FaseCarga;
  error: ErrorInterpretado | null;
  /** Vuelve a pedir. Sirve para el botón de reintentar y tras guardar. */
  recargar: () => void;
  /**
   * Reemplaza lo cargado sin volver a pedir.
   *
   * Para cuando la operación que acabás de hacer ya devolvió el registro
   * actualizado (tildar un ítem, cambiar un estado): pedirlo de nuevo
   * sería un viaje al servidor para traer algo que ya tenés.
   *
   * No sirve para "adivinar" el resultado antes de que el servidor
   * conteste: si la operación falla, la pantalla queda mintiendo.
   */
  actualizar: (datos: T) => void;
}

/** Igual, pero con `datos` siempre presente porque se dio un `inicial`. */
export interface CargaConInicial<T> extends Carga<T> {
  datos: T;
}

interface OpcionesCarga<T> {
  activo?: boolean;
  contexto?: string;
  /**
   * Valor mientras no hay respuesta (típicamente `[]`).
   *
   * No es cosmético: sin esto cada pantalla escribe `carga.datos ?? []`,
   * que crea un array nuevo en cada render y hace que los `useMemo` que
   * dependen de él se recalculen siempre. Acá entra una sola vez —React
   * ignora el valor inicial después del primer render— así que la
   * referencia queda estable.
   *
   * Para saber si todavía está cargando está `fase`, no el valor.
   */
  inicial?: T;
}

/**
 * Carga datos con las tres cosas que las pantallas venían resolviendo mal
 * o directamente no resolviendo:
 *
 * 1. **El error se atrapa.** Antes era `void getX().then(setY)`: si
 *    fallaba, quedaba un `Uncaught (in promise)` en la consola y la
 *    pantalla vacía. "No cargó" y "no hay nada" se veían igual.
 *
 * 2. **No hay carreras.** Si cambian los filtros rápido, la respuesta de
 *    la consulta vieja puede llegar después de la nueva y pisarla: se ven
 *    datos que no corresponden a lo que está seleccionado. Cada pedido
 *    lleva número y sólo el último escribe.
 *
 * 3. **No se escribe después de desmontar.** Salir de la pantalla
 *    mientras carga no deja un warning ni un update al vacío.
 *
 * `activo: false` sirve para no pedir nada cuando todavía falta un dato
 * (el id del empleado, por ejemplo) sin tener que romper el orden de los
 * hooks con un `if` antes.
 */
export function useCarga<T>(
  pedir: () => Promise<T>,
  deps: React.DependencyList,
  opciones: OpcionesCarga<T> & { inicial: T }
): CargaConInicial<T>;
export function useCarga<T>(
  pedir: () => Promise<T>,
  deps: React.DependencyList,
  opciones?: OpcionesCarga<T>
): Carga<T>;
export function useCarga<T>(
  pedir: () => Promise<T>,
  deps: React.DependencyList,
  opciones?: OpcionesCarga<T>
): Carga<T> {
  const activo = opciones?.activo ?? true;
  const contexto = opciones?.contexto;

  const [datos, setDatos] = useState<T | undefined>(opciones?.inicial);
  const [fase, setFase] = useState<FaseCarga>(activo ? 'cargando' : 'ok');
  const [error, setError] = useState<ErrorInterpretado | null>(null);

  /** Número del pedido en curso: sólo el más nuevo puede escribir. */
  const generacion = useRef(0);
  const montado = useRef(true);
  const [intento, setIntento] = useState(0);

  // `pedir` suele ser una arrow nueva en cada render; se guarda en una ref
  // para que no dispare el efecto por sí misma. Las dependencias reales
  // las declara quien llama, en `deps`.
  const pedirRef = useRef(pedir);
  pedirRef.current = pedir;

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  useEffect(() => {
    if (!activo) {
      setFase('ok');
      setError(null);
      return;
    }

    const mio = ++generacion.current;
    setFase('cargando');
    setError(null);

    pedirRef.current().then(
      (resultado) => {
        if (!montado.current || mio !== generacion.current) return;
        setDatos(resultado);
        setFase('ok');
      },
      (err: unknown) => {
        if (!montado.current || mio !== generacion.current) return;
        const interpretado = interpretarError(err);
        setError(interpretado);
        setFase('error');
        registrarErrorApp(interpretado.crudo, contexto);
      }
    );
    // `pedir` va por ref a propósito (ver arriba).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, activo, intento, contexto]);

  const recargar = useCallback(() => setIntento((n) => n + 1), []);

  /**
   * Se cuenta como un pedido nuevo (avanza la generación) para que una
   * respuesta que venía en camino no pise lo que se acaba de guardar.
   */
  const actualizar = useCallback((nuevos: T) => {
    generacion.current += 1;
    setDatos(nuevos);
    setFase('ok');
    setError(null);
  }, []);

  return { datos, fase, error, recargar, actualizar };
}
