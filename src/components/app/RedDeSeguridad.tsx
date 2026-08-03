'use client';

import { useEffect } from 'react';
import { avisoError } from '@/lib/avisos';
import { registrarErrorApp } from '@/lib/erroresApp';

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

/** Errores de infraestructura traducidos a algo accionable. */
const traducir = (mensaje: string): { titulo: string; detalle: string } => {
  const m = mensaje.toLowerCase();

  if (m.includes('sin empresa activa')) {
    return {
      titulo: 'Elegí una empresa primero',
      detalle:
        'Esta sección trabaja sobre una empresa concreta. Entrá a una desde Empresas y volvé a intentar.',
    };
  }
  if (m.includes('sin sesión') || m.includes('sesión vencida')) {
    return {
      titulo: 'Se cerró tu sesión',
      detalle: 'Volvé a ingresar para seguir.',
    };
  }
  if (m.includes('no está conectada al servidor')) {
    return {
      titulo: 'Sin conexión con el servidor',
      detalle: 'Revisá tu conexión y volvé a intentar.',
    };
  }
  if (
    m.includes('failed to fetch') ||
    m.includes('networkerror') ||
    m.includes('load failed')
  ) {
    return {
      titulo: 'No pudimos conectarnos',
      detalle: 'Puede ser tu conexión. Probá de nuevo en unos segundos.',
    };
  }
  if (m.includes('infinite recursion')) {
    return {
      titulo: 'Error de permisos en el servidor',
      detalle: 'Avisá a ISEO RH: hay una regla de acceso mal configurada.',
    };
  }
  return {
    titulo: 'No pudimos cargar todo',
    detalle: 'Fue un problema puntual. Probá recargar la pantalla.',
  };
};

const textoDe = (razon: unknown): string => {
  if (razon instanceof Error) return razon.message;
  if (typeof razon === 'string') return razon;
  return 'Error desconocido';
};

export const RedDeSeguridad = () => {
  useEffect(() => {
    /**
     * Un aviso por mensaje: si una pantalla dispara seis consultas y las
     * seis fallan por lo mismo (la sesión se cortó), mostrar seis toasts
     * iguales tapa la pantalla y no agrega información.
     */
    const yaAvisado = new Set<string>();

    const alFallar = (e: PromiseRejectionEvent) => {
      const mensaje = textoDe(e.reason);
      if (yaAvisado.has(mensaje)) return;
      yaAvisado.add(mensaje);
      // Se olvida a los pocos segundos para que un fallo nuevo más tarde
      // sí vuelva a avisar.
      window.setTimeout(() => yaAvisado.delete(mensaje), 5000);

      const { titulo, detalle } = traducir(mensaje);
      avisoError(titulo, detalle);
      registrarErrorApp(mensaje, 'promesa sin atrapar');
    };

    window.addEventListener('unhandledrejection', alFallar);
    return () => window.removeEventListener('unhandledrejection', alFallar);
  }, []);

  return null;
};
