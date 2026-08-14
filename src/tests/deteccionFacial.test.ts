/**
 * Qué cuida este archivo: que la prueba de vida no vuelva a calcular el
 * descriptor facial en cada cuadro.
 *
 * El descriptor sale de `faceRecognitionNet`, una ResNet-34 de 6,4 MB
 * que es alrededor del 85 % del costo de inferencia. Para medir la
 * apertura del ojo alcanzan los landmarks (357 KB). Corriendo el modelo
 * grande en cada cuadro, una tablet Samsung de gama media apenas
 * juntaba los `CUADROS_MINIMOS` dentro de la ventana de 4 segundos, y
 * una que hubiera caído al backend `cpu` no los juntaba nunca: la
 * persona veía "No llegamos a verte bien" y el problema real era que el
 * dispositivo no daba abasto.
 *
 * Es un test de costo, no de resultado, así que mira qué modelos se
 * invocan y no qué devuelven.
 */

const llamadasDetectAllFaces = jest.fn();
const llamadasLandmarks = jest.fn();
const llamadasDescriptores = jest.fn();

/** Cuántas caras devuelve el detector, por `inputSize`. */
let carasPorInputSize: Record<number, number> = {};

const ojo = () => [
  { x: 0, y: 0 },
  { x: 1, y: -1 },
  { x: 2, y: -1 },
  { x: 3, y: 0 },
  { x: 2, y: 1 },
  { x: 1, y: 1 },
];

const cara = () => ({
  descriptor: new Float32Array(128),
  landmarks: { getLeftEye: ojo, getRightEye: ojo },
});

/**
 * face-api encadena tareas que además son promesas: `detectAllFaces()`
 * se puede `await`ear o seguir con `.withFaceLandmarks()`, y eso con
 * `.withFaceDescriptors()`. El doble replica esa forma para poder contar
 * hasta dónde llega cada camino.
 */
const tareaConDescriptores = (caras: unknown[]) => {
  const p = Promise.resolve(caras) as Promise<unknown[]> & {
    withFaceDescriptors: () => Promise<unknown[]>;
  };
  p.withFaceDescriptors = () => {
    llamadasDescriptores();
    return Promise.resolve(caras);
  };
  return p;
};

const tareaDeteccion = (caras: unknown[]) => {
  const p = Promise.resolve(caras) as Promise<unknown[]> & {
    withFaceLandmarks: () => ReturnType<typeof tareaConDescriptores>;
  };
  p.withFaceLandmarks = () => {
    llamadasLandmarks();
    return tareaConDescriptores(caras);
  };
  return p;
};

jest.mock('@vladmandic/face-api', () => ({
  nets: {
    tinyFaceDetector: { loadFromUri: jest.fn().mockResolvedValue(undefined) },
    faceLandmark68Net: { loadFromUri: jest.fn().mockResolvedValue(undefined) },
    faceRecognitionNet: { loadFromUri: jest.fn().mockResolvedValue(undefined) },
  },
  TinyFaceDetectorOptions: class {
    inputSize: number;
    constructor(opciones: { inputSize: number }) {
      this.inputSize = opciones.inputSize;
    }
  },
  detectAllFaces: (_fuente: unknown, opciones: { inputSize: number }) => {
    llamadasDetectAllFaces(opciones.inputSize);
    const cuantas = carasPorInputSize[opciones.inputSize] ?? 0;
    return tareaDeteccion(Array.from({ length: cuantas }, cara));
  },
}));

import { detectarOjos, detectarRostro } from '@/lib/facial/reconocimiento';

/** El elemento de video no se toca: el doble ignora la fuente. */
const video = {} as HTMLVideoElement;

beforeEach(() => {
  llamadasDetectAllFaces.mockClear();
  llamadasLandmarks.mockClear();
  llamadasDescriptores.mockClear();
  carasPorInputSize = { 320: 1, 512: 1, 608: 1 };
});

describe('detectarOjos (prueba de vida)', () => {
  it('NO calcula el descriptor: para el EAR alcanzan los landmarks', async () => {
    const cuadro = await detectarOjos(video);

    expect(cuadro).not.toBeNull();
    expect(llamadasLandmarks).toHaveBeenCalledTimes(1);
    expect(llamadasDescriptores).not.toHaveBeenCalled();
  });

  it('devuelve los dos ojos, que es lo que consume el EAR', async () => {
    const cuadro = await detectarOjos(video);

    expect(cuadro?.ojos.izquierdo).toHaveLength(6);
    expect(cuadro?.ojos.derecho).toHaveLength(6);
  });

  it('informa qué pasada resolvió, para reusarla en el cuadro siguiente', async () => {
    // La barata no encuentra nada; la del medio sí.
    carasPorInputSize = { 320: 0, 512: 1, 608: 1 };

    const cuadro = await detectarOjos(video);

    expect(cuadro?.pasada).toBe(1);
    expect(llamadasDetectAllFaces).toHaveBeenNthCalledWith(1, 320);
    expect(llamadasDetectAllFaces).toHaveBeenNthCalledWith(2, 512);
  });

  it('empezando por la pasada que ya funcionó, resuelve en un solo intento', async () => {
    carasPorInputSize = { 320: 0, 512: 1, 608: 1 };

    const cuadro = await detectarOjos(video, 1);

    expect(cuadro?.pasada).toBe(1);
    // Esto es el ahorro: sin la preferencia volvía a probar 320 —que se
    // sabe que falla— antes de llegar a la que sirve.
    expect(llamadasDetectAllFaces).toHaveBeenCalledTimes(1);
    expect(llamadasDetectAllFaces).toHaveBeenCalledWith(512);
  });

  it('con la pasada preferida agotada sigue probando las otras', async () => {
    carasPorInputSize = { 320: 1, 512: 0, 608: 0 };

    const cuadro = await detectarOjos(video, 1);

    expect(cuadro?.pasada).toBe(0);
  });

  it('con dos caras en el cuadro no promedia nada: sigue buscando', async () => {
    carasPorInputSize = { 320: 2, 512: 2, 608: 2 };

    expect(await detectarOjos(video)).toBeNull();
  });

  it('sin ninguna cara devuelve null y no rompe el bucle', async () => {
    carasPorInputSize = { 320: 0, 512: 0, 608: 0 };

    expect(await detectarOjos(video)).toBeNull();
  });
});

describe('detectarRostro (captura para fichar)', () => {
  it('sí calcula el descriptor: es el dato que se manda al servidor', async () => {
    const r = await detectarRostro(video);

    expect(r.ok).toBe(true);
    expect(llamadasDescriptores).toHaveBeenCalledTimes(1);
  });

  it('con varias caras no insiste: hay que despejar el encuadre', async () => {
    carasPorInputSize = { 320: 3, 512: 3, 608: 3 };

    const r = await detectarRostro(video);

    expect(r).toMatchObject({ ok: false, motivo: 'varias_caras', caras: 3 });
    expect(llamadasDetectAllFaces).toHaveBeenCalledTimes(1);
  });
});
