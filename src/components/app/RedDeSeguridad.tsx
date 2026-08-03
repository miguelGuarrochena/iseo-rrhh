'use client';

import { useEffect } from 'react';
import { avisoError } from '@/lib/avisos';
import { registrarErrorApp } from '@/lib/erroresApp';
import { interpretarError, textoDeError } from '@/lib/errores';

/**
 * Última red antes de la consola.
 *
 * Las pantallas cargan datos con `void getX().then(setY)`. Ese `void`
 * dice "no me espero el resultado", pero si la promesa falla nadie la
 * atrapa: el error termina como `Uncaught (in promise)` en la consola y
 * la pantalla se queda vacía sin explicar nada. Para quien usa la app,
 * "no cargó" y "no hay datos" se ven igual.
 *
 * El error boundary de Next (app/error.tsx) no cubre esto: sólo agarra lo
 * que explota durante el render, no una promesa suelta.
 *
 * Esto NO reemplaza manejar el error donde corresponde; es el piso para
 * que nada falle en silencio.
 */

export const RedDeSeguridad = () => {
  useEffect(() => {
    /**
     * Un aviso por mensaje: si una pantalla dispara seis consultas y las
     * seis fallan por lo mismo (la sesión se cortó), mostrar seis toasts
     * iguales tapa la pantalla y no agrega información.
     */
    const yaAvisado = new Set<string>();

    const alFallar = (e: PromiseRejectionEvent) => {
      const mensaje = textoDeError(e.reason);
      if (yaAvisado.has(mensaje)) return;
      yaAvisado.add(mensaje);
      // Se olvida a los pocos segundos para que un fallo nuevo más tarde
      // sí vuelva a avisar.
      window.setTimeout(() => yaAvisado.delete(mensaje), 5000);

      const { titulo, detalle } = interpretarError(e.reason);
      avisoError(titulo, detalle);
      registrarErrorApp(mensaje, 'promesa sin atrapar');
    };

    window.addEventListener('unhandledrejection', alFallar);
    return () => window.removeEventListener('unhandledrejection', alFallar);
  }, []);

  return null;
};
