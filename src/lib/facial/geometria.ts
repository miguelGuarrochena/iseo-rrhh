/**
 * Geometría del rostro: puntos de referencia, pose y alineamiento.
 *
 * Todo lo de este archivo es matemática pura sobre coordenadas en
 * píxeles. No toca la cámara, ni los modelos, ni el DOM. Eso es a
 * propósito: es la parte del pipeline donde un error se paga con falsos
 * rechazos difíciles de diagnosticar, así que tiene que poder probarse
 * con triángulos inventados y sin navegador.
 *
 * Por qué existe (el hallazgo que originó el rediseño)
 * ---------------------------------------------------
 * La implementación anterior le daba al modelo de reconocimiento un
 * recorte **sin alinear**: la caja contenedora de los landmarks agrandada
 * un 20 % y estirada a 150×150. Sin rotación, sin escala canónica, sin
 * traslación canónica.
 *
 * La ResNet-34 de dlib que calcula el descriptor fue entrenada con
 * `get_face_chip`, que sí aplica una transformación de similitud: rota
 * hasta nivelar los ojos, escala según la distancia ojos-boca y traslada
 * para que la cara caiga siempre en el mismo lugar del recorte. Darle
 * caras inclinadas y descentradas es usarla fuera de la distribución con
 * la que aprendió: la misma persona produce descriptores más dispersos,
 * las distribuciones de "misma persona" y "otra persona" se solapan más,
 * y ningún umbral arregla eso — un umbral mueve el punto de operación,
 * no separa mejor las distribuciones.
 *
 * Acá se reconstruye esa transformación.
 */

export interface Punto {
  x: number;
  y: number;
}

/**
 * Índices de la malla canónica de MediaPipe (478 puntos).
 *
 * "Izquierdo" y "derecho" son del **sujeto**, no de la imagen. En un
 * cuadro sin espejar de una cámara frontal, el ojo derecho del sujeto
 * aparece a la izquierda del cuadro (x menor). Confundir esto invierte
 * el signo del giro y rompe el desafío de pose.
 */
export const PUNTOS = {
  ojoDerechoExterno: 33,
  ojoDerechoInterno: 133,
  ojoIzquierdoInterno: 362,
  ojoIzquierdoExterno: 263,
  narizPunta: 1,
  bocaComisuraDerecha: 61,
  bocaComisuraIzquierda: 291,
  /** Borde del óvalo facial, a la altura de las orejas. */
  costadoDerecho: 234,
  costadoIzquierdo: 454,
  frente: 10,
  menton: 152,
} as const;

/** Cantidad de puntos que devuelve el modelo. Se valida antes de usarlos. */
export const PUNTOS_ESPERADOS = 478;

const medio = (a: Punto, b: Punto): Punto => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});

const distancia = (a: Punto, b: Punto): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Los tres puntos con los que se define el recorte, en píxeles.
 *
 * Son los mismos que usa dlib (y que face-api replica en su
 * `alignDlib`): centro de cada ojo y centro de la boca. Se eligen porque
 * son los rasgos más estables de la cara — no se mueven con la
 * expresión tanto como el contorno, y no dependen del pelo ni de la
 * ropa.
 *
 * El centro del ojo se toma como el punto medio de las dos comisuras y
 * no como el promedio del anillo completo: las comisuras no se mueven al
 * parpadear, el anillo sí. Si el centro del ojo bajara cada vez que la
 * persona cierra los ojos, el recorte se movería y el descriptor
 * cambiaría por un motivo que no tiene nada que ver con la identidad.
 */
export interface Referencias {
  ojoDerecho: Punto;
  ojoIzquierdo: Punto;
  boca: Punto;
  nariz: Punto;
  costadoDerecho: Punto;
  costadoIzquierdo: Punto;
  frente: Punto;
  menton: Punto;
  /** Distancia entre los centros de los ojos, en píxeles. */
  interocular: number;
}

/**
 * Pasa los landmarks normalizados de MediaPipe a los puntos de
 * referencia en píxeles.
 *
 * Devuelve null si la malla no tiene la forma esperada. Un modelo
 * distinto o una versión futura con otra numeración daría índices que
 * apuntan a otra parte de la cara, y el resultado sería un recorte
 * silenciosamente mal alineado: es preferible no alinear nada.
 */
export const referenciasDeMalla = (
  malla: ReadonlyArray<{ x: number; y: number }>,
  anchoPx: number,
  altoPx: number
): Referencias | null => {
  if (malla.length < PUNTOS_ESPERADOS) return null;
  if (!(anchoPx > 0) || !(altoPx > 0)) return null;

  const px = (i: number): Punto => ({
    x: malla[i].x * anchoPx,
    y: malla[i].y * altoPx,
  });

  const ojoDerecho = medio(
    px(PUNTOS.ojoDerechoExterno),
    px(PUNTOS.ojoDerechoInterno)
  );
  const ojoIzquierdo = medio(
    px(PUNTOS.ojoIzquierdoExterno),
    px(PUNTOS.ojoIzquierdoInterno)
  );

  const interocular = distancia(ojoDerecho, ojoIzquierdo);
  if (!(interocular > 0)) return null;

  return {
    ojoDerecho,
    ojoIzquierdo,
    boca: medio(
      px(PUNTOS.bocaComisuraDerecha),
      px(PUNTOS.bocaComisuraIzquierda)
    ),
    nariz: px(PUNTOS.narizPunta),
    costadoDerecho: px(PUNTOS.costadoDerecho),
    costadoIzquierdo: px(PUNTOS.costadoIzquierdo),
    frente: px(PUNTOS.frente),
    menton: px(PUNTOS.menton),
    interocular,
  };
};

export interface Pose {
  /** Inclinación lateral de la cabeza, **en grados**. 0 = ojos nivelados. */
  rollGrados: number;
  /**
   * Giro horizontal, **índice sin unidad** en [-1, 1].
   *
   * Positivo = el sujeto gira hacia **su** izquierda. 0 = de frente.
   * No son grados y no se hace de cuenta que lo sean: se calcula como la
   * asimetría entre las distancias de la nariz a cada costado del óvalo
   * facial, que es monótona con el giro pero cuya conversión a grados
   * depende de la lente y de la forma de la cara. El umbral de la puerta
   * de calidad se calibra sobre este índice con la herramienta de
   * diagnóstico, en la tablet real. Poner "20°" acá sería inventar una
   * unidad que nadie midió.
   */
  yaw: number;
  /**
   * Cabeceo, índice sin unidad en [-1, 1].
   * Positivo = mirando hacia arriba. 0 = de frente.
   */
  pitch: number;
}

const asimetria = (a: number, b: number): number => {
  const suma = a + b;
  return suma > 0 ? (a - b) / suma : 0;
};

/**
 * Pose de la cabeza a partir de los puntos de referencia.
 *
 * El roll sale exacto —es el ángulo de la recta entre los ojos— y se
 * usa tanto para la puerta de calidad como para el alineamiento.
 *
 * Yaw y pitch salen de asimetrías de distancia. Se eligió eso antes que
 * la matriz de transformación 4×4 que también devuelve MediaPipe por una
 * razón concreta: esa matriz viene como un arreglo plano de 16 números
 * cuyo orden (por filas o por columnas) no está documentado en la API
 * de JavaScript. Interpretarlo al revés da una pose que parece razonable
 * de frente y se equivoca justo cuando la persona gira, que es cuando
 * hace falta. La asimetría de distancias no tiene esa ambigüedad y se
 * puede probar con un triángulo escrito a mano.
 */
export const poseDeReferencias = (r: Referencias): Pose => {
  const dx = r.ojoIzquierdo.x - r.ojoDerecho.x;
  const dy = r.ojoIzquierdo.y - r.ojoDerecho.y;

  return {
    rollGrados: (Math.atan2(dy, dx) * 180) / Math.PI,
    yaw: asimetria(
      distancia(r.nariz, r.costadoDerecho),
      distancia(r.nariz, r.costadoIzquierdo)
    ),
    pitch: asimetria(
      distancia(r.nariz, r.menton),
      distancia(r.nariz, r.frente)
    ),
  };
};

/**
 * Constantes del recorte canónico de dlib.
 *
 * Extraídas del bundle de `@vladmandic/face-api` (`alignDlib`), que a su
 * vez las porta de dlib. Se dejan acá con el nombre que tienen en el
 * original para que se pueda auditar contra la fuente:
 *
 *   tamaño   = promedio(dist(boca, ojoDer), dist(boca, ojoIzq)) / 0.45
 *   centroide de los tres puntos cae en (0.50, 0.43) del recorte
 *
 * Lo que face-api **no** hace, y acá sí, es rotar. Sin la rotación el
 * recorte queda alineado a los ejes de la imagen en vez de a la cara.
 */
export const REL_ESCALA = 0.45;
export const REL_X = 0.5;
export const REL_Y = 0.43;

/** Lado del recorte que espera el modelo de dlib. */
export const LADO_CHIP = 150;

/**
 * Matriz de transformación afín para `CanvasRenderingContext2D.setTransform`.
 *
 * Mapea (x, y) del cuadro original a (a·x + c·y + e, b·x + d·y + f) del
 * recorte.
 */
export interface Transformacion {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
  /** Lado del recorte de salida, en píxeles. */
  lado: number;
  /** Escala aplicada. < 1 significa que se está achicando la cara. */
  escala: number;
}

/**
 * Transformación de similitud del cuadro al recorte canónico.
 *
 * Rota para nivelar los ojos, escala para que la distancia ojos-boca sea
 * siempre la misma, y traslada para que el centroide de los tres puntos
 * caiga siempre en (0.50, 0.43) del recorte. Es decir: la misma cara a
 * distinta distancia, inclinada o corrida dentro del cuadro produce
 * **el mismo recorte**, que es exactamente lo que el modelo necesita
 * para que su salida dependa de la identidad y no del encuadre.
 */
export const transformacionDeAlineamiento = (
  r: Referencias,
  lado: number = LADO_CHIP
): Transformacion => {
  const dOjoDer = Math.hypot(
    r.boca.x - r.ojoDerecho.x,
    r.boca.y - r.ojoDerecho.y
  );
  const dOjoIzq = Math.hypot(
    r.boca.x - r.ojoIzquierdo.x,
    r.boca.y - r.ojoIzquierdo.y
  );
  const tamano = (dOjoDer + dOjoIzq) / 2 / REL_ESCALA;

  const theta = Math.atan2(
    r.ojoIzquierdo.y - r.ojoDerecho.y,
    r.ojoIzquierdo.x - r.ojoDerecho.x
  );

  // Se rota por -theta (para nivelar) y se escala para que `tamano`
  // píxeles del original entren en `lado` píxeles del recorte.
  const escala = lado / tamano;
  const cos = Math.cos(theta);
  const sen = Math.sin(theta);

  const a = escala * cos;
  const b = -escala * sen;
  const c = escala * sen;
  const d = escala * cos;

  const centro = {
    x: (r.ojoDerecho.x + r.ojoIzquierdo.x + r.boca.x) / 3,
    y: (r.ojoDerecho.y + r.ojoIzquierdo.y + r.boca.y) / 3,
  };

  return {
    a,
    b,
    c,
    d,
    e: REL_X * lado - (a * centro.x + c * centro.y),
    f: REL_Y * lado - (b * centro.x + d * centro.y),
    lado,
    escala,
  };
};

/** Aplica una transformación a un punto. Existe para poder testearla. */
export const aplicar = (t: Transformacion, p: Punto): Punto => ({
  x: t.a * p.x + t.c * p.y + t.e,
  y: t.b * p.x + t.d * p.y + t.f,
});
