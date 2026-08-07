/**
 * Prueba de vida (liveness) para el fichaje facial.
 *
 * El problema que resuelve: el reconocimiento compara un rostro contra
 * los enrolados, pero no tiene forma de saber si ese rostro está vivo del
 * otro lado de la cámara. Una foto impresa, o la pantalla de otro celular
 * mostrando la cara de un compañero, pasaban la verificación igual. Para
 * un control de asistencia eso es justamente el fraude que el
 * reconocimiento facial debería impedir.
 *
 * Cómo lo detecta: se le pide a la persona que parpadee y se mira la
 * apertura de los ojos a lo largo de varios cuadros. Una foto tiene los
 * ojos siempre igual de abiertos; una persona que parpadea produce una
 * caída y una recuperación.
 *
 * No es infalible —un video sí lo pasaría— pero corta el caso común, que
 * es la foto, y no necesita hardware especial.
 */

export interface Punto {
  x: number;
  y: number;
}

const distancia = (a: Punto, b: Punto): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Relación de aspecto del ojo (EAR).
 *
 * Con los 6 puntos que face-api da por ojo: alto promedio dividido el
 * ancho. Es un número sin unidad —da igual la distancia a la cámara o la
 * resolución— que ronda 0,3 con el ojo abierto y cae cerca de 0 al
 * cerrarlo.
 *
 *      p2  p3
 *   p1        p4     EAR = (|p2−p6| + |p3−p5|) / (2·|p1−p4|)
 *      p6  p5
 */
export const relacionAspectoOjo = (ojo: Punto[]): number => {
  if (ojo.length < 6) return 0;
  const [p1, p2, p3, p4, p5, p6] = ojo;
  const ancho = distancia(p1, p4);
  if (ancho === 0) return 0;
  return (distancia(p2, p6) + distancia(p3, p5)) / (2 * ancho);
};

/** Debajo de esto se considera el ojo cerrado. */
export const EAR_CERRADO = 0.21;
/** Por encima de esto, abierto. La banda entre ambos evita el titileo. */
export const EAR_ABIERTO = 0.27;

/**
 * ¿La secuencia de aperturas contiene un parpadeo?
 *
 * Se exige el ciclo completo —abierto, cerrado, abierto— y no sólo un
 * cuadro con los ojos cerrados: alguien podría poner una foto de una
 * persona con los ojos cerrados y pasar el chequeo si sólo mirásemos eso.
 * La histéresis entre los dos umbrales evita que un valor que oscila en
 * el borde cuente como varios parpadeos.
 */
export const hayParpadeo = (aperturas: number[]): boolean => {
  let vioAbierto = false;
  let vioCerrado = false;

  for (const ear of aperturas) {
    if (!vioAbierto) {
      if (ear >= EAR_ABIERTO) vioAbierto = true;
      continue;
    }
    if (!vioCerrado) {
      if (ear <= EAR_CERRADO) vioCerrado = true;
      continue;
    }
    // Abrió de nuevo: ciclo completo.
    if (ear >= EAR_ABIERTO) return true;
  }

  return false;
};

/**
 * Apertura promedio de los dos ojos en un cuadro.
 *
 * Se promedian porque un solo ojo puede quedar tapado por el pelo, un
 * reflejo en los anteojos o un giro de la cabeza, y ahí el valor de ese
 * ojo miente. El promedio es más estable que cualquiera de los dos.
 */
export const aperturaDeCuadro = (
  ojoIzquierdo: Punto[],
  ojoDerecho: Punto[]
): number =>
  (relacionAspectoOjo(ojoIzquierdo) + relacionAspectoOjo(ojoDerecho)) / 2;

/** Cuadros mínimos para poder afirmar algo. Menos que esto no alcanza. */
export const CUADROS_MINIMOS = 6;

export type ResultadoLiveness =
  | { vivo: true }
  | { vivo: false; motivo: 'pocos_cuadros' | 'sin_parpadeo' };

/**
 * Veredicto sobre una secuencia de aperturas.
 *
 * Si no se juntaron cuadros suficientes **no se da por viva**: ante la
 * duda, que la persona repita el gesto es mucho más barato que registrar
 * una fichada que no hizo.
 */
export const evaluarLiveness = (aperturas: number[]): ResultadoLiveness => {
  if (aperturas.length < CUADROS_MINIMOS) {
    return { vivo: false, motivo: 'pocos_cuadros' };
  }
  return hayParpadeo(aperturas)
    ? { vivo: true }
    : { vivo: false, motivo: 'sin_parpadeo' };
};
