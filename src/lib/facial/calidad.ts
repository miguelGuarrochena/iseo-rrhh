/**
 * Puerta de calidad: decide si vale la pena gastar una inferencia del
 * modelo de reconocimiento en este cuadro.
 *
 * Por qué existe
 * --------------
 * El sistema anterior no elegía cuadro: miraba a la persona 4 segundos
 * buscando un parpadeo y después calculaba el descriptor sobre **el
 * cuadro que hubiera** en ese momento. Podía ser uno movido, uno con la
 * cara girada, o uno tomado justo mientras la persona bajaba la vista.
 * Y ese descriptor de calidad azarosa era el que decidía si la persona
 * fichaba o no.
 *
 * Un descriptor sacado de un cuadro malo no es "un poco peor": está
 * corrido en el espacio de 128 dimensiones por un motivo que no tiene
 * nada que ver con la identidad. Es la causa de los dos errores que más
 * molestan al mismo tiempo — que no reconozca a quien es, y que alguna
 * vez se acerque demasiado a otro.
 *
 * Todo acá es función pura: entra un cuadro descripto por números, sale
 * un veredicto. Sin cámara, sin modelos, sin DOM.
 */

import type { Pose, Referencias } from './geometria';

/**
 * Umbrales de la puerta.
 *
 * Los que están en unidades físicas (grados, luma 0-255) son los mismos
 * en cualquier dispositivo. Los que son índices sin unidad —`yaw`,
 * `pitch`, `nitidez`— se calibran con la herramienta de diagnóstico
 * sobre la tablet real; los valores de acá son el punto de partida
 * documentado, no un número que alguien eligió y nadie volvió a mirar.
 */
export const UMBRALES = {
  /**
   * Distancia interocular / ancho del cuadro.
   *
   * Con la captura a 1280 de ancho, 0,075 son 96 píxeles entre los ojos:
   * el piso de lo que la ResNet puede aprovechar. `tamanoComodo` (0,11 =
   * 140 px) es donde deja de mejorar; por encima de `tamanoAmplio` la
   * cara empieza a salirse del encuadre y la lente de gran angular la
   * deforma.
   */
  tamanoMinimo: 0.075,
  tamanoComodo: 0.11,
  tamanoAmplio: 0.25,
  tamanoMaximo: 0.32,
  /** Distancia del centro de la cara al centro del cuadro, / ancho. */
  desvioMaximo: 0.24,
  rollMaximoGrados: 15,
  yawMaximo: 0.16,
  pitchMaximo: 0.2,
  /** Blendshape de parpadeo por encima de esto = ojo cerrado. */
  ojoCerrado: 0.55,
  lumaMinima: 55,
  lumaMaxima: 205,
  contrasteMinimo: 22,
  /** Varianza del laplaciano normalizada por el contraste. */
  nitidezMinima: 0.012,
  /** Desplazamiento del centro entre cuadros, / ancho del cuadro. */
  movimientoMaximo: 0.03,
} as const;

export type MotivoRechazo =
  | 'sin_rostro'
  | 'varios_rostros'
  | 'lejos'
  | 'cerca'
  | 'descentrado'
  | 'inclinado'
  | 'de_perfil'
  | 'cabeza_baja'
  | 'ojos_cerrados'
  | 'oscuro'
  | 'quemado'
  | 'sin_contraste'
  | 'movido'
  | 'borroso';

/** Texto que ve la persona. Uno por motivo: nada de "no te reconocimos". */
export const MENSAJE_MOTIVO: Record<MotivoRechazo, string> = {
  sin_rostro: 'Buscando tu rostro…',
  varios_rostros: 'Que quede una sola persona frente a la cámara',
  lejos: 'Acercate un poco',
  cerca: 'Alejate un poco',
  descentrado: 'Centrá tu cara en el óvalo',
  inclinado: 'Enderezá la cabeza',
  de_perfil: 'Mirá de frente a la cámara',
  cabeza_baja: 'Levantá un poco la vista',
  ojos_cerrados: 'Abrí los ojos',
  oscuro: 'Falta luz: buscá un lugar más iluminado',
  quemado: 'Hay demasiada luz de fondo: date vuelta o corré la lámpara',
  sin_contraste: 'La imagen sale plana: probá con otra luz',
  movido: 'Quedate quieto un segundo',
  borroso: 'La imagen sale borrosa: quedate quieto y limpiá la cámara',
};

export interface EstadisticasImagen {
  /** Luminancia media, 0-255. */
  luma: number;
  /** Desvío estándar de la luminancia. Es el contraste. */
  contraste: number;
  /**
   * Varianza del laplaciano dividida por la varianza de la luma.
   *
   * La varianza del laplaciano sola mide "cuánto borde hay", que sube
   * tanto con la nitidez como con el contraste: una cara nítida con poca
   * luz daba el mismo número que una borrosa bien iluminada. Dividiendo
   * por el contraste queda un índice que responde a la nitidez y casi no
   * a la iluminación.
   */
  nitidez: number;
}

/**
 * Estadísticas de un recorte ya alineado (RGBA, como lo da
 * `getImageData`).
 *
 * Se calcula sobre el recorte y no sobre el cuadro completo a propósito:
 * el fondo no aporta nada sobre si la **cara** está bien expuesta o
 * enfocada, y en una planta el fondo suele ser una ventana que arruina
 * el promedio. Además el recorte ya está normalizado en escala, así que
 * el índice de nitidez es comparable entre una persona cerca y otra
 * lejos.
 */
export const estadisticasDeImagen = (
  rgba: Uint8ClampedArray | Uint8Array,
  ancho: number,
  alto: number
): EstadisticasImagen => {
  const n = ancho * alto;
  if (n === 0 || rgba.length < n * 4) {
    return { luma: 0, contraste: 0, nitidez: 0 };
  }

  const gris = new Float32Array(n);
  let suma = 0;
  for (let i = 0; i < n; i++) {
    const j = i * 4;
    // Coeficientes Rec. 601: es la luma perceptual, no el promedio RGB.
    const g = 0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2];
    gris[i] = g;
    suma += g;
  }
  const media = suma / n;

  let varianza = 0;
  for (let i = 0; i < n; i++) {
    const d = gris[i] - media;
    varianza += d * d;
  }
  varianza /= n;

  // Laplaciano de 4 vecinos, sin los bordes (donde el núcleo no entra).
  let sumaLap = 0;
  let sumaLap2 = 0;
  let cuenta = 0;
  for (let y = 1; y < alto - 1; y++) {
    for (let x = 1; x < ancho - 1; x++) {
      const i = y * ancho + x;
      const lap =
        gris[i - 1] +
        gris[i + 1] +
        gris[i - ancho] +
        gris[i + ancho] -
        4 * gris[i];
      sumaLap += lap;
      sumaLap2 += lap * lap;
      cuenta++;
    }
  }

  const varLap = cuenta > 0 ? sumaLap2 / cuenta - (sumaLap / cuenta) ** 2 : 0;

  return {
    luma: media,
    contraste: Math.sqrt(varianza),
    // El +1 evita dividir por cero en un recorte de un solo tono (una
    // pared, una cámara tapada), donde la nitidez no está definida.
    nitidez: varLap / (varianza + 1),
  };
};

export interface EntradaCalidad {
  referencias: Referencias;
  pose: Pose;
  estadisticas: EstadisticasImagen;
  anchoCuadro: number;
  altoCuadro: number;
  /** Blendshapes de parpadeo (0 = ojo abierto, 1 = cerrado). */
  parpadeoDerecho: number;
  parpadeoIzquierdo: number;
  /** Centro de la cara en el cuadro anterior, si lo hubo. */
  centroAnterior?: { x: number; y: number } | null;
}

export interface Veredicto {
  ok: boolean;
  /** 0 a 1. Sirve para quedarse con los mejores cuadros, no sólo con los que pasan. */
  puntaje: number;
  motivo: MotivoRechazo | null;
  /** Métricas crudas, para el modo diagnóstico. */
  metricas: {
    tamano: number;
    desvio: number;
    rollGrados: number;
    yaw: number;
    pitch: number;
    ojos: number;
    luma: number;
    contraste: number;
    nitidez: number;
    movimiento: number;
  };
}

export interface EntradaGeometria {
  referencias: Referencias;
  pose: Pose;
  anchoCuadro: number;
  altoCuadro: number;
  parpadeoDerecho: number;
  parpadeoIzquierdo: number;
  centroAnterior?: { x: number; y: number } | null;
}

/**
 * Mitad barata de la puerta: todo lo que se decide con los landmarks,
 * sin mirar un solo píxel.
 *
 * Existe para no pagar el recorte alineado en cuadros que ya se sabe que
 * no sirven. Extraer el recorte cuesta un `drawImage` más un
 * `getImageData` de 150×150 —alrededor de un milisegundo— y la mayoría
 * de los cuadros de una sesión real se descartan por geometría: la
 * persona todavía se está acercando, está mirando el teclado, se está
 * acomodando. Cobrar ese milisegundo por cuadro descartado es tirar la
 * mitad del presupuesto en cuadros que no van a usarse.
 */
export const evaluarGeometria = (
  e: EntradaGeometria
): { ok: boolean; motivo: MotivoRechazo | null } => {
  const { referencias: r, pose } = e;
  const centro = centroDeReferencias(r);
  const tamano = r.interocular / e.anchoCuadro;
  const desvio = desvioDelCentro(centro, e.anchoCuadro, e.altoCuadro);
  const ojos = Math.max(e.parpadeoDerecho, e.parpadeoIzquierdo);
  const movimiento = movimientoDe(centro, e.centroAnterior, e.anchoCuadro);

  const motivo: MotivoRechazo | null =
    tamano < UMBRALES.tamanoMinimo
      ? 'lejos'
      : tamano > UMBRALES.tamanoMaximo
        ? 'cerca'
        : desvio > UMBRALES.desvioMaximo
          ? 'descentrado'
          : Math.abs(pose.rollGrados) > UMBRALES.rollMaximoGrados
            ? 'inclinado'
            : Math.abs(pose.yaw) > UMBRALES.yawMaximo
              ? 'de_perfil'
              : Math.abs(pose.pitch) > UMBRALES.pitchMaximo
                ? 'cabeza_baja'
                : ojos > UMBRALES.ojoCerrado
                  ? 'ojos_cerrados'
                  : movimiento > UMBRALES.movimientoMaximo
                    ? 'movido'
                    : null;

  return { ok: motivo === null, motivo };
};

const centroDeReferencias = (r: Referencias) => ({
  x: (r.ojoDerecho.x + r.ojoIzquierdo.x + r.boca.x) / 3,
  y: (r.ojoDerecho.y + r.ojoIzquierdo.y + r.boca.y) / 3,
});

const desvioDelCentro = (
  centro: { x: number; y: number },
  ancho: number,
  alto: number
): number => Math.hypot(centro.x - ancho / 2, centro.y - alto / 2) / ancho;

const movimientoDe = (
  centro: { x: number; y: number },
  anterior: { x: number; y: number } | null | undefined,
  ancho: number
): number =>
  anterior
    ? Math.hypot(centro.x - anterior.x, centro.y - anterior.y) / ancho
    : 0;

/** 1 en el valor ideal, cayendo a 0 en el límite. */
const puntajeBanda = (
  valor: number,
  minimo: number,
  maximo: number
): number => {
  const centro = (minimo + maximo) / 2;
  const radio = (maximo - minimo) / 2;
  if (radio <= 0) return 0;
  return Math.max(0, 1 - Math.abs(valor - centro) / radio);
};

/** 1 mientras |valor| sea chico, 0 al llegar al límite. */
const puntajeLimite = (valor: number, limite: number): number =>
  limite <= 0 ? 0 : Math.max(0, 1 - Math.abs(valor) / limite);

/**
 * 1 en toda una meseta, cayendo a 0 en los dos extremos.
 *
 * Hace falta porque no toda métrica tiene su óptimo en el medio del
 * rango tolerado. El tamaño de la cara es el caso: entre 0,11 y 0,25 el
 * modelo anda igual de bien, y usar el punto medio del rango completo
 * como "ideal" castigaba a una cara perfectamente encuadrada sólo por no
 * estar pegada a la cámara. Ese puntaje bajo después se propagaba a la
 * selección de los mejores cuadros y a la plantilla.
 */
const puntajeMeseta = (
  valor: number,
  minimo: number,
  bajo: number,
  alto: number,
  maximo: number
): number => {
  if (valor <= minimo || valor >= maximo) return 0;
  if (valor < bajo) return (valor - minimo) / (bajo - minimo);
  if (valor > alto) return (maximo - valor) / (maximo - alto);
  return 1;
};

/**
 * Evalúa un cuadro.
 *
 * El orden de los chequeos no es casual: es el orden en el que conviene
 * pedirle cosas a la persona. Primero lo que resuelve sola y de una
 * (acercarse, centrarse, enderezarse), después lo del ambiente (luz), y
 * al final lo que sólo se arregla esperando (movimiento, foco). Mostrar
 * "falta luz" a alguien que está a dos metros de la cámara lo manda a
 * pelearse con la lámpara equivocada.
 */
export const evaluarCalidad = (e: EntradaCalidad): Veredicto => {
  const { referencias: r, pose, estadisticas: s } = e;

  const centro = centroDeReferencias(r);
  const tamano = r.interocular / e.anchoCuadro;
  const desvio = desvioDelCentro(centro, e.anchoCuadro, e.altoCuadro);
  const ojos = Math.max(e.parpadeoDerecho, e.parpadeoIzquierdo);
  const movimiento = movimientoDe(centro, e.centroAnterior, e.anchoCuadro);

  const metricas = {
    tamano,
    desvio,
    rollGrados: pose.rollGrados,
    yaw: pose.yaw,
    pitch: pose.pitch,
    ojos,
    luma: s.luma,
    contraste: s.contraste,
    nitidez: s.nitidez,
    movimiento,
  };

  const fallar = (motivo: MotivoRechazo): Veredicto => ({
    ok: false,
    puntaje: 0,
    motivo,
    metricas,
  });

  // La parte geométrica no se repite acá: se delega en `evaluarGeometria`
  // para que las dos funciones no puedan divergir. Si alguien afloja un
  // umbral en una y se olvida de la otra, el motor descartaría cuadros
  // que la puerta final aceptaría (o al revés) y el síntoma sería
  // "a veces reconoce y a veces no", que es lo más caro de diagnosticar.
  const geo = evaluarGeometria(e);
  if (!geo.ok) return fallar(geo.motivo as MotivoRechazo);

  if (s.luma < UMBRALES.lumaMinima) return fallar('oscuro');
  if (s.luma > UMBRALES.lumaMaxima) return fallar('quemado');
  if (s.contraste < UMBRALES.contrasteMinimo) return fallar('sin_contraste');
  if (s.nitidez < UMBRALES.nitidezMinima) return fallar('borroso');

  // El puntaje es el **mínimo** de los parciales, no el promedio: un
  // cuadro perfecto salvo que está casi de perfil no es un buen cuadro.
  // El promedio lo disimularía; el mínimo no.
  const puntaje = Math.min(
    puntajeMeseta(
      tamano,
      UMBRALES.tamanoMinimo,
      UMBRALES.tamanoComodo,
      UMBRALES.tamanoAmplio,
      UMBRALES.tamanoMaximo
    ),
    puntajeLimite(desvio, UMBRALES.desvioMaximo),
    puntajeLimite(pose.rollGrados, UMBRALES.rollMaximoGrados),
    puntajeLimite(pose.yaw, UMBRALES.yawMaximo),
    puntajeLimite(pose.pitch, UMBRALES.pitchMaximo),
    puntajeLimite(ojos, UMBRALES.ojoCerrado),
    puntajeBanda(s.luma, UMBRALES.lumaMinima, UMBRALES.lumaMaxima),
    Math.min(1, s.contraste / (UMBRALES.contrasteMinimo * 2)),
    Math.min(1, s.nitidez / (UMBRALES.nitidezMinima * 3))
  );

  return { ok: true, puntaje, motivo: null, metricas };
};

/** Puntaje a partir del cual un cuadro entra al búfer de plantillas. */
export const PUNTAJE_ACEPTABLE = 0.35;

/** Cuadros consecutivos buenos antes de empezar a reconocer. */
export const CUADROS_ESTABLES = 3;
