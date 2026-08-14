/**
 * Banco de pruebas del pipeline facial.
 *
 * Sirve para dos cosas que hasta ahora no se podían hacer:
 *
 * 1. **Medir el dispositivo real.** Cuánto tarda cada etapa, en qué
 *    backend corre, qué resolución entrega de verdad la cámara, y si el
 *    rendimiento se sostiene o se cae con la temperatura. Es lo que
 *    convierte "no anda en la Samsung" en un número.
 *
 * 2. **Calibrar el umbral con datos.** Se toma una plantilla de
 *    referencia y después se mide la distancia contra la misma persona
 *    en condiciones distintas (contraluz, poca luz, con anteojos, de
 *    costado) y contra otras personas. De esos dos conjuntos de
 *    distancias —genuinas e impostoras— salen el FRR y el FAR reales, y
 *    con ellos el umbral. Hasta ahora el umbral era el que traía face-api
 *    en su README.
 *
 * Privacidad
 * ----------
 * Todo vive **en memoria de la pestaña**. No se guarda ninguna imagen,
 * ningún descriptor viaja al servidor, y nada se escribe en disco salvo
 * que la persona exporte a mano el informe, que contiene sólo números
 * agregados. Una herramienta de calibración que filtre biometría sería
 * peor que no tener herramienta.
 */

import { distancia } from './plantilla';

export interface Medicion {
  /** Etiqueta de la condición: "frente buena luz", "contraluz", etc. */
  condicion: string;
  distancia: number;
  puntaje: number;
  ms: number;
}

export interface ResumenDistancias {
  n: number;
  minimo: number;
  p50: number;
  p95: number;
  maximo: number;
  media: number;
  desvio: number;
}

const percentil = (ordenados: number[], p: number): number => {
  if (ordenados.length === 0) return NaN;
  const i = (ordenados.length - 1) * p;
  const bajo = Math.floor(i);
  const alto = Math.ceil(i);
  return bajo === alto
    ? ordenados[bajo]
    : ordenados[bajo] + (ordenados[alto] - ordenados[bajo]) * (i - bajo);
};

export const resumir = (valores: number[]): ResumenDistancias => {
  const n = valores.length;
  if (n === 0) {
    return {
      n: 0,
      minimo: NaN,
      p50: NaN,
      p95: NaN,
      maximo: NaN,
      media: NaN,
      desvio: NaN,
    };
  }
  const ordenados = [...valores].sort((a, b) => a - b);
  const media = valores.reduce((a, v) => a + v, 0) / n;
  const desvio = Math.sqrt(
    valores.reduce((a, v) => a + (v - media) ** 2, 0) / n
  );
  return {
    n,
    minimo: ordenados[0],
    p50: percentil(ordenados, 0.5),
    p95: percentil(ordenados, 0.95),
    maximo: ordenados[n - 1],
    media,
    desvio,
  };
};

export interface PuntoOperacion {
  umbral: number;
  /** Falsos rechazos: genuinos que quedarían afuera. */
  frr: number;
  /** Falsas aceptaciones: impostores que entrarían. */
  far: number;
}

/**
 * Curva FRR/FAR sobre las distancias medidas.
 *
 * - `FRR(u)` = fracción de comparaciones **genuinas** (misma persona)
 *   con distancia mayor que `u`: gente legítima que el sistema rebota.
 * - `FAR(u)` = fracción de comparaciones **impostoras** (personas
 *   distintas) con distancia menor o igual que `u`: gente que entraría
 *   siendo otra.
 *
 * Los dos se mueven en direcciones opuestas con el umbral, y por eso no
 * existe "el umbral correcto" en abstracto: existe el que cumple el FAR
 * que el negocio tolera. Para un control horario, una falsa aceptación
 * mete una marca de asistencia falsa en un registro que puede terminar
 * en una inspección; un falso rechazo cuesta cinco segundos y otro
 * intento. Por eso el criterio es fijar el FAR y ver qué FRR sale.
 */
export const curva = (
  genuinas: number[],
  impostoras: number[],
  paso = 0.01
): PuntoOperacion[] => {
  const puntos: PuntoOperacion[] = [];
  for (let u = 0; u <= 1.2 + 1e-9; u += paso) {
    const umbral = Math.round(u * 1000) / 1000;
    puntos.push({
      umbral,
      frr: genuinas.length
        ? genuinas.filter((d) => d > umbral).length / genuinas.length
        : NaN,
      far: impostoras.length
        ? impostoras.filter((d) => d <= umbral).length / impostoras.length
        : NaN,
    });
  }
  return puntos;
};

/**
 * Umbral más alto que mantiene el FAR por debajo del objetivo.
 *
 * Se elige el **más alto** porque, fijado el FAR, subir el umbral sólo
 * puede bajar el FRR: es el punto que menos rebota gente legítima sin
 * pasarse del riesgo aceptado.
 */
export const umbralParaFar = (
  puntos: PuntoOperacion[],
  farObjetivo: number
): PuntoOperacion | null => {
  const validos = puntos.filter(
    (p) => Number.isFinite(p.far) && p.far <= farObjetivo
  );
  return validos.length ? validos[validos.length - 1] : null;
};

/** Punto donde FRR y FAR se cruzan. Resume la calidad del sistema en un número. */
export const puntoDeCruce = (
  puntos: PuntoOperacion[]
): PuntoOperacion | null => {
  let mejor: PuntoOperacion | null = null;
  let brecha = Infinity;
  for (const p of puntos) {
    if (!Number.isFinite(p.far) || !Number.isFinite(p.frr)) continue;
    const d = Math.abs(p.far - p.frr);
    if (d < brecha) {
      brecha = d;
      mejor = p;
    }
  }
  return mejor;
};

/**
 * Separación entre las dos distribuciones, en desvíos estándar.
 *
 * Es la métrica que de verdad describe la calidad del pipeline, porque
 * **no depende del umbral**. Mover el umbral cambia el punto de
 * operación; sólo alinear bien, enrolar bien y promediar varios cuadros
 * cambia la separación. Cuando se comparan dos implementaciones, éste es
 * el número a mirar: si no sube, no hubo mejora, hubo un cambio de
 * punto de operación.
 */
export const separacion = (
  genuinas: number[],
  impostoras: number[]
): number => {
  const g = resumir(genuinas);
  const i = resumir(impostoras);
  const varianzaComun = Math.sqrt((g.desvio ** 2 + i.desvio ** 2) / 2);
  return varianzaComun > 0 ? (i.media - g.media) / varianzaComun : NaN;
};

/** Distancias de una plantilla contra un conjunto de mediciones. */
export const distanciasContra = (
  referencia: ArrayLike<number>,
  muestras: ReadonlyArray<ArrayLike<number>>
): number[] => muestras.map((m) => distancia(referencia, m));

// ---------------------------------------------------------------------
// Cuánto se puede afirmar con la muestra que hay
// ---------------------------------------------------------------------

/**
 * Cota superior del FAR real cuando **no se observó ninguna** falsa
 * aceptación, al 95 % de confianza.
 *
 * Es la regla de tres: con `n` comparaciones impostoras y cero fallos, lo
 * máximo que se puede afirmar es que el FAR verdadero está por debajo de
 * `3/n`. No que sea cero.
 *
 * Por qué esto está acá y no es un detalle académico
 * --------------------------------------------------
 * Es lo que impide sobrevender la calibración. Con 10 personas × 5
 * condiciones salen 1125 pares impostores; si ninguno cruza el umbral, lo
 * honesto es decir *"FAR por debajo de 0,27 %"*, no *"FAR = 0"* ni
 * *"cumple FAR ≤ 0,01 %"*. **Ese objetivo no se puede demostrar con diez
 * personas**, por más que ningún impostor haya entrado: la muestra no
 * alcanza para verlo. Decirlo de entrada evita que alguien lea un cero en
 * una tabla y crea que el sistema está probado a un nivel que nadie midió.
 */
export const cotaSuperiorFar = (comparacionesImpostoras: number): number =>
  comparacionesImpostoras > 0 ? 3 / comparacionesImpostoras : 1;

/**
 * Cuántas personas hacen falta para poder **demostrar** un FAR dado.
 *
 * Con `p` personas y `c` condiciones salen `p·c` muestras; los pares
 * impostores son todos los pares menos los de la misma persona:
 * `C(p·c, 2) − p·C(c, 2)`. Se busca el `p` más chico cuya cota `3/n`
 * quede por debajo del objetivo.
 */
export const personasNecesarias = (
  farObjetivo: number,
  condicionesPorPersona: number
): number => {
  if (farObjetivo <= 0) return Infinity;
  const pares = (n: number) => (n * (n - 1)) / 2;
  for (let p = 2; p <= 5000; p++) {
    const total = pares(p * condicionesPorPersona);
    const genuinos = p * pares(condicionesPorPersona);
    const impostores = total - genuinos;
    if (impostores > 0 && 3 / impostores <= farObjetivo) return p;
  }
  return Infinity;
};

export interface UmbralConservador {
  umbral: number;
  /** Falsos rechazos esperados con ese umbral, sobre las genuinas medidas. */
  frr: number;
  /** Distancia impostora más chica observada. El umbral queda por debajo. */
  impostoraMinima: number;
  /** Cuánto se bajó por debajo de esa mínima. */
  margen: number;
  /** Cota superior del FAR real al 95 %, dada la cantidad de pares. */
  cotaFar: number;
  advertencias: string[];
}

/**
 * Margen de seguridad por debajo de la impostora más cercana.
 *
 * La distancia impostora mínima **observada** es una muestra, no el
 * mínimo verdadero: la próxima persona que se enrole puede parecerse más
 * a alguien que cualquiera de las medidas. Pegar el umbral justo a ese
 * valor sería calibrar contra el ruido del conjunto de prueba.
 *
 * 0,05 es el mismo valor que ya usa `MARGEN_MINIMO` para separar al mejor
 * candidato del segundo en 1:N — no es casualidad: las dos son la misma
 * pregunta, cuánta distancia hace falta para creerle a una diferencia.
 */
export const MARGEN_SEGURIDAD = 0.05;

/**
 * Umbral que prioriza **no aceptar a la persona equivocada**.
 *
 * El criterio del producto es explícito y asimétrico: un falso positivo
 * mete una marca de asistencia de otra persona en un registro que puede
 * terminar en una inspección o en un juicio laboral, y nadie se entera.
 * Un falso rechazo cuesta que el empleado vuelva a mirar la cámara. Por
 * eso el umbral no se pone en el EER —el punto donde los dos errores se
 * igualan, que es lo que se elige cuando cuestan lo mismo— sino por
 * **debajo de la impostora más cercana que se haya visto**, con margen.
 *
 * El FRR que salga es una consecuencia, no un objetivo; se informa para
 * que sea una decisión de negocio consciente y no una sorpresa.
 */
export const umbralConservador = (
  genuinas: number[],
  impostoras: number[],
  margen = MARGEN_SEGURIDAD
): UmbralConservador | null => {
  if (impostoras.length === 0 || genuinas.length === 0) return null;

  const impostoraMinima = Math.min(...impostoras);
  const umbral = Math.max(
    0,
    Math.round((impostoraMinima - margen) * 1000) / 1000
  );
  const frr = genuinas.filter((d) => d > umbral).length / genuinas.length;
  const cotaFar = cotaSuperiorFar(impostoras.length);

  const advertencias: string[] = [];
  if (umbral <= 0) {
    advertencias.push(
      'La impostora más cercana está por debajo del margen de seguridad: no hay umbral seguro con estos datos.'
    );
  }
  if (frr > 0.1) {
    advertencias.push(
      `FRR del ${(frr * 100).toFixed(1)} %: con este umbral se va a rebotar a mucha gente legítima. Revisar el enrolamiento antes que aflojar el umbral.`
    );
  }
  if (impostoras.length < 200) {
    advertencias.push(
      `Sólo ${impostoras.length} pares impostores: la cota de FAR queda en ${(cotaFar * 100).toFixed(2)} %. Hacen falta más personas para afirmar algo más fuerte.`
    );
  }
  const solape = genuinas.filter((d) => d >= impostoraMinima).length;
  if (solape > 0) {
    advertencias.push(
      `${solape} comparaciones genuinas caen por encima de la impostora más cercana: las distribuciones se solapan y ningún umbral separa limpio.`
    );
  }

  return { umbral, frr, impostoraMinima, margen, cotaFar, advertencias };
};
