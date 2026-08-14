/**
 * Reconocimiento facial en el dispositivo con face-api.js.
 *
 * La cara nunca sale del navegador: se convierte en un "descriptor"
 * (128 números) que es lo único que se guarda. Comparar dos descriptores
 * dice qué tan parecidas son dos caras, sin poder reconstruir la imagen.
 *
 * - Enrolar: se guarda el descriptor del empleado (una vez).
 * - Fichar 1:1 (celular): se compara la cara contra el descriptor de ese
 *   empleado ya identificado por su sesión.
 * - Fichar 1:N (tablet): se busca la mejor coincidencia entre todos los
 *   descriptores de la empresa.
 */

import type * as FaceApi from '@vladmandic/face-api';
import type { Punto } from './liveness';

/**
 * Modelos servidos por la propia app desde `public/models`.
 *
 * Antes se bajaban de un CDN (jsdelivr). No funcionaba nunca en
 * producción: la CSP de `next.config.js` tiene `connect-src 'self'` +
 * Supabase, así que el navegador bloqueaba el fetch de los pesos. Los
 * modelos no cargaban, `detectarRostro` explotaba y la pantalla mostraba
 * "revisá tu conexión", que mandaba a buscar el problema al lugar
 * equivocado.
 *
 * Servirlos desde el mismo origen además resuelve el caso real de uso:
 * la tablet de planta, que puede tener internet malo o bloqueado, y
 * ahora los cachea con el resto de los assets.
 */
const MODELOS_URL = '/models';

/**
 * Umbrales de distancia euclidiana. Menor = más parecido.
 *
 * Se usan dos, porque los dos escenarios corren riesgos distintos:
 *
 * - **Verificar (1:1, celular)**: la sesión ya dice quién sos; la cara
 *   solo confirma. Un solo intento de comparación, así que se usa 0.6,
 *   el valor por defecto de face-api. Con 0.5 rebotaban personas
 *   legítimas que se habían enrolado con otra luz u otro dispositivo.
 * - **Identificar (1:N, tablet)**: hay que elegir entre N caras, y cada
 *   candidato es una chance más de equivocarse. Se mantiene 0.5.
 */
export const UMBRAL_VERIFICACION = 0.6;
export const UMBRAL_IDENTIFICACION = 0.5;

/**
 * Diferencia mínima entre el mejor y el segundo candidato en 1:N. Si dos
 * personas dan parecido (hermanos, gemelos, mala foto), es preferible no
 * fichar a fichar al equivocado.
 */
export const MARGEN_MINIMO = 0.05;

/** @deprecated Usar UMBRAL_VERIFICACION o UMBRAL_IDENTIFICACION. */
export const UMBRAL_COINCIDENCIA = UMBRAL_IDENTIFICACION;

let faceapi: typeof FaceApi | null = null;
let modelosCargados = false;
let cargando: Promise<void> | null = null;

/**
 * Carga perezosa de face-api y sus modelos (una sola vez).
 *
 * No lanza: devuelve `false` si no pudo. Antes propagaba la excepción y
 * terminaba en un `catch` genérico que culpaba a la conexión, y además
 * dejaba la promesa fallada cacheada en `cargando`: el botón
 * "Reintentar" no reintentaba nada porque se le devolvía siempre la
 * misma promesa rota.
 */
export const cargarModelos = async (): Promise<boolean> => {
  if (modelosCargados) return true;
  if (cargando) {
    await cargando;
    return modelosCargados;
  }

  cargando = (async () => {
    try {
      faceapi = await import('@vladmandic/face-api');
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODELOS_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODELOS_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODELOS_URL),
      ]);
      modelosCargados = true;
    } catch {
      modelosCargados = false;
    } finally {
      // Se libera siempre, así el próximo intento vuelve a probar.
      cargando = null;
    }
  })();

  await cargando;
  return modelosCargados;
};

export type FuenteImagen =
  | HTMLVideoElement
  | HTMLImageElement
  | HTMLCanvasElement;

/** Por qué no se pudo sacar el descriptor. Sirve para explicarlo bien. */
export type MotivoSinDescriptor = 'sin_modelos' | 'sin_cara' | 'varias_caras';

export type ResultadoDeteccion =
  | {
      ok: true;
      descriptor: Float32Array;
      caras: 1;
      /**
       * Puntos de los ojos, para la prueba de vida (`lib/facial/liveness`).
       * Vienen del mismo pase de detección: pedirlos aparte significaría
       * correr los modelos dos veces sobre el mismo cuadro.
       */
      ojos: { izquierdo: Punto[]; derecho: Punto[] };
    }
  | { ok: false; motivo: MotivoSinDescriptor; caras: number };

/**
 * Pasadas de detección, de la más barata a la más tolerante. Si la
 * primera no encuentra nada se reintenta con más resolución y menos
 * exigencia: es lo que salva a las tablets con cámara pobre, a la
 * persona parada lejos y a la oficina con poca luz.
 */
const PASADAS = [
  { inputSize: 320, scoreThreshold: 0.5 },
  { inputSize: 512, scoreThreshold: 0.3 },
  { inputSize: 608, scoreThreshold: 0.2 },
];

/**
 * Índices de `PASADAS` empezando por la que ya funcionó.
 *
 * En un bucle de cuadros consecutivos, la pasada que resolvió el cuadro
 * anterior es casi siempre la que va a resolver el siguiente: la luz y
 * la distancia no cambian en 180 ms. Probarla primero evita repetir las
 * pasadas baratas que ya se sabe que fallan, que es donde se iba la
 * mitad del presupuesto de tiempo en las tablets.
 */
const ordenDePasadas = (preferida: number): number[] => {
  const resto = PASADAS.map((_, i) => i).filter((i) => i !== preferida);
  return [preferida, ...resto];
};

/**
 * Backend de TensorFlow.js con el que quedaron corriendo los modelos.
 *
 * Es el dato que decide si una tablet lenta es un problema de cámara o
 * de cómputo: con `webgl` la inferencia va por GPU, con `cpu` va por
 * JavaScript puro y cada detección pasa de decenas de milisegundos a
 * varios segundos. Hasta ahora eso no se registraba en ningún lado, así
 * que "no anda en la Samsung" no se podía distinguir de "no hay luz".
 *
 * Devuelve null si los modelos todavía no se cargaron.
 */
export const backendFacial = (): string | null => {
  if (!faceapi || !modelosCargados) return null;
  try {
    // `getBackend` existe en el tfjs que face-api empaqueta, pero el
    // paquete no lo re-exporta en sus tipos (sólo declara el subconjunto
    // de operaciones que usa). El cast es sobre eso, no sobre una API
    // que pueda no estar.
    const tf = faceapi.tf as unknown as { getBackend?: () => string };
    return tf.getBackend?.() ?? null;
  } catch {
    return null;
  }
};

/**
 * Extrae el descriptor de la cara presente en la imagen/video.
 * Devuelve el motivo cuando no hay exactamente un rostro, para que la
 * pantalla pueda decir qué corregir en vez de un "no te reconocimos".
 */
export const detectarRostro = async (
  fuente: FuenteImagen
): Promise<ResultadoDeteccion> => {
  const listos = await cargarModelos();
  if (!listos || !faceapi)
    return { ok: false, motivo: 'sin_modelos', caras: 0 };

  let ultimasCaras = 0;
  for (const pasada of PASADAS) {
    const detecciones = await faceapi
      .detectAllFaces(fuente, new faceapi.TinyFaceDetectorOptions(pasada))
      .withFaceLandmarks()
      .withFaceDescriptors();

    ultimasCaras = detecciones.length;
    if (detecciones.length === 1) {
      const cara = detecciones[0];
      return {
        ok: true,
        descriptor: cara.descriptor,
        caras: 1,
        ojos: {
          izquierdo: cara.landmarks.getLeftEye(),
          derecho: cara.landmarks.getRightEye(),
        },
      };
    }
    // Con varias caras no sirve insistir: hay que despejar el encuadre.
    if (detecciones.length > 1) {
      return { ok: false, motivo: 'varias_caras', caras: detecciones.length };
    }
  }

  return { ok: false, motivo: 'sin_cara', caras: ultimasCaras };
};

export interface OjosDeCuadro {
  ojos: { izquierdo: Punto[]; derecho: Punto[] };
  /** Pasada que resolvió este cuadro, para probarla primero en el siguiente. */
  pasada: number;
}

/**
 * Sólo los ojos de un cuadro: detector + landmarks, **sin descriptor**.
 *
 * Es la mitad cara de `detectarRostro`. El descriptor sale de
 * `faceRecognitionNet`, una ResNet-34 de 6,4 MB que es alrededor del
 * 85 % del costo de inferencia — y para medir la apertura del ojo (EAR)
 * no hace falta: alcanza con `faceLandmark68Net`, que pesa 357 KB.
 *
 * Por qué importa: la prueba de vida corre un cuadro cada 180 ms durante
 * 4 segundos y necesita juntar al menos `CUADROS_MINIMOS`. Calculando el
 * descriptor en cada cuadro, una tablet de gama media apenas llegaba al
 * mínimo y una que cayó al backend `cpu` no llegaba nunca: la persona
 * veía "No llegamos a verte bien" y se le echaba la culpa a la luz o a
 * la pose cuando el problema era que el dispositivo no daba abasto.
 *
 * `pasadaPreferida` viene del cuadro anterior; ver `ordenDePasadas`.
 */
export const detectarOjos = async (
  fuente: FuenteImagen,
  pasadaPreferida = 0
): Promise<OjosDeCuadro | null> => {
  const listos = await cargarModelos();
  if (!listos || !faceapi) return null;

  for (const i of ordenDePasadas(pasadaPreferida)) {
    const detecciones = await faceapi
      .detectAllFaces(fuente, new faceapi.TinyFaceDetectorOptions(PASADAS[i]))
      .withFaceLandmarks();

    // Con más de una cara el EAR promedio no dice nada de nadie.
    if (detecciones.length !== 1) continue;
    const cara = detecciones[0];
    return {
      ojos: {
        izquierdo: cara.landmarks.getLeftEye(),
        derecho: cara.landmarks.getRightEye(),
      },
      pasada: i,
    };
  }

  return null;
};

/**
 * Igual que `detectarRostro` pero devuelve solo el descriptor.
 * Se mantiene por compatibilidad con el código que ya la usaba.
 */
export const obtenerDescriptor = async (
  fuente: FuenteImagen
): Promise<Float32Array | null> => {
  const r = await detectarRostro(fuente);
  return r.ok ? r.descriptor : null;
};

/** Distancia euclidiana entre dos descriptores (menor = más parecido). */
export const distancia = (
  a: ArrayLike<number>,
  b: ArrayLike<number>
): number => {
  let suma = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    suma += d * d;
  }
  return Math.sqrt(suma);
};

/** ¿Las dos caras son la misma persona? (comparación 1:1). */
export const coincide = (
  a: ArrayLike<number>,
  b: ArrayLike<number>,
  umbral = UMBRAL_VERIFICACION
): boolean => distancia(a, b) <= umbral;

export interface Candidato {
  empleadoId: string;
  descriptor: number[];
}

export interface Coincidencia {
  empleadoId: string;
  distancia: number;
  /** 0 a 1: qué tan confiable es (1 = idéntico). */
  confianza: number;
}

/**
 * Busca la mejor coincidencia entre varios candidatos (identificación 1:N).
 *
 * Devuelve null si ninguna entra en el umbral, y también si el mejor y el
 * segundo están demasiado cerca entre sí: ante la duda es preferible
 * pedir otro intento antes que fichar a la persona equivocada.
 */
export const mejorCoincidencia = (
  descriptor: ArrayLike<number>,
  candidatos: Candidato[],
  umbral = UMBRAL_IDENTIFICACION,
  margen = MARGEN_MINIMO
): Coincidencia | null => {
  let mejor: { empleadoId: string; distancia: number } | null = null;
  let segunda = Infinity;

  for (const c of candidatos) {
    if (!c.descriptor || c.descriptor.length === 0) continue;
    const d = distancia(descriptor, c.descriptor);
    if (!mejor || d < mejor.distancia) {
      if (mejor) segunda = mejor.distancia;
      mejor = { empleadoId: c.empleadoId, distancia: d };
    } else if (d < segunda) {
      segunda = d;
    }
  }

  if (!mejor || mejor.distancia > umbral) return null;
  if (segunda - mejor.distancia < margen) return null;

  return {
    empleadoId: mejor.empleadoId,
    distancia: mejor.distancia,
    confianza: Math.max(0, 1 - mejor.distancia / umbral),
  };
};

/** Float32Array del modelo → number[] para guardar en la base. */
export const aArreglo = (descriptor: Float32Array): number[] =>
  Array.from(descriptor);
