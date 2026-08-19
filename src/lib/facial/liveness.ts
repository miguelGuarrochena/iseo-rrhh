/**
 * Prueba de vida para el fichaje facial.
 *
 * Qué protege y qué no (esto va primero a propósito)
 * --------------------------------------------------
 * La versión anterior de este archivo medía la apertura del ojo y
 * declaraba "vivo" cuando veía un parpadeo. Eso corta la foto impresa y
 * la foto en la pantalla de otro teléfono. **No corta un vídeo**, que en
 * un control horario es justamente el ataque realista: el compañero
 * graba cinco segundos de la persona que llegó tarde y ficha por ella.
 *
 * Llamar "liveness" a un detector de parpadeo es generoso. Acá hay dos
 * niveles y cada uno dice exactamente qué garantiza:
 *
 * | Ataque | Parpadeo | + Desafío de pose |
 * |---|---|---|
 * | Foto impresa | corta | corta |
 * | Foto en pantalla | corta | corta |
 * | Vídeo pregrabado de frente | **no corta** | corta |
 * | Vídeo pregrabado girando a los dos lados | no corta | encarece mucho |
 * | Máscara, deepfake en vivo | no corta | no corta |
 *
 * El desafío de pose funciona porque el lado se sortea **en el momento**
 * y hay que responderlo en una ventana corta. Un atacante con un vídeo
 * pregrabado tendría que tener material de la persona girando a los dos
 * lados y elegir el correcto antes de que se venza la ventana. No es
 * imposible; es varios órdenes de magnitud más caro que sostener un
 * teléfono frente a la cámara.
 *
 * Lo que **no** se va a afirmar en ningún lado del producto es que esto
 * resiste una máscara o un deepfake en vivo. No los resiste. Cerrar eso
 * necesita un modelo de anti-spoofing por textura o un SDK certificado
 * iBeta, y está documentado como paso siguiente con su costo.
 */

/**
 * Umbrales del parpadeo, sobre el blendshape `eyeBlink*` de MediaPipe.
 *
 * Va de 0 (ojo bien abierto) a 1 (cerrado). Se usan dos umbrales con una
 * banda muerta en el medio: un valor que oscila alrededor de un único
 * umbral contaría como varios parpadeos y aceptaría como "vivo" a una
 * foto con ruido de cámara.
 *
 * Reemplaza al EAR (relación de aspecto del ojo) que se calculaba a mano
 * sobre los 6 puntos por ojo de face-api. El blendshape es mejor por dos
 * razones: lo produce un modelo entrenado para esto —así que no se
 * confunde con la mirada baja ni con los anteojos, que eran los dos
 * casos que rompían el EAR— y ya viene calculado en la misma pasada, o
 * sea que no cuesta nada.
 */
export const OJO_CERRADO = 0.6;
export const OJO_ABIERTO = 0.35;

/** Cuadros mínimos para poder afirmar algo sobre el parpadeo. */
export const CUADROS_MINIMOS = 6;

/**
 * ¿La secuencia contiene un parpadeo completo?
 *
 * Se exige el ciclo entero —abierto, cerrado, abierto— y no un cuadro
 * suelto con los ojos cerrados: si sólo se mirara eso, una foto de
 * alguien con los ojos cerrados pasaría.
 *
 * Cada valor es el máximo de los dos ojos: un ojo puede quedar tapado
 * por el pelo o por un reflejo en los anteojos, y ahí ese ojo miente. El
 * máximo detecta el cierre aunque uno solo se vea bien.
 */
export const hayParpadeo = (cierres: ReadonlyArray<number>): boolean => {
  let vioAbierto = false;
  let vioCerrado = false;

  for (const c of cierres) {
    if (!vioAbierto) {
      if (c <= OJO_ABIERTO) vioAbierto = true;
      continue;
    }
    if (!vioCerrado) {
      if (c >= OJO_CERRADO) vioCerrado = true;
      continue;
    }
    if (c <= OJO_ABIERTO) return true;
  }

  return false;
};

// ---------------------------------------------------------------------
// Desafío de pose
// ---------------------------------------------------------------------

export type Lado = 'izquierda' | 'derecha';

/**
 * Giro mínimo, en el índice de yaw de `geometria`.
 *
 * Es un giro claro pero cómodo: bastante más que el máximo que acepta la
 * puerta de calidad (0,16), así que no se puede cumplir el desafío
 * quedándose quieto, y bastante menos que un perfil completo, así que no
 * hay que hacer contorsiones con una fila esperando atrás.
 *
 * 0,24 alcanza para que no sea un vistazo accidental y para que un
 * operario lo complete en un segundo, no en un giro de perfil.
 */
export const YAW_DESAFIO = 0.24;

/** Vuelta al frente para dar por cerrado el desafío. */
export const YAW_FRONTAL = 0.15;

/**
 * Ventana para completar el gesto. Vencida, se **repite el mismo lado**:
 * sortear el otro en el mismo intento era lo que hacía que en planta
 * pareciera que había que mirar a los dos lados.
 */
export const MS_DESAFIO = 4000;

/**
 * Sortea el lado con `crypto.getRandomValues`.
 *
 * No es paranoia: `Math.random()` es predecible, y todo el valor del
 * desafío está en que el atacante no pueda anticipar qué se le va a
 * pedir. Si el lado fuese predecible, el desafío no agrega nada sobre el
 * parpadeo.
 */
export const sortearLado = (): Lado => {
  const buffer = new Uint8Array(1);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(buffer);
  } else {
    buffer[0] = Math.floor(Math.random() * 256);
  }
  return buffer[0] % 2 === 0 ? 'izquierda' : 'derecha';
};

/** Texto para la persona. "Tu izquierda", no "la izquierda de la pantalla". */
export const PEDIDO_DESAFIO: Record<Lado, string> = {
  izquierda: 'Parpadeá y mirá a tu izquierda',
  derecha: 'Parpadeá y mirá a tu derecha',
};

/**
 * ¿La secuencia de yaw responde al lado pedido?
 *
 * Se exige el gesto completo —frente, giro al lado correcto, vuelta al
 * frente— por el mismo motivo que en el parpadeo: si alcanzara con estar
 * girado, bastaría con presentar una foto de perfil.
 *
 * El signo sale de `poseDeReferencias`: yaw positivo = el sujeto gira
 * hacia **su** izquierda.
 */
export const cumpleDesafio = (
  lado: Lado,
  yaws: ReadonlyArray<number>
): boolean => {
  const signo = lado === 'izquierda' ? 1 : -1;
  let vioFrente = false;
  let vioGiro = false;

  for (const y of yaws) {
    const orientado = y * signo;
    if (!vioFrente) {
      if (Math.abs(y) <= YAW_FRONTAL) vioFrente = true;
      continue;
    }
    if (!vioGiro) {
      if (orientado >= YAW_DESAFIO) vioGiro = true;
      // Girar para el lado contrario invalida el intento: es la señal de
      // que la persona no entendió, o de que lo que hay del otro lado es
      // un vídeo que gira para donde tenía ganas.
      else if (orientado <= -YAW_DESAFIO) return false;
      continue;
    }
    if (Math.abs(y) <= YAW_FRONTAL) return true;
  }

  return false;
};

/**
 * ¿Giró al lado contrario después de estar de frente?
 *
 * Si pasó, el intento de este lado ya no se puede completar con esa
 * secuencia: `cumpleDesafio` queda en falso para siempre. Hay que
 * reiniciar el gesto **sin** cambiar de lado, para no mandar a la
 * persona a hacer los dos giros en el mismo intento.
 */
export const giroAlReves = (
  lado: Lado,
  yaws: ReadonlyArray<number>
): boolean => {
  const signo = lado === 'izquierda' ? 1 : -1;
  let vioFrente = false;
  for (const y of yaws) {
    if (!vioFrente) {
      if (Math.abs(y) <= YAW_FRONTAL) vioFrente = true;
      continue;
    }
    if (y * signo <= -YAW_DESAFIO) return true;
  }
  return false;
};

// ---------------------------------------------------------------------
// Detección de cámara trabada
// ---------------------------------------------------------------------

/**
 * ¿El vídeo dejó de actualizarse?
 *
 * **Esto no es anti-spoofing y no se presenta como tal.** Es un control
 * de salud del hardware: en las tablets Android el track de la cámara se
 * traba —por presión de memoria, por térmica, o porque el sistema la
 * suspendió— y sigue entregando el último cuadro. Sin este chequeo, el
 * pipeline sigue "viendo" una cara perfectamente quieta, la puerta de
 * calidad la aprueba con puntaje alto, y el sistema se queda intentando
 * fichar contra un cuadro congelado hasta que alguien se cansa.
 *
 * Una persona real, incluso quieta, mueve el centroide de la cara
 * décimas de píxel entre cuadros. Cero movimiento **exacto** durante
 * varios cuadros es un cuadro repetido, no una persona quieta.
 */
export const CUADROS_PARA_TRABADA = 8;
export const MOVIMIENTO_MINIMO = 1e-4;

export const camaraTrabada = (movimientos: ReadonlyArray<number>): boolean =>
  movimientos.length >= CUADROS_PARA_TRABADA &&
  movimientos.slice(-CUADROS_PARA_TRABADA).every((m) => m < MOVIMIENTO_MINIMO);

// ---------------------------------------------------------------------
// Veredicto
// ---------------------------------------------------------------------

export type Exigencia = 'ninguna' | 'parpadeo' | 'parpadeo_y_desafio';

export type ResultadoLiveness =
  | { vivo: true }
  | {
      vivo: false;
      motivo:
        | 'pocos_cuadros'
        | 'sin_parpadeo'
        | 'desafio_no_cumplido'
        | 'camara_trabada';
    };

export interface EntradaLiveness {
  exigencia: Exigencia;
  /** Máximo de los dos blendshapes de parpadeo, un valor por cuadro. */
  cierres: ReadonlyArray<number>;
  /** Índice de yaw, un valor por cuadro. */
  yaws: ReadonlyArray<number>;
  /** Desplazamiento del centro entre cuadros consecutivos. */
  movimientos: ReadonlyArray<number>;
  /** Lado sorteado, si la exigencia incluye desafío. */
  lado?: Lado | null;
}

/**
 * Veredicto sobre lo observado.
 *
 * Ante la duda **no se da por viva**: que la persona repita el gesto
 * cuesta unos segundos; registrar una fichada que no hizo cuesta un
 * problema con el registro horario.
 */
export const evaluarLiveness = (e: EntradaLiveness): ResultadoLiveness => {
  if (camaraTrabada(e.movimientos)) {
    return { vivo: false, motivo: 'camara_trabada' };
  }

  if (e.exigencia === 'ninguna') return { vivo: true };

  if (e.cierres.length < CUADROS_MINIMOS) {
    return { vivo: false, motivo: 'pocos_cuadros' };
  }

  if (!hayParpadeo(e.cierres)) {
    return { vivo: false, motivo: 'sin_parpadeo' };
  }

  if (e.exigencia === 'parpadeo_y_desafio') {
    if (!e.lado || !cumpleDesafio(e.lado, e.yaws)) {
      return { vivo: false, motivo: 'desafio_no_cumplido' };
    }
  }

  return { vivo: true };
};

export const MENSAJE_LIVENESS: Record<
  Extract<ResultadoLiveness, { vivo: false }>['motivo'],
  string
> = {
  pocos_cuadros:
    'No llegamos a verte bien. Quedate frente a la cámara y probá de nuevo.',
  sin_parpadeo: 'Mirá a la cámara y parpadeá una vez.',
  desafio_no_cumplido:
    'No pudimos confirmar que sos vos en persona. Probá de nuevo siguiendo la indicación.',
  camara_trabada:
    'La cámara se trabó. Cerrá y volvé a abrir el fichaje; si sigue igual, reiniciá la tablet.',
};
