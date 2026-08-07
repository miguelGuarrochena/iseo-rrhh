import 'server-only';

/**
 * Registro de eventos del servidor.
 *
 * El problema que resuelve: hasta acá no había **nada**. Los errores de
 * las rutas de API no se guardaban en ningún lado ni disparaban ninguna
 * alerta. `registrarErrorApp` existe pero corre en el navegador, así que
 * sólo ve lo que le pasa al cliente. Si un cron de facturación fallaba en
 * producción, nadie se enteraba hasta que un cliente preguntaba por qué
 * no le llegó el aviso.
 *
 * Esto no reemplaza a Sentry ni pretende hacerlo. Es el piso: una línea
 * JSON por evento en stdout, que en Vercel queda en los logs de función y
 * se puede buscar y enrutar a una alerta. Cuando se contrate un servicio
 * de verdad, se cambia la implementación de acá y no cada `catch`.
 *
 * JSON en una línea y no texto libre porque los logs de Vercel se filtran
 * por campo: `nivel:"error" ruta:"/api/cron/facturacion"` es una consulta;
 * un `console.error` con interpolación es un grep a mano.
 */

type Nivel = 'info' | 'warn' | 'error';

interface Contexto {
  /** Ruta o proceso donde ocurrió, ej. '/api/cron/facturacion'. */
  ruta: string;
  /** Cualquier dato que ayude a reconstruir el caso. Sin datos personales. */
  [clave: string]: unknown;
}

const emitir = (nivel: Nivel, mensaje: string, contexto: Contexto) => {
  const linea = JSON.stringify({
    nivel,
    mensaje,
    momento: new Date().toISOString(),
    ...contexto,
  });
  if (nivel === 'error') console.error(linea);
  else if (nivel === 'warn') console.warn(linea);
  else console.log(linea);
};

export const logInfo = (mensaje: string, contexto: Contexto) =>
  emitir('info', mensaje, contexto);

export const logWarn = (mensaje: string, contexto: Contexto) =>
  emitir('warn', mensaje, contexto);

/**
 * `error` se normaliza acá: en un `catch` puede venir cualquier cosa, y
 * `String(err)` sobre un objeto da "[object Object]", que es exactamente
 * el log que no sirve para nada a las 3 de la mañana.
 */
export const logError = (mensaje: string, error: unknown, contexto: Contexto) =>
  emitir('error', mensaje, {
    ...contexto,
    error:
      error instanceof Error
        ? { nombre: error.name, mensaje: error.message, stack: error.stack }
        : { valor: String(error) },
  });
