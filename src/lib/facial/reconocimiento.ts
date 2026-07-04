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

/** Modelos alojados en CDN (no hace falta bundle ni descargar nada). */
const MODELOS_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';

/**
 * Umbral de distancia euclidiana. Menor = más parecido.
 * 0.5 es el valor recomendado por face-api para el mismo rostro; bajarlo
 * es más estricto (menos falsos positivos, más rechazos).
 */
export const UMBRAL_COINCIDENCIA = 0.5;

let faceapi: typeof FaceApi | null = null;
let modelosCargados = false;
let cargando: Promise<void> | null = null;

/** Carga perezosa de face-api y sus modelos (una sola vez). */
export const cargarModelos = async (): Promise<void> => {
  if (modelosCargados) return;
  if (cargando) return cargando;

  cargando = (async () => {
    faceapi = await import('@vladmandic/face-api');
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODELOS_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODELOS_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODELOS_URL),
    ]);
    modelosCargados = true;
  })();

  return cargando;
};

export type FuenteImagen =
  | HTMLVideoElement
  | HTMLImageElement
  | HTMLCanvasElement;

/**
 * Extrae el descriptor de la cara presente en la imagen/video.
 * Devuelve null si no detecta exactamente un rostro (0 o varios).
 */
export const obtenerDescriptor = async (
  fuente: FuenteImagen
): Promise<Float32Array | null> => {
  await cargarModelos();
  if (!faceapi) return null;

  const opciones = new faceapi.TinyFaceDetectorOptions({
    inputSize: 320,
    scoreThreshold: 0.5,
  });

  const detecciones = await faceapi
    .detectAllFaces(fuente, opciones)
    .withFaceLandmarks()
    .withFaceDescriptors();

  // Exigimos exactamente una cara para evitar ambigüedad.
  if (detecciones.length !== 1) return null;
  return detecciones[0].descriptor;
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
  umbral = UMBRAL_COINCIDENCIA
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
 * Devuelve null si ninguna está dentro del umbral.
 */
export const mejorCoincidencia = (
  descriptor: ArrayLike<number>,
  candidatos: Candidato[],
  umbral = UMBRAL_COINCIDENCIA
): Coincidencia | null => {
  let mejor: Coincidencia | null = null;

  for (const c of candidatos) {
    if (!c.descriptor || c.descriptor.length === 0) continue;
    const d = distancia(descriptor, c.descriptor);
    if (d <= umbral && (!mejor || d < mejor.distancia)) {
      mejor = {
        empleadoId: c.empleadoId,
        distancia: d,
        confianza: Math.max(0, 1 - d / umbral),
      };
    }
  }

  return mejor;
};

/** Float32Array del modelo → number[] para guardar en la base. */
export const aArreglo = (descriptor: Float32Array): number[] =>
  Array.from(descriptor);
