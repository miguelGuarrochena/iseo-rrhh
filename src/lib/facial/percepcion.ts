/**
 * Capa de percepción: MediaPipe FaceLandmarker.
 *
 * De una sola pasada por cuadro salen las cuatro cosas que el pipeline
 * necesita antes de tocar el modelo de identidad:
 *
 *   - **detección**: si hay cara y cuántas;
 *   - **478 landmarks** para alinear y para medir la pose;
 *   - **52 blendshapes**, de los que se usan los dos de parpadeo;
 *   - seguimiento entre cuadros, que evita volver a correr el detector
 *     cuando la cara ya está enganchada.
 *
 * Qué reemplaza y por qué
 * -----------------------
 * Antes esto eran dos modelos de face-api: `TinyFaceDetector` (193 KB) y
 * `faceLandmark68Net` (357 KB), corridos con una "escalera de pasadas"
 * de 320 → 512 → 608 píxeles. Cuando no encontraba cara —el caso
 * frecuente: la persona todavía se está acercando— corría las tres, o
 * sea hasta 7,2× más píxeles que una pasada resuelta. El presupuesto de
 * tiempo se gastaba justo en los cuadros que no servían.
 *
 * MediaPipe no necesita la escalera: el detector trabaja a 128×128 fijo
 * y, una vez que engancha, deja de correr y sigue por seguimiento. Es el
 * mismo runtime que usa Android nativo, con delegado GPU sobre WebGL2.
 *
 * El otro motivo es de licencias, y no es menor para un producto que se
 * vende: los pesos de `TinyFaceDetector` vienen de WIDER FACE, que es
 * CC BY-NC-ND — "non-commercial". Los de MediaPipe son Apache 2.0
 * declarado por Google, que además es dueño de los datos con los que
 * entrenó.
 *
 * Todo se sirve desde `/facial/mediapipe`, del mismo origen: la CSP
 * tiene `connect-src 'self'` y la tablet de planta puede no tener
 * internet.
 */

import type {
  FaceLandmarker,
  FaceLandmarkerResult,
} from '@mediapipe/tasks-vision';

const RUTA_WASM = '/facial/mediapipe/wasm';
const RUTA_MODELO = '/facial/mediapipe/face_landmarker.task';

/** Nombre del modelo, para el panel de diagnóstico y los reportes. */
export const MODELO_PERCEPCION = 'MediaPipe face_landmarker float16 v1';

export type Delegado = 'GPU' | 'CPU';

export interface EstadoPercepcion {
  listo: boolean;
  delegado: Delegado | null;
  /** Cuánto tardó en cargar e inicializarse, en ms. */
  msCarga: number | null;
  /** ¿El navegador soporta WASM SIMD? Decide qué binario se baja. */
  simd: boolean | null;
  error: string | null;
}

let landmarker: FaceLandmarker | null = null;
let cargando: Promise<FaceLandmarker | null> | null = null;
const estado: EstadoPercepcion = {
  listo: false,
  delegado: null,
  msCarga: null,
  simd: null,
  error: null,
};

export const estadoPercepcion = (): Readonly<EstadoPercepcion> => ({
  ...estado,
});

const OPCIONES_COMUNES = {
  runningMode: 'VIDEO' as const,
  // Dos y no una: con `numFaces: 1` el modelo devuelve la cara más
  // prominente y el sistema no tendría forma de saber que hay alguien
  // más en el encuadre. Pedir dos es lo que permite decir "que quede una
  // sola persona" en vez de fichar a la que el modelo eligió.
  numFaces: 2,
  minFaceDetectionConfidence: 0.5,
  minFacePresenceConfidence: 0.5,
  minTrackingConfidence: 0.5,
  outputFaceBlendshapes: true,
  outputFacialTransformationMatrixes: false,
};

/**
 * Carga el modelo. No lanza: devuelve null y deja el motivo en el estado.
 *
 * No lanzar es deliberado. La versión anterior propagaba la excepción
 * hasta un `catch` genérico que decía "revisá tu conexión" —mandando a
 * buscar el problema al lugar equivocado— y además dejaba la promesa
 * fallada cacheada, así que el botón "Reintentar" devolvía siempre la
 * misma promesa rota.
 */
export const cargarPercepcion = async (): Promise<FaceLandmarker | null> => {
  if (landmarker) return landmarker;
  if (cargando) return cargando;

  cargando = (async () => {
    const t0 = performance.now();
    try {
      const { FilesetResolver, FaceLandmarker: FL } = await import(
        '@mediapipe/tasks-vision'
      );

      estado.simd = await FilesetResolver.isSimdSupported();
      const fileset = await FilesetResolver.forVisionTasks(RUTA_WASM);

      // GPU primero, CPU como red. En Android el delegado GPU va sobre
      // WebGL2 y es varias veces más rápido, pero hay drivers Mali donde
      // la creación del contexto falla. Cuando eso pasa hay que seguir
      // funcionando —más lento, pero funcionando— y **dejar registrado
      // cuál se usó**: sin ese dato, "la tablet va lenta" no se puede
      // distinguir de "no hay luz".
      for (const delegado of ['GPU', 'CPU'] as const) {
        try {
          const creado = await FL.createFromOptions(fileset, {
            ...OPCIONES_COMUNES,
            baseOptions: { modelAssetPath: RUTA_MODELO, delegate: delegado },
          });
          landmarker = creado;
          estado.delegado = delegado;
          estado.listo = true;
          estado.error = null;
          estado.msCarga = Math.round(performance.now() - t0);
          return creado;
        } catch (e) {
          estado.error = e instanceof Error ? e.message : String(e);
        }
      }
      return null;
    } catch (e) {
      estado.error = e instanceof Error ? e.message : String(e);
      return null;
    } finally {
      // Se libera siempre, así el próximo intento vuelve a probar de cero.
      cargando = null;
    }
  })();

  return cargando;
};

export interface CuadroPercibido {
  /** Cuántas caras vio el modelo (tope 2). */
  caras: number;
  /** Malla de la cara principal, en coordenadas normalizadas [0,1]. */
  malla: ReadonlyArray<{ x: number; y: number; z: number }>;
  /** Blendshape de parpadeo del ojo derecho del sujeto, 0-1. */
  parpadeoDerecho: number;
  parpadeoIzquierdo: number;
  /** Cuánto tardó la inferencia, en ms. */
  ms: number;
}

const blendshape = (
  resultado: FaceLandmarkerResult,
  nombre: string
): number => {
  const cat = resultado.faceBlendshapes?.[0]?.categories?.find(
    (c) => c.categoryName === nombre
  );
  return cat?.score ?? 0;
};

/**
 * Procesa un cuadro de vídeo. Es **síncrona**: `detectForVideo` bloquea.
 *
 * Con delegado GPU son entre 5 y 15 ms, que a 15 cuadros por segundo es
 * menos de la cuarta parte del hilo principal. Por eso esta parte se
 * queda acá y no se manda a un Worker: necesita el elemento `<video>`, y
 * mandarlo a un worker obligaría a copiar cada cuadro. Lo que sí se
 * manda a un Worker es el descriptor, que es la operación cara de verdad
 * (ver `embedding.ts`).
 */
export const percibir = (
  video: HTMLVideoElement,
  tsMs: number
): CuadroPercibido | null => {
  if (!landmarker) return null;

  const t0 = performance.now();
  let resultado: FaceLandmarkerResult;
  try {
    resultado = landmarker.detectForVideo(video, tsMs);
  } catch {
    // Un cuadro que el runtime no pudo procesar (el vídeo cambió de
    // tamaño, el contexto se perdió) no es motivo para tirar todo: se
    // saltea y se sigue con el siguiente.
    return null;
  }
  const ms = performance.now() - t0;

  const caras = resultado.faceLandmarks?.length ?? 0;
  if (caras === 0) {
    return {
      caras: 0,
      malla: [],
      parpadeoDerecho: 0,
      parpadeoIzquierdo: 0,
      ms,
    };
  }

  return {
    caras,
    malla: resultado.faceLandmarks[0],
    // MediaPipe nombra los blendshapes desde la anatomía del sujeto,
    // igual que los índices de la malla en `geometria.ts`.
    parpadeoDerecho: blendshape(resultado, 'eyeBlinkRight'),
    parpadeoIzquierdo: blendshape(resultado, 'eyeBlinkLeft'),
    ms,
  };
};

/**
 * Libera el modelo y su contexto WebGL.
 *
 * Importante en el kiosco: la pantalla de fichaje se abre y se cierra
 * decenas de veces por turno. Sin esto queda un contexto WebGL vivo por
 * apertura, y Chrome tiene un tope de contextos por pestaña: al cruzarlo
 * empieza a matar los más viejos y el fichaje "deja de andar" sin que
 * nada lo explique.
 */
export const liberarPercepcion = (): void => {
  try {
    landmarker?.close();
  } catch {
    // Cerrar dos veces, o cerrar algo que ya murió con el contexto, no
    // es un problema que le importe a nadie.
  }
  landmarker = null;
  estado.listo = false;
  estado.delegado = null;
};
