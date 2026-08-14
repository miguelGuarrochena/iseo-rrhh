/**
 * Plantillas faciales: cómo se combinan varios descriptores en uno y
 * cómo se comparan.
 *
 * Un descriptor es la salida del modelo para **un** recorte: 128
 * números. No es "la cara de la persona", es "la cara de la persona en
 * ese cuadro, con esa luz, en esa pose". Dos cuadros de la misma persona
 * tomados con un segundo de diferencia dan descriptores distintos.
 *
 * Una **plantilla** es el promedio de varios descriptores de la misma
 * persona. El ruido que aporta cada cuadro (la luz, un gesto, un
 * micro-movimiento) es aproximadamente independiente entre cuadros, así
 * que promediar lo cancela parcialmente mientras conserva lo que es
 * estable, que es la identidad. En la práctica esto acerca los
 * descriptores de la misma persona entre sí **más** de lo que acerca los
 * de personas distintas: separa mejor las dos distribuciones, que es lo
 * único que de verdad mejora un sistema biométrico.
 *
 * Por eso tanto el enrolamiento como el fichaje mandan una plantilla, no
 * un descriptor suelto. Que los dos lados hagan lo mismo importa: si se
 * enrolara con un promedio de 5 y se fichara con un cuadro suelto, las
 * distancias no serían comparables con las que se usaron para calibrar
 * el umbral.
 */

/** Cuántos números tiene un descriptor de la ResNet-34 de dlib. */
export const DIMENSION = 128;

/**
 * Versión del pipeline que produce estas plantillas.
 *
 * **Única fuente de verdad del lado del cliente.** Viaja en cada llamada
 * a `fichar_con_rostro` y se guarda junto a cada enrolamiento, y el
 * servidor compara sólo contra plantillas de la misma versión.
 *
 * Por qué existe
 * --------------
 * La versión 1 es el pipeline anterior al rediseño: recortaba la caja de
 * los landmarks con un 20 % de margen y la estiraba, **sin alinear**. La
 * 2 aplica la transformación de similitud que el modelo de dlib espera.
 * Un descriptor de cada versión, de la misma persona, pertenece a
 * distribuciones distintas: compararlos no da "un poco peor", da un
 * número sin sentido, y los dos desenlaces posibles son igual de malos —
 * o la persona no puede fichar nunca, o entra otra.
 *
 * Cuándo hay que subirla
 * ----------------------
 * Cada vez que cambie **cualquier cosa que altere el descriptor de la
 * misma cara**: el alineamiento (`geometria.ts`), el tamaño o la
 * normalización del recorte (`alineamiento.ts`), el modelo de embedding,
 * o el promediado de `promediar`. Subirla obliga a re-enrolar a toda la
 * plantilla, así que no es gratis; pero no subirla cuando correspondía es
 * mucho peor, porque el sistema falla en silencio.
 *
 * Cambiar este número sin coordinar el re-enrolamiento deja a todo el
 * mundo sin poder fichar.
 */
export const VERSION_PLANTILLA = 2;

/**
 * Umbrales de distancia euclidiana. **Menor = más parecido.**
 *
 * ⚠ Estos valores son un espejo documental. **La decisión la toma
 * `fichar_con_rostro` en SQL**, que es donde tiene que estar: un umbral
 * que viva en el cliente es un umbral que el cliente puede cambiar.
 * Acá están para que la herramienta de calibración pueda mostrar el
 * punto de operación vigente al lado de la distribución medida.
 *
 * De dónde salen
 * --------------
 * Los valores actuales (0,6 y 0,5) son los que traía face-api por
 * defecto y **nunca se calibraron sobre esta población, este hardware ni
 * esta iluminación**. Además se fijaron cuando el pipeline no alineaba
 * las caras, así que corresponden a una distribución de distancias más
 * ancha que la que produce el pipeline nuevo.
 *
 * Cómo se calibran (procedimiento, no opinión)
 * -------------------------------------------
 * 1. Con `/app/diagnostico-facial` en la **tablet de producción**, se
 *    junta una matriz de distancias: ≥ 10 personas × ≥ 5 condiciones
 *    (frente con buena luz, contraluz, poca luz, con anteojos, ±20° de
 *    giro), cada una contra su propio enrolado y contra los demás.
 * 2. Eso da dos histogramas: *genuinos* (misma persona) e *impostores*
 *    (personas distintas).
 * 3. FRR(u) = fracción de genuinos con distancia > u.
 *    FAR(u) = fracción de impostores con distancia ≤ u.
 * 4. Se elige el u más alto que cumpla el objetivo de FAR, y se verifica
 *    que el FRR resultante sea tolerable.
 *
 * Objetivo del producto (operativo, no de laboratorio):
 * - 1:1 (celular, la sesión ya dice quién sos): FRR ≤ 3 % con FAR ≤ 0,1 %.
 * - 1:N (tablet, hay que elegir entre N): FRR ≤ 5 % con FAR ≤ 0,01 %.
 *
 * Cuando se cambien, se cambian en la migración de SQL **y acá**, con la
 * fecha y el N de la medición que los justificó.
 */
export const UMBRAL_VERIFICACION = 0.6;
export const UMBRAL_IDENTIFICACION = 0.5;

/**
 * Diferencia mínima entre el mejor y el segundo candidato en 1:N.
 *
 * Si dos personas dan parecido —hermanos, mellizos, una plantilla mala—
 * es preferible pedir otro intento antes que fichar a la equivocada. Un
 * falso rechazo cuesta cinco segundos; un falso positivo mete una marca
 * de asistencia falsa en un registro que puede terminar en una
 * inspección.
 */
export const MARGEN_MINIMO = 0.05;

/** Distancia euclidiana entre dos descriptores. */
export const distancia = (
  a: ArrayLike<number>,
  b: ArrayLike<number>
): number => {
  const n = Math.min(a.length, b.length);
  let suma = 0;
  for (let i = 0; i < n; i++) {
    const d = a[i] - b[i];
    suma += d * d;
  }
  return Math.sqrt(suma);
};

/**
 * Promedia varios descriptores en una plantilla.
 *
 * **No se normaliza a norma 1.** Podría parecer más prolijo, pero
 * cambiaría la escala de todas las distancias y dejaría sin sentido los
 * umbrales guardados en la base y los descriptores ya enrolados. La
 * comparación es euclidiana sobre el espacio crudo del modelo, como la
 * definió dlib.
 */
export const promediar = (
  descriptores: ReadonlyArray<ArrayLike<number>>
): number[] => {
  if (descriptores.length === 0) return [];
  const dim = descriptores[0].length;
  const suma = new Float64Array(dim);

  for (const d of descriptores) {
    if (d.length !== dim) {
      throw new Error(
        `Descriptores de distinto largo: ${d.length} vs ${dim}. No se pueden promediar.`
      );
    }
    for (let i = 0; i < dim; i++) suma[i] += d[i];
  }

  const n = descriptores.length;
  return Array.from(suma, (v) => v / n);
};

/**
 * Distancia máxima entre cualquier par de la lista.
 *
 * Es el control de coherencia del enrolamiento: todas las muestras
 * tienen que ser de la misma persona. Si dos muestras están más lejos
 * entre sí que el umbral con el que después se va a reconocer, algo
 * salió mal —se cruzó otra persona frente a la cámara, una muestra salió
 * con media cara tapada— y promediarlas produciría una plantilla que no
 * se parece a nadie.
 */
export const dispersion = (
  descriptores: ReadonlyArray<ArrayLike<number>>
): number => {
  let maxima = 0;
  for (let i = 0; i < descriptores.length; i++) {
    for (let j = i + 1; j < descriptores.length; j++) {
      const d = distancia(descriptores[i], descriptores[j]);
      if (d > maxima) maxima = d;
    }
  }
  return maxima;
};

/**
 * Dispersión máxima tolerada entre las muestras de un enrolamiento.
 *
 * Se pone por debajo del umbral de verificación: si las propias muestras
 * de referencia están tan dispersas como lo que después se va a aceptar
 * como "es la misma persona", la plantilla no aporta nada.
 */
export const DISPERSION_MAXIMA_ENROLADO = 0.45;

export interface MuestraCalificada<T> {
  valor: T;
  puntaje: number;
}

/**
 * Se queda con las `n` mejores muestras por puntaje de calidad.
 *
 * Es lo que convierte "junté 12 cuadros" en "me quedo con los 4 que
 * valen". Un cuadro apenas aceptable arrastra la plantilla hacia el
 * ruido: sumarlo al promedio es peor que no tenerlo.
 */
export const mejores = <T>(
  muestras: ReadonlyArray<MuestraCalificada<T>>,
  n: number
): T[] =>
  [...muestras]
    .sort((a, b) => b.puntaje - a.puntaje)
    .slice(0, n)
    .map((m) => m.valor);
