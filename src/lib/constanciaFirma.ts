/**
 * Evidencia de qué documento se firmó.
 *
 * La app ya tenía **firma electrónica**: queda registrado quién firmó y
 * cuándo. Lo que faltaba era atar esa firma a un contenido concreto. Sin
 * eso, si el PDF se reemplaza, el registro sigue diciendo "firmado" y
 * nadie puede notar que el documento no es el mismo.
 *
 * El hash lo resuelve: se calcula sobre los bytes exactos que la persona
 * descargó y tuvo delante al firmar. Después, verificar es volver a
 * calcularlo sobre el archivo y comparar.
 *
 * Las cuatro cosas son distintas y conviene no mezclarlas:
 *
 *  - **firma electrónica**: la persona manifestó su conformidad en la
 *    app. Es lo que ISEO RH hace.
 *  - **evidencia de firma**: quién, cuándo, sobre qué documento.
 *  - **integridad del documento**: el archivo no cambió desde entonces.
 *    Es lo que agrega el hash.
 *  - **firma digital certificada** (Ley 25.506): certificado emitido por
 *    una autoridad certificante licenciada. **ISEO RH no hace esto** y
 *    no lo dice en ningún lado.
 */

/** El algoritmo con el que se calculan las constancias nuevas. */
export const ALGORITMO_HASH = 'SHA-256';

const aHex = (buffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

/**
 * SHA-256 de un archivo, en hexadecimal.
 *
 * Usa WebCrypto, que en un contexto seguro (https, o localhost) está en
 * todos los navegadores que la app soporta. Si no estuviera —http en una
 * red local, por ejemplo— devuelve `null` en vez de improvisar un hash
 * casero: una evidencia con un algoritmo inventado es peor que no tener
 * evidencia, porque parece que la hay.
 *
 * El llamador decide qué hacer con ese `null`. En la firma, la decisión
 * es firmar igual: el derecho del empleado a firmar su recibo no puede
 * depender de que el navegador tenga `crypto.subtle`.
 */
export const hashDeArchivo = async (
  datos: ArrayBuffer | Blob
): Promise<string | null> => {
  try {
    // `globalThis.crypto` es el Web Crypto del entorno (navegador, Node 19+,
    // Edge). El identificador suelto `crypto` en Jest bajo Node 20 apunta
    // al módulo `node:crypto`, que no tiene `.subtle` —el test pasaba en
    // Node 24 (donde el módulo sí lo expone) y devolvía `null` en el CI.
    const sutil = globalThis.crypto?.subtle;
    if (!sutil) return null;
    const buffer = datos instanceof Blob ? await datos.arrayBuffer() : datos;
    return aHex(await sutil.digest('SHA-256', buffer));
  } catch {
    return null;
  }
};

export type ResultadoVerificacion =
  | { estado: 'coincide'; hash: string }
  | { estado: 'no_coincide'; esperado: string; obtenido: string }
  | { estado: 'sin_constancia' }
  | { estado: 'no_verificable' };

/**
 * Compara el archivo actual contra la constancia guardada.
 *
 * - `coincide`: el archivo es exactamente el que se firmó.
 * - `no_coincide`: el archivo cambió después de la firma. Es el caso que
 *   justifica todo esto.
 * - `sin_constancia`: se firmó antes de que existiera el hash. No se
 *   puede afirmar ni desmentir nada; la firma sigue valiendo.
 * - `no_verificable`: no se pudo calcular el hash acá y ahora.
 */
export const verificarConstancia = async (
  archivo: ArrayBuffer | Blob,
  hashGuardado?: string | null
): Promise<ResultadoVerificacion> => {
  if (!hashGuardado) return { estado: 'sin_constancia' };
  const hash = await hashDeArchivo(archivo);
  if (!hash) return { estado: 'no_verificable' };
  return hash === hashGuardado
    ? { estado: 'coincide', hash }
    : { estado: 'no_coincide', esperado: hashGuardado, obtenido: hash };
};

/** Los primeros y últimos dígitos, para mostrarlo sin ocupar la pantalla. */
export const hashCorto = (hash?: string | null): string =>
  hash ? `${hash.slice(0, 8)}…${hash.slice(-8)}` : '—';

/** Qué decir de cada resultado, en una línea. */
export const TEXTO_VERIFICACION: Record<
  ResultadoVerificacion['estado'],
  { titulo: string; detalle: string }
> = {
  coincide: {
    titulo: 'El documento es el que se firmó',
    detalle:
      'El archivo coincide exactamente con el que el colaborador tuvo delante al firmar.',
  },
  no_coincide: {
    titulo: 'El documento NO es el que se firmó',
    detalle:
      'El archivo cambió después de la firma. La constancia sigue siendo válida para el documento original, pero éste no es ese documento.',
  },
  sin_constancia: {
    titulo: 'Firmado sin constancia del documento',
    detalle:
      'Se firmó antes de que la app guardara el hash. La firma vale —quedó quién y cuándo—, pero no se puede verificar el contenido.',
  },
  no_verificable: {
    titulo: 'No se pudo verificar acá',
    detalle:
      'Este navegador no pudo calcular el hash. Probá desde una conexión segura (https).',
  },
};
