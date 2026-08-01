'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Cuenta de 0 hasta `hasta` una sola vez, cuando el elemento entra en
 * pantalla. Si el sistema pide menos movimiento, muestra el valor final
 * directamente.
 */
export const useContador = (hasta: number, duracionMs = 900) => {
  const ref = useRef<HTMLElement | null>(null);
  const [valor, setValor] = useState(0);
  const arrancado = useRef(false);

  useEffect(() => {
    const nodo = ref.current;
    if (!nodo) return;

    const menosMovimiento =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (menosMovimiento) {
      setValor(hasta);
      return;
    }

    const animar = () => {
      const inicio = performance.now();
      const paso = (ahora: number) => {
        const t = Math.min(1, (ahora - inicio) / duracionMs);
        // easeOutCubic: arranca rápido y frena, como un contador real
        const eased = 1 - Math.pow(1 - t, 3);
        setValor(Math.round(hasta * eased));
        if (t < 1) requestAnimationFrame(paso);
      };
      requestAnimationFrame(paso);
    };

    const observador = new IntersectionObserver(
      (entradas) => {
        entradas.forEach((entrada) => {
          if (entrada.isIntersecting && !arrancado.current) {
            arrancado.current = true;
            animar();
          }
        });
      },
      { threshold: 0.4 }
    );

    observador.observe(nodo);
    return () => observador.disconnect();
  }, [hasta, duracionMs]);

  return { ref, valor };
};
