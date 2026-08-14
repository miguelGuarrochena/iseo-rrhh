/**
 * Extracción del recorte alineado que consume el modelo de identidad.
 *
 * Acá se aplica la transformación de similitud que calcula
 * `geometria.ts`. El resultado es siempre el mismo encuadre canónico de
 * 150×150: ojos nivelados, distancia ojos-boca fija, cara centrada
 * siempre en el mismo punto. La misma persona a 40 cm o a 90 cm, con la
 * cabeza derecha o inclinada, corrida a un costado del cuadro, produce
 * **el mismo recorte**.
 *
 * Eso es lo que hace que la salida del modelo dependa de la identidad y
 * no del encuadre, y es exactamente lo que faltaba antes: el pipeline
 * anterior recortaba la caja de los landmarks con un 20 % de margen y la
 * estiraba, sin rotar ni normalizar la escala.
 *
 * Sobre allocations
 * -----------------
 * El lienzo y su contexto se crean **una sola vez** y se reusan en cada
 * cuadro. En un kiosco que corre ocho horas, crear un canvas de 150×150
 * por cuadro son decenas de miles de objetos por turno: el recolector de
 * basura se despierta en medio del reconocimiento y produce un tirón
 * justo cuando la persona está esperando la respuesta.
 */

import {
  LADO_CHIP,
  transformacionDeAlineamiento,
  type Referencias,
} from './geometria';

export interface Lienzo {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  lado: number;
}

/**
 * Crea el lienzo reutilizable.
 *
 * `willReadFrequently: true` no es cosmético: sin eso Chrome mantiene el
 * canvas en la GPU y cada `getImageData` fuerza una lectura de vuelta a
 * memoria principal, que es una operación sincronizante y cara. Con la
 * bandera, el canvas vive en CPU y la lectura es una copia de memoria.
 * Como el recorte se lee en cada cuadro que pasa la puerta geométrica,
 * la diferencia se nota.
 */
export const crearLienzo = (lado: number = LADO_CHIP): Lienzo | null => {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = lado;
  canvas.height = lado;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  return { canvas, ctx, lado };
};

export type FuenteCuadro =
  | HTMLVideoElement
  | HTMLImageElement
  | HTMLCanvasElement;

/**
 * Dibuja el recorte alineado y devuelve sus píxeles.
 *
 * `imageSmoothingQuality: 'high'` importa cuando la transformación
 * **achica** la cara —el caso normal: una cara de 200 px de ancho entra
 * en un recorte de 150— porque sin filtrado el submuestreo genera
 * aliasing, y el aliasing se parece mucho a textura. El modelo lo lee
 * como si fuera detalle de la piel y el descriptor se corre por un
 * motivo que no tiene nada que ver con la persona.
 */
export const extraerChip = (
  fuente: FuenteCuadro,
  referencias: Referencias,
  lienzo: Lienzo
): ImageData | null => {
  const t = transformacionDeAlineamiento(referencias, lienzo.lado);
  if (!Number.isFinite(t.a) || !Number.isFinite(t.e) || t.escala <= 0) {
    return null;
  }

  const { ctx, lado } = lienzo;
  try {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // Fondo neutro: si la cara está pegada al borde del cuadro, parte
    // del recorte cae fuera de la imagen. Dejarlo transparente haría que
    // esos píxeles llegaran como negro puro y el modelo vería un borde
    // duro que no existe.
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, lado, lado);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.setTransform(t.a, t.b, t.c, t.d, t.e, t.f);
    ctx.drawImage(fuente, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    return ctx.getImageData(0, 0, lado, lado);
  } catch {
    // `drawImage` con un `<video>` que todavía no tiene datos, o un
    // canvas "tainted", lanza. Un cuadro perdido no es motivo para
    // tirar la sesión.
    return null;
  }
};

/**
 * ¿La cara entra entera en el cuadro?
 *
 * Una cara parcialmente fuera del encuadre produce un recorte con un
 * pedazo de gris, y el descriptor de esa media cara puede caer cerca de
 * cualquiera. Se chequea sobre los puntos de referencia con un margen,
 * antes de gastar el recorte.
 */
export const entraEnCuadro = (
  r: Referencias,
  ancho: number,
  alto: number
): boolean => {
  const margen = r.interocular * 0.9;
  const puntos = [
    r.ojoDerecho,
    r.ojoIzquierdo,
    r.boca,
    r.frente,
    r.menton,
    r.costadoDerecho,
    r.costadoIzquierdo,
  ];
  return puntos.every(
    (p) =>
      p.x > -margen &&
      p.y > -margen &&
      p.x < ancho + margen &&
      p.y < alto + margen
  );
};
