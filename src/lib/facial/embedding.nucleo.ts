/**
 * Núcleo del cálculo de descriptores. Corre igual en el hilo principal
 * y dentro de un Web Worker.
 *
 * Qué hace exactamente
 * --------------------
 * Toma un recorte alineado de 150×150 (ver `alineamiento.ts`) y devuelve
 * 128 números: el descriptor. El modelo es la ResNet-34 de dlib
 * (`dlib_face_recognition_resnet_model_v1`), servida desde
 * `/facial/dlib`.
 *
 * Por qué ese modelo y no uno más nuevo
 * -------------------------------------
 * Porque es el único modelo de reconocimiento facial de calidad que está
 * en **dominio público**: su autor lo liberó sin condiciones. ArcFace,
 * AdaFace, FaceNet y EdgeFace son mejores en los benchmarks y todos
 * tienen pesos restringidos a investigación no comercial o licencia
 * comercial aparte. Para un producto que se vende eso no es un detalle
 * a resolver después.
 *
 * Y porque el modelo no era el problema medido: se lo estaba
 * alimentando con recortes sin alinear, con una referencia de
 * enrolamiento de un solo cuadro sin control de calidad, y decidiendo
 * con un cuadro elegido al azar. Eso es lo que arregla este rediseño.
 *
 * Selección de backend
 * --------------------
 * Antes no se elegía ninguno: TF.js tomaba `webgl` y, si fallaba, caía
 * a `cpu`, donde cada inferencia pasa de decenas de milisegundos a
 * segundos. El escalón intermedio —WASM con SIMD— existía en el código
 * pero era inalcanzable: sus binarios `.wasm` no venían en el paquete y
 * el cargador los buscaba en un CDN que la CSP bloquea. Ahora se sirven
 * desde `/facial/tfjs-wasm` y la cadena real es
 * **WebGL → WASM+SIMD → CPU**, con el backend efectivo registrado para
 * que "la tablet va lenta" se pueda distinguir de "no hay luz".
 */

import type * as FaceApi from '@vladmandic/face-api';

const RUTA_MODELO = '/facial/dlib';
const RUTA_WASM = '/facial/tfjs-wasm/';

/** Nombre y versión del modelo, para diagnóstico y reportes. */
export const MODELO_EMBEDDING = 'dlib ResNet-34 v1 (128-D, dominio público)';

/** Lado del recorte que espera el modelo. */
export const LADO_ENTRADA = 150;

export type Backend = 'webgl' | 'wasm' | 'cpu';

/** Orden de preferencia. No se fuerza WebGPU: ver el informe de rediseño. */
const CADENA: Backend[] = ['webgl', 'wasm', 'cpu'];

export interface EstadoEmbedding {
  listo: boolean;
  backend: Backend | null;
  msCarga: number | null;
  error: string | null;
  /**
   * Bitácora corta de la inicialización.
   *
   * Existe porque el camino del Worker es el que más cosas puede romper
   * en un navegador de tablet —`OffscreenCanvas`, la CSP, el entorno de
   * face-api sin `window`— y un `false` pelado no dice cuál de las tres
   * falló. Sin esto, diagnosticar por qué una tablet cayó al hilo
   * principal exigiría conectarle un depurador.
   */
  rastro: string[];
}

interface Tf {
  setBackend: (n: string) => Promise<boolean>;
  getBackend: () => string;
  ready: () => Promise<void>;
  setWasmPaths?: (p: string) => void;
  tidy: <T>(f: () => T) => T;
  browser: { fromPixels: (d: ImageData) => unknown };
  dispose: (t: unknown) => void;
}

let faceapi: typeof FaceApi | null = null;
const estado: EstadoEmbedding = {
  listo: false,
  backend: null,
  msCarga: null,
  error: null,
  rastro: [],
};

export const estadoEmbedding = (): Readonly<EstadoEmbedding> => ({
  ...estado,
  rastro: [...estado.rastro],
});

/**
 * Prepara el entorno de face-api cuando corre dentro de un Worker.
 *
 * face-api decide su entorno mirando `window`, `document` y los
 * `HTMLxxxElement`. En un Worker no existe ninguno, así que se queda sin
 * entorno y `loadFromUri` falla al buscar `fetch`. Se le arma uno a
 * mano con los equivalentes del Worker.
 *
 * Los `createXElement` lanzan a propósito: nada de este camino debería
 * necesitar un `<img>` ni un `<video>`, y si algún día alguien lo
 * necesita es mejor que explote acá, con un mensaje que dice por qué,
 * que en un `undefined is not a function` a mitad de una inferencia.
 */
const prepararEntornoDeWorker = (api: typeof FaceApi): void => {
  // La condición es "face-api se quedó sin entorno", no "no hay
  // `window`".
  //
  // La primera versión preguntaba por `window` y no funcionaba: en el
  // bundle que webpack arma para el Worker, `window` está definido
  // igual, así que el chequeo daba falso, no se armaba el entorno, y
  // `loadFromUri` moría con "getEnv - environment is not defined". El
  // síntoma era que el Worker siempre caía al hilo principal — o sea,
  // que la protección contra el congelamiento de la pantalla no existía,
  // sin que nada lo dijera.
  //
  // `getEnv()` pregunta exactamente lo que importa y no depende de cómo
  // el empaquetador de turno decida shimear los globales.
  try {
    api.env.getEnv();
    return;
  } catch {
    estado.rastro.push('face-api sin entorno: se arma uno de Worker');
  }

  const noDisponible = (que: string) => () => {
    throw new Error(`${que} no existe dentro de un Web Worker.`);
  };

  (api.env as unknown as { setEnv: (e: unknown) => void }).setEnv({
    Canvas: OffscreenCanvas,
    CanvasRenderingContext2D: OffscreenCanvasRenderingContext2D,
    Image: ImageBitmap,
    ImageData,
    Video: class {},
    createCanvasElement: () => new OffscreenCanvas(1, 1),
    createImageElement: noDisponible('<img>'),
    createVideoElement: noDisponible('<video>'),
    fetch: self.fetch.bind(self),
    readFile: noDisponible('readFile'),
  });
};

/** Ruta absoluta: dentro de un Worker, una relativa se resuelve contra el script. */
const absoluta = (ruta: string): string =>
  typeof self !== 'undefined' && self.location
    ? new URL(ruta, self.location.origin).toString()
    : ruta;

let cargando: Promise<boolean> | null = null;

/**
 * Carga el modelo y elige backend. No lanza: devuelve `false`.
 *
 * La promesa fallada **no** se cachea: la versión anterior la dejaba
 * guardada, así que el botón "Reintentar" devolvía siempre la misma
 * promesa rota y no reintentaba nada.
 */
export const cargarEmbedding = async (): Promise<boolean> => {
  if (estado.listo) return true;
  if (cargando) return cargando;

  cargando = (async () => {
    const t0 = performance.now();
    try {
      const api = await import('@vladmandic/face-api');
      prepararEntornoDeWorker(api);
      faceapi = api;

      const tf = api.tf as unknown as Tf;

      // Tiene que ir antes de cualquier `setBackend`: una vez que el
      // backend WASM arrancó, cambiarle la ruta lanza.
      tf.setWasmPaths?.(absoluta(RUTA_WASM));

      for (const backend of CADENA) {
        try {
          if (!(await tf.setBackend(backend))) continue;
          await tf.ready();
          if (tf.getBackend() !== backend) continue;
          estado.backend = backend;
          break;
        } catch {
          // Se prueba el siguiente. Que WebGL no arranque en una tablet
          // es esperable; que eso deje al sistema sin backend, no.
        }
      }

      if (!estado.backend) {
        estado.error = 'Ningún backend de TensorFlow.js pudo inicializarse.';
        return false;
      }

      estado.rastro.push(`backend elegido: ${estado.backend}`);
      await api.nets.faceRecognitionNet.loadFromUri(absoluta(RUTA_MODELO));
      estado.rastro.push('pesos de dlib cargados');

      estado.listo = true;
      estado.error = null;
      estado.msCarga = Math.round(performance.now() - t0);
      return true;
    } catch (e) {
      estado.error = e instanceof Error ? e.message : String(e);
      estado.listo = false;
      return false;
    } finally {
      cargando = null;
    }
  })();

  return cargando;
};

/**
 * Descriptor de 128 números a partir de un recorte ya alineado.
 *
 * Se construye el tensor a mano en vez de pasarle el `ImageData` a
 * face-api porque el camino de face-api pasa por su abstracción de
 * Canvas, que dentro de un Worker no existe. Con el tensor, el modelo
 * recibe exactamente lo mismo por un camino que funciona en los dos
 * lados.
 */
export const calcularDescriptor = async (
  chip: ImageData
): Promise<Float32Array | null> => {
  if (!estado.listo || !faceapi) {
    if (!(await cargarEmbedding())) return null;
  }
  if (!faceapi) return null;

  const tf = faceapi.tf as unknown as Tf;
  const tensor = tf.tidy(() => tf.browser.fromPixels(chip));
  try {
    const descriptor =
      await faceapi.nets.faceRecognitionNet.computeFaceDescriptor(
        tensor as never
      );
    return Array.isArray(descriptor) ? descriptor[0] : descriptor;
  } catch {
    return null;
  } finally {
    tf.dispose(tensor);
  }
};

/**
 * Corre una inferencia sobre un recorte gris para dejar todo compilado.
 *
 * Sin esto, la **primera** persona del día paga la compilación de los
 * shaders de WebGL —fácilmente medio segundo o más en una tablet— y la
 * vive como "la primera vez nunca anda". El calentamiento se hace
 * mientras la cámara se está encendiendo, que es tiempo muerto de todas
 * formas.
 */
export const calentar = async (): Promise<number | null> => {
  if (!(await cargarEmbedding())) return null;
  const pixeles = new Uint8ClampedArray(LADO_ENTRADA * LADO_ENTRADA * 4).fill(
    128
  );
  for (let i = 3; i < pixeles.length; i += 4) pixeles[i] = 255;
  const chip = new ImageData(pixeles, LADO_ENTRADA, LADO_ENTRADA);

  const t0 = performance.now();
  const r = await calcularDescriptor(chip);
  return r ? Math.round(performance.now() - t0) : null;
};
