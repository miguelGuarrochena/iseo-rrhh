/**
 * Qué cuida este archivo: que el alineamiento sea **de verdad** una
 * transformación de similitud.
 *
 * Es el hallazgo que originó el rediseño. El pipeline anterior le daba
 * al modelo de reconocimiento la caja contenedora de los landmarks
 * agrandada un 20 %, sin rotar y sin normalizar la escala. La ResNet-34
 * de dlib fue entrenada con recortes canónicos, así que recibía caras
 * fuera de la distribución con la que aprendió: la misma persona
 * producía descriptores dispersos y ningún umbral podía arreglarlo.
 *
 * La propiedad que hace falta es exactamente ésta: **la misma cara,
 * rotada, escalada o corrida dentro del cuadro, tiene que producir el
 * mismo recorte**. Si eso se rompe, el sistema vuelve a fallar como
 * antes y el síntoma es "a veces reconoce y a veces no", que es lo más
 * caro de diagnosticar. Por eso se prueba acá y no a mano en la tablet.
 */

import {
  aplicar,
  LADO_CHIP,
  poseDeReferencias,
  PUNTOS,
  PUNTOS_ESPERADOS,
  referenciasDeMalla,
  REL_X,
  REL_Y,
  transformacionDeAlineamiento,
  type Punto,
} from '@/lib/facial/geometria';

/** Cara sintética de frente, en coordenadas de imagen (píxeles). */
const CARA_BASE: Record<number, Punto> = {
  [PUNTOS.ojoDerechoExterno]: { x: 260, y: 300 },
  [PUNTOS.ojoDerechoInterno]: { x: 300, y: 300 },
  [PUNTOS.ojoIzquierdoInterno]: { x: 380, y: 300 },
  [PUNTOS.ojoIzquierdoExterno]: { x: 420, y: 300 },
  [PUNTOS.narizPunta]: { x: 340, y: 350 },
  [PUNTOS.bocaComisuraDerecha]: { x: 305, y: 400 },
  [PUNTOS.bocaComisuraIzquierda]: { x: 375, y: 400 },
  [PUNTOS.costadoDerecho]: { x: 230, y: 340 },
  [PUNTOS.costadoIzquierdo]: { x: 450, y: 340 },
  [PUNTOS.frente]: { x: 340, y: 230 },
  [PUNTOS.menton]: { x: 340, y: 460 },
};

const ANCHO = 1280;
const ALTO = 720;

/**
 * Arma la malla normalizada que devolvería MediaPipe.
 *
 * Los puntos que no se usan quedan en el centro: la función sólo lee los
 * índices de `PUNTOS`, pero valida el largo del arreglo, así que hay que
 * entregar los 478.
 */
const malla = (
  puntos: Record<number, Punto>
): Array<{ x: number; y: number; z: number }> =>
  Array.from({ length: PUNTOS_ESPERADOS }, (_, i) => {
    const p = puntos[i] ?? { x: ANCHO / 2, y: ALTO / 2 };
    return { x: p.x / ANCHO, y: p.y / ALTO, z: 0 };
  });

/** Rota, escala y traslada una cara entera, como si la persona se moviera. */
const mover = (
  puntos: Record<number, Punto>,
  gradosRoll: number,
  escala: number,
  dx: number,
  dy: number
): Record<number, Punto> => {
  const t = (gradosRoll * Math.PI) / 180;
  const cos = Math.cos(t);
  const sen = Math.sin(t);
  const cx = 340;
  const cy = 350;
  const salida: Record<number, Punto> = {};
  for (const [clave, p] of Object.entries(puntos)) {
    const x = (p.x - cx) * escala;
    const y = (p.y - cy) * escala;
    salida[Number(clave)] = {
      x: cx + x * cos - y * sen + dx,
      y: cy + x * sen + y * cos + dy,
    };
  }
  return salida;
};

const referenciasDe = (puntos: Record<number, Punto>) => {
  const r = referenciasDeMalla(malla(puntos), ANCHO, ALTO);
  if (!r) throw new Error('La malla sintética debería producir referencias');
  return r;
};

describe('referenciasDeMalla', () => {
  it('toma el centro del ojo como el punto medio de las comisuras', () => {
    const r = referenciasDe(CARA_BASE);
    // (260 + 300) / 2 = 280 para el ojo derecho del sujeto.
    expect(r.ojoDerecho.x).toBeCloseTo(280, 5);
    expect(r.ojoIzquierdo.x).toBeCloseTo(400, 5);
    expect(r.interocular).toBeCloseTo(120, 5);
  });

  it('rechaza una malla que no tiene la cantidad de puntos esperada', () => {
    // Un modelo distinto, o una versión futura con otra numeración, daría
    // índices que apuntan a otra parte de la cara. Un recorte
    // silenciosamente mal alineado es peor que no alinear nada.
    expect(
      referenciasDeMalla(malla(CARA_BASE).slice(0, 100), ANCHO, ALTO)
    ).toBeNull();
  });

  it('rechaza dimensiones de cuadro inválidas', () => {
    expect(referenciasDeMalla(malla(CARA_BASE), 0, ALTO)).toBeNull();
  });
});

describe('poseDeReferencias', () => {
  it('da roll cero y yaw/pitch chicos en una cara de frente', () => {
    const p = poseDeReferencias(referenciasDe(CARA_BASE));
    expect(p.rollGrados).toBeCloseTo(0, 5);
    expect(Math.abs(p.yaw)).toBeLessThan(0.02);
  });

  it('mide el roll en grados y con el signo correcto', () => {
    const p = poseDeReferencias(referenciasDe(mover(CARA_BASE, 12, 1, 0, 0)));
    expect(p.rollGrados).toBeCloseTo(12, 1);
  });

  it('da yaw positivo cuando el sujeto gira hacia su izquierda', () => {
    // Girar hacia la izquierda del sujeto acerca la nariz al costado
    // izquierdo (índice 454), que en la imagen sin espejar es el de x
    // mayor. El signo importa: de él depende que el desafío de pose pida
    // un lado y acepte el otro.
    const girada = { ...CARA_BASE, [PUNTOS.narizPunta]: { x: 400, y: 350 } };
    expect(poseDeReferencias(referenciasDe(girada)).yaw).toBeGreaterThan(0.1);
  });

  it('da yaw negativo cuando el sujeto gira hacia su derecha', () => {
    const girada = { ...CARA_BASE, [PUNTOS.narizPunta]: { x: 280, y: 350 } };
    expect(poseDeReferencias(referenciasDe(girada)).yaw).toBeLessThan(-0.1);
  });

  it('da pitch positivo cuando el sujeto mira hacia arriba', () => {
    // Mirando hacia arriba, la nariz se aleja del mentón en proyección.
    const arriba = { ...CARA_BASE, [PUNTOS.narizPunta]: { x: 340, y: 320 } };
    expect(poseDeReferencias(referenciasDe(arriba)).pitch).toBeGreaterThan(0);
  });
});

describe('transformacionDeAlineamiento', () => {
  it('lleva el centroide de los tres puntos al lugar canónico del recorte', () => {
    const r = referenciasDe(CARA_BASE);
    const t = transformacionDeAlineamiento(r);
    const centroide = {
      x: (r.ojoDerecho.x + r.ojoIzquierdo.x + r.boca.x) / 3,
      y: (r.ojoDerecho.y + r.ojoIzquierdo.y + r.boca.y) / 3,
    };
    const destino = aplicar(t, centroide);
    expect(destino.x).toBeCloseTo(REL_X * LADO_CHIP, 4);
    expect(destino.y).toBeCloseTo(REL_Y * LADO_CHIP, 4);
  });

  it('nivela los ojos: después de transformar quedan a la misma altura', () => {
    // Esto es lo que face-api **no** hacía. Su `alignMinBbox` recortaba
    // una caja alineada a los ejes de la imagen, así que una cabeza
    // inclinada 15° llegaba al modelo inclinada 15°.
    const r = referenciasDe(mover(CARA_BASE, 20, 1, 0, 0));
    const t = transformacionDeAlineamiento(r);
    const a = aplicar(t, r.ojoDerecho);
    const b = aplicar(t, r.ojoIzquierdo);
    expect(b.y - a.y).toBeCloseTo(0, 4);
    // Y el ojo derecho del sujeto sigue a la izquierda del recorte: la
    // cara no queda dada vuelta.
    expect(a.x).toBeLessThan(b.x);
  });

  it('produce el MISMO recorte con la cara rotada, escalada y corrida', () => {
    // La propiedad central del rediseño. Si esto falla, el descriptor
    // vuelve a depender del encuadre en vez de la identidad.
    const base = transformacionDeAlineamiento(referenciasDe(CARA_BASE));
    const movida = transformacionDeAlineamiento(
      referenciasDe(mover(CARA_BASE, -17, 1.8, 240, -110))
    );

    for (const clave of [
      PUNTOS.ojoDerechoExterno,
      PUNTOS.ojoIzquierdoExterno,
      PUNTOS.narizPunta,
      PUNTOS.bocaComisuraDerecha,
      PUNTOS.menton,
    ]) {
      const enBase = aplicar(base, CARA_BASE[clave]);
      const enMovida = aplicar(
        movida,
        mover(CARA_BASE, -17, 1.8, 240, -110)[clave]
      );
      expect(enMovida.x).toBeCloseTo(enBase.x, 3);
      expect(enMovida.y).toBeCloseTo(enBase.y, 3);
    }
  });

  it('conserva la escala: la distancia interocular en el recorte no depende de la distancia a la cámara', () => {
    const cerca = referenciasDe(mover(CARA_BASE, 0, 2, 0, 0));
    const lejos = referenciasDe(mover(CARA_BASE, 0, 0.6, 0, 0));

    const enChip = (r: ReturnType<typeof referenciasDe>) => {
      const t = transformacionDeAlineamiento(r);
      const a = aplicar(t, r.ojoDerecho);
      const b = aplicar(t, r.ojoIzquierdo);
      return Math.hypot(b.x - a.x, b.y - a.y);
    };

    expect(enChip(cerca)).toBeCloseTo(enChip(lejos), 3);
  });

  it('escala menos que 1 cuando la cara es más grande que el recorte', () => {
    // Sirve como control de cordura de la dirección de la escala: una
    // cara de 240 px de ancho tiene que **achicarse** para entrar en un
    // recorte de 150.
    const t = transformacionDeAlineamiento(
      referenciasDe(mover(CARA_BASE, 0, 2, 0, 0))
    );
    expect(t.escala).toBeLessThan(1);
  });
});
