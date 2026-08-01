'use client';

import { useEffect } from 'react';
import { avisoError } from '@/lib/avisos';
import { registrarErrorApp } from '@/lib/erroresApp';

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
      // Queda registrado siempre, aunque no mostremos el aviso: si el
      // cliente reporta "no anda", queremos el rastro completo.
      const detalle =
        e.reason instanceof Error
          ? `${e.reason.message}\n${e.reason.stack ?? ''}`
          : String(e.reason);
      registrarErrorApp(detalle, 'promesa sin atrapar');

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

    const onError = (e: ErrorEvent) => {
      registrarErrorApp(
        `${e.message} (${e.filename}:${e.lineno})`,
        'error de javascript'
      );
    };

    window.addEventListener('unhandledrejection', onRejection);
    window.addEventListener('error', onError);
    return () => {
      window.removeEventListener('unhandledrejection', onRejection);
      window.removeEventListener('error', onError);
    };
  }, []);

  return null;
};
