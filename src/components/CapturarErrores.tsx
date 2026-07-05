'use client';

import { useEffect } from 'react';
import { avisoError } from '@/lib/avisos';

/**
 * Red global para promesas rechazadas que nadie atrapó (por ejemplo, una
 * consulta de datos que falla y quedaría en silencio dejando una pantalla
 * vacía). Muestra un aviso claro para que el usuario sepa que hubo un
 * problema puntual y pueda reintentar, en vez de quedar mirando un cargando.
 */
export const CapturarErrores = () => {
  useEffect(() => {
    let ultimo = 0;
    const onRejection = (e: PromiseRejectionEvent) => {
      // Evita spamear si caen varias a la vez.
      const ahora = Date.now();
      if (ahora - ultimo < 3000) return;
      ultimo = ahora;
      console.error('Promesa sin atrapar:', e.reason);
      avisoError(
        'No pudimos cargar todo',
        'Hubo un problema puntual. Recargá la página o probá de nuevo.'
      );
    };
    window.addEventListener('unhandledrejection', onRejection);
    return () => window.removeEventListener('unhandledrejection', onRejection);
  }, []);

  return null;
};
