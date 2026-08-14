/**
 * Apertura de la cámara frontal.
 *
 * Está separado del componente porque la herramienta de diagnóstico
 * necesita exactamente la misma cámara, con las mismas restricciones,
 * que el fichaje real. Si el banco de pruebas abriera la cámara distinto
 * mediría otra cosa, y las conclusiones no se podrían trasladar.
 */

export type FallaCamara =
  | 'sin_camara'
  | 'permiso_denegado'
  | 'sin_https'
  | 'camara_ocupada';

export const MENSAJE_FALLA: Record<FallaCamara, string> = {
  permiso_denegado:
    'Necesitamos permiso para usar la cámara. Habilitalo en el candado de la barra de direcciones y reintentá.',
  sin_https:
    'El navegador solo habilita la cámara en sitios seguros (https). Entrá por la dirección https:// de la app, no por la IP de la red.',
  camara_ocupada:
    'La cámara está siendo usada por otra aplicación. Cerrala y reintentá.',
  sin_camara: 'No pudimos acceder a la cámara de este dispositivo.',
};

/**
 * Restricciones de captura.
 *
 * Qué cambió respecto de la versión anterior y por qué
 * ---------------------------------------------------
 * Antes se pedía `{ width: 640, height: 480 }` sin `ideal`. En la
 * gramática de `getUserMedia` un número suelto es un deseo, no un
 * requisito: el navegador entrega lo que el driver prefiera. Y nadie
 * leía después qué había entregado, así que todas las métricas que se
 * normalizan por el ancho del cuadro se calculaban sobre un número
 * inventado.
 *
 * Ahora se pide 1280×720 como ideal. Más resolución sirve de verdad acá:
 * la cámara frontal de una tablet es gran angular, así que a la
 * distancia normal de un kiosco la cara ocupa una fracción chica del
 * cuadro. Con 640 de ancho, una cara a un metro deja unos 45 píxeles
 * entre los ojos —el piso de lo que el modelo puede usar—; con 1280,
 * unos 90. El costo es casi nulo porque el detector trabaja a 128×128
 * fijo: la resolución alta se usa para el **recorte alineado**, que es
 * donde se necesita el detalle.
 *
 * `frameRate: 24` como ideal, no 30: el bucle procesa hasta 15 cuadros
 * por segundo, así que pedir 30 sólo hace que el sensor y el ISP
 * trabajen —y calienten— para producir cuadros que se descartan. En una
 * tablet que tiene que aguantar ocho horas de kiosco, eso importa.
 */
export const RESTRICCIONES: MediaStreamConstraints = {
  video: {
    facingMode: 'user',
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 24, max: 30 },
  },
  audio: false,
};

export interface CamaraAbierta {
  stream: MediaStream;
  ancho: number;
  alto: number;
  fps: number | null;
}

export type ResultadoCamara =
  | { ok: true; camara: CamaraAbierta }
  | { ok: false; falla: FallaCamara };

/**
 * Abre la cámara y devuelve la configuración **real** que quedó.
 *
 * Distingue las cuatro fallas que tienen remedios distintos. La versión
 * anterior las agrupaba en "sin cámara", que en la tablet de planta
 * mandaba a buscar un problema de hardware cuando lo que pasaba era que
 * se había entrado por la IP de la red en vez de por https.
 */
export const abrirCamara = async (): Promise<ResultadoCamara> => {
  if (
    typeof navigator === 'undefined' ||
    !navigator.mediaDevices?.getUserMedia
  ) {
    // En contexto inseguro el navegador ni siquiera expone
    // `mediaDevices`, así que este chequeo tiene que ir antes de
    // intentar nada.
    return {
      ok: false,
      falla:
        typeof window !== 'undefined' && window.isSecureContext === false
          ? 'sin_https'
          : 'sin_camara',
    };
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia(RESTRICCIONES);
    const s = stream.getVideoTracks()[0]?.getSettings?.() ?? {};
    return {
      ok: true,
      camara: {
        stream,
        ancho: s.width ?? 0,
        alto: s.height ?? 0,
        fps: s.frameRate ?? null,
      },
    };
  } catch (err) {
    const nombre = err instanceof DOMException ? err.name : '';
    if (nombre === 'NotAllowedError' || nombre === 'SecurityError') {
      return {
        ok: false,
        falla:
          typeof window !== 'undefined' && window.isSecureContext === false
            ? 'sin_https'
            : 'permiso_denegado',
      };
    }
    if (nombre === 'NotReadableError' || nombre === 'AbortError') {
      return { ok: false, falla: 'camara_ocupada' };
    }
    return { ok: false, falla: 'sin_camara' };
  }
};

export const cerrarCamara = (stream: MediaStream | null): void => {
  stream?.getTracks().forEach((t) => t.stop());
};
