/**
 * Batería de falsos positivos: el error que este producto no puede
 * cometer.
 *
 * El criterio es explícito y asimétrico. Un **falso negativo** cuesta que
 * el empleado vuelva a mirar la cámara: cinco segundos y nadie se entera.
 * Un **falso positivo** mete la marca de asistencia de otra persona en un
 * registro horario que puede terminar en una inspección o en un juicio
 * laboral, y **nadie se entera nunca** — no hay síntoma, no hay error, no
 * hay a quién le falle nada. Por eso cada caso de acá está escrito para
 * fallar del lado seguro.
 *
 * Qué NO prueba este archivo, y hay que decirlo
 * ---------------------------------------------
 * Las distancias de abajo son sintéticas. **No demuestran que el modelo
 * separe a dos personas reales**: eso sólo lo demuestra la calibración en
 * la tablet, con personas, y por eso existe `/app/diagnostico-facial`.
 * Lo que sí demuestran es que la *lógica de decisión* falla del lado
 * correcto — que un empate rechaza, que un cuadro malo no llega al
 * modelo, y que una plantilla de otra versión no se compara. Esa
 * distinción es la diferencia entre un test que da confianza y uno que
 * la simula.
 */

import { entraEnCuadro, type FuenteCuadro } from '@/lib/facial/alineamiento';
import {
  evaluarCalidad,
  evaluarGeometria,
  PUNTAJE_ACEPTABLE,
  UMBRALES,
  type EntradaCalidad,
} from '@/lib/facial/calidad';
import { necesitaReenrolar, plantillaVigente } from '@/lib/facial/enrolado';
import type { Pose, Referencias } from '@/lib/facial/geometria';
import { evaluarLiveness, YAW_DESAFIO } from '@/lib/facial/liveness';
import {
  distancia,
  MARGEN_MINIMO,
  UMBRAL_IDENTIFICACION,
  VERSION_PLANTILLA,
} from '@/lib/facial/plantilla';
import { umbralConservador } from '@/lib/facial/banco';

const ANCHO = 1280;
const ALTO = 720;

const referencias = (s: Partial<Referencias> = {}): Referencias => ({
  ojoDerecho: { x: 560, y: 330 },
  ojoIzquierdo: { x: 720, y: 330 },
  boca: { x: 640, y: 450 },
  nariz: { x: 640, y: 390 },
  costadoDerecho: { x: 505, y: 380 },
  costadoIzquierdo: { x: 775, y: 380 },
  frente: { x: 640, y: 245 },
  menton: { x: 640, y: 520 },
  interocular: 160,
  ...s,
});

const pose = (s: Partial<Pose> = {}): Pose => ({
  rollGrados: 0,
  yaw: 0,
  pitch: 0,
  ...s,
});

const entrada = (s: Partial<EntradaCalidad> = {}): EntradaCalidad => ({
  referencias: referencias(),
  pose: pose(),
  estadisticas: { luma: 130, contraste: 45, nitidez: 0.05 },
  anchoCuadro: ANCHO,
  altoCuadro: ALTO,
  parpadeoDerecho: 0.05,
  parpadeoIzquierdo: 0.05,
  centroAnterior: null,
  ...s,
});

// ---------------------------------------------------------------------
// 1. Identidad: A es A, B no es A
// ---------------------------------------------------------------------

/**
 * Plantillas sintéticas separadas por construcción.
 *
 * `base` es el "rostro" de A; las variantes son A en otra condición
 * (ruido chico) y B es otra persona (desplazamiento grande). Sirve para
 * probar la **regla de decisión**, no la capacidad del modelo.
 */
const plantilla = (semilla: number, ruido = 0): number[] =>
  Array.from({ length: 128 }, (_, i) => Math.sin(semilla + i) + ruido);

describe('la persona correcta entra y la incorrecta no', () => {
  const A = plantilla(1);
  const AotraCondicion = plantilla(1, 0.01);
  const B = plantilla(50);

  it('A contra su propia plantilla queda muy por debajo del umbral', () => {
    expect(distancia(A, AotraCondicion)).toBeLessThan(UMBRAL_IDENTIFICACION);
  });

  it('B contra la plantilla de A queda muy por encima del umbral', () => {
    // Es el caso que da nombre a este archivo: si esta comparación
    // entrara, el sistema registraría la asistencia de A cuando quien se
    // paró frente a la cámara fue B.
    expect(distancia(B, A)).toBeGreaterThan(UMBRAL_IDENTIFICACION);
  });

  it('el umbral conservador no deja pasar a ningún impostor medido', () => {
    const genuinas = [0.28, 0.31, 0.35, 0.4];
    const impostoras = [0.62, 0.71, 0.83, 0.95];
    const r = umbralConservador(genuinas, impostoras)!;
    expect(impostoras.every((d) => d > r.umbral)).toBe(true);
  });
});

describe('empate entre dos candidatos parecidos', () => {
  /**
   * Réplica en TypeScript de la regla de margen que aplica
   * `fichar_con_rostro` en 1:N.
   *
   * La decisión de producción vive en SQL y ahí es donde manda; esto
   * documenta y fija la **regla**, para que si alguien la afloja del lado
   * del servidor haya un test que diga qué se está aflojando y por qué
   * estaba puesta.
   */
  const decidir = (
    mejor: number,
    segunda: number,
    umbral = UMBRAL_IDENTIFICACION,
    margen = MARGEN_MINIMO
  ): 'ficha' | 'rechaza' =>
    mejor <= umbral && segunda - mejor >= margen ? 'ficha' : 'rechaza';

  it('rechaza cuando el segundo candidato está demasiado cerca', () => {
    // Hermanos, mellizos, o una plantilla mala. Ante la duda no se ficha:
    // pedir otro intento cuesta segundos, fichar a la persona equivocada
    // no se detecta nunca.
    expect(decidir(0.42, 0.44)).toBe('rechaza');
  });

  it('ficha cuando el mejor está claramente separado del segundo', () => {
    expect(decidir(0.3, 0.6)).toBe('ficha');
  });

  it('rechaza aunque el margen sobre, si el mejor no entra en el umbral', () => {
    expect(decidir(0.7, 1.2)).toBe('rechaza');
  });

  it('la decisión cambia alrededor del margen mínimo', () => {
    // No se prueba el borde exacto a propósito: `0.3 + 0.05` da
    // 0.34999999999999998 en punto flotante, así que una aserción
    // pegada al límite estaría probando IEEE 754 y no la regla. Lo que
    // importa es que la regla discrimine, y que ante la duda —el caso
    // ambiguo— caiga del lado de rechazar.
    const holgado = MARGEN_MINIMO + 0.01;
    const escaso = MARGEN_MINIMO - 0.01;
    expect(decidir(0.3, 0.3 + holgado)).toBe('ficha');
    expect(decidir(0.3, 0.3 + escaso)).toBe('rechaza');
  });
});

// ---------------------------------------------------------------------
// 2. Condiciones adversas: ninguna debe producir un descriptor
// ---------------------------------------------------------------------

/**
 * Todos estos casos comparten un mismo objetivo: que el cuadro **no
 * llegue al modelo**.
 *
 * Un descriptor sacado de una cara girada, movida, a contraluz o a dos
 * metros no es "un poco peor": está corrido en el espacio de 128
 * dimensiones por un motivo que no tiene nada que ver con la identidad, y
 * puede caer cerca de cualquiera. La puerta de calidad existe para que
 * esos cuadros no se conviertan nunca en una decisión.
 */
describe('cuadros que no deben llegar al modelo', () => {
  it.each([
    [
      'persona demasiado lejos',
      { referencias: referencias({ interocular: 60 }) },
      'lejos',
    ],
    [
      'persona demasiado cerca',
      { referencias: referencias({ interocular: 480 }) },
      'cerca',
    ],
    ['cara girada', { pose: pose({ yaw: 0.45 }) }, 'de_perfil'],
    ['cabeza inclinada', { pose: pose({ rollGrados: 28 }) }, 'inclinado'],
    ['mirando hacia abajo', { pose: pose({ pitch: -0.45 }) }, 'cabeza_baja'],
    [
      'ojos cerrados',
      { parpadeoDerecho: 0.95, parpadeoIzquierdo: 0.95 },
      'ojos_cerrados',
    ],
    ['en movimiento', { centroAnterior: { x: 100, y: 100 } }, 'movido'],
  ])('rechaza %s', (_, cambio, motivo) => {
    const v = evaluarGeometria(entrada(cambio as Partial<EntradaCalidad>));
    expect(v.ok).toBe(false);
    expect(v.motivo).toBe(motivo);
  });

  it.each([
    ['mala iluminación', { luma: 25, contraste: 45, nitidez: 0.05 }, 'oscuro'],
    [
      'contraluz que quema',
      { luma: 245, contraste: 45, nitidez: 0.05 },
      'quemado',
    ],
    [
      'imagen plana',
      { luma: 130, contraste: 8, nitidez: 0.05 },
      'sin_contraste',
    ],
    ['fuera de foco', { luma: 130, contraste: 45, nitidez: 0.0005 }, 'borroso'],
  ])('rechaza %s', (_, estadisticas, motivo) => {
    const v = evaluarCalidad(entrada({ estadisticas }));
    expect(v.ok).toBe(false);
    expect(v.motivo).toBe(motivo);
  });

  it('rechaza la cara parcialmente fuera del cuadro', () => {
    // Media cara produce un recorte con un pedazo de fondo gris, y el
    // descriptor de esa media cara puede caer cerca de cualquiera.
    const pegadaAlBorde = referencias({
      ojoDerecho: { x: -40, y: 330 },
      ojoIzquierdo: { x: 120, y: 330 },
      boca: { x: 40, y: 450 },
      costadoDerecho: { x: -180, y: 380 },
      frente: { x: 40, y: 245 },
      menton: { x: 40, y: 520 },
      nariz: { x: 40, y: 390 },
    });
    expect(entraEnCuadro(pegadaAlBorde, ANCHO, ALTO)).toBe(false);
  });

  it('acepta la cara bien encuadrada', () => {
    expect(entraEnCuadro(referencias(), ANCHO, ALTO)).toBe(true);
  });

  it('un cuadro apenas aceptable no alcanza para entrar a la plantilla', () => {
    // Pasar la puerta no basta: además hace falta puntaje. Un cuadro que
    // apenas entra arrastra la plantilla hacia el ruido.
    const limite = evaluarCalidad(
      entrada({ pose: pose({ yaw: UMBRALES.yawMaximo * 0.97 }) })
    );
    expect(limite.ok).toBe(true);
    expect(limite.puntaje).toBeLessThan(PUNTAJE_ACEPTABLE);
  });
});

// ---------------------------------------------------------------------
// 3. Ausencia de rostro y varios rostros
// ---------------------------------------------------------------------

/**
 * Estos dos los decide el motor mirando `cuadro.caras`, antes de tocar
 * nada más. Se documenta acá el comportamiento definido para que quede
 * asentado cuál es, porque "qué pasa si hay dos personas" es la primera
 * pregunta que hace cualquiera que audite el sistema.
 *
 * - **0 rostros** → el motor no avanza; muestra "Buscando tu rostro…".
 *   Nunca produce descriptor.
 * - **2 o más rostros** → el motor **no elige**: rechaza el cuadro y pide
 *   que quede una sola persona. Elegir "la cara más grande" sería
 *   exactamente cómo se ficha a alguien que pasaba por atrás.
 *
 * MediaPipe se configura con `numFaces: 2` justamente para poder ver que
 * hay una segunda: con `numFaces: 1` el modelo devolvería la más
 * prominente y el sistema no tendría forma de saber que había otra.
 */
describe('rostros presentes en el cuadro', () => {
  const decidirPorCaras = (caras: number): string =>
    caras === 0 ? 'sin_rostro' : caras > 1 ? 'varios_rostros' : 'sigue';

  it('sin rostro no avanza', () => {
    expect(decidirPorCaras(0)).toBe('sin_rostro');
  });

  it('con dos rostros no elige ninguno', () => {
    expect(decidirPorCaras(2)).toBe('varios_rostros');
  });

  it('sólo avanza con exactamente un rostro', () => {
    expect(decidirPorCaras(1)).toBe('sigue');
  });
});

// ---------------------------------------------------------------------
// 4. Presentación: foto, pantalla, vídeo
// ---------------------------------------------------------------------

/**
 * ⚠ **No hay anti-spoofing por textura, y no se afirma que lo haya.**
 *
 * Lo único implementado es lo que sigue, y sólo cubre lo que dice cubrir:
 *
 * | Ataque | Qué lo corta | ¿Corta? |
 * |---|---|---|
 * | Foto impresa | parpadeo (una foto no parpadea) | sí |
 * | Foto en pantalla de otro teléfono | parpadeo | sí |
 * | Foto con los ojos cerrados | ciclo abierto→cerrado→abierto | sí |
 * | Foto de perfil | el desafío exige empezar de frente | sí |
 * | **Vídeo pregrabado de frente** | parpadeo (el vídeo parpadea) | **NO** |
 * | Vídeo pregrabado, un solo lado grabado | desafío de lado sorteado | sí |
 * | **Vídeo con los dos giros grabados** | nada | **NO** |
 * | **Máscara, deepfake en vivo** | nada | **NO** |
 *
 * Cerrar las filas en negrita necesita un modelo de anti-spoofing por
 * textura (MiniFASNet, Apache 2.0, ~600 KB) o un SDK certificado iBeta.
 * Está identificado y no está implementado.
 *
 * El fichaje de la app usa el nivel `parpadeo` (de frente, sin giro).
 * `parpadeo_y_desafio` sigue testeado acá porque el motor lo conserva.
 */
describe('protección frente a presentación (lo que hay y lo que no)', () => {
  const abierto = 0.1;
  const cerrado = 0.9;
  const movimientoNormal = Array(20).fill(0.004);
  const parpadeoCompleto = [
    abierto,
    abierto,
    abierto,
    abierto,
    abierto,
    abierto,
    cerrado,
    abierto,
  ];

  it('corta la foto: ojos siempre abiertos, sin parpadeo', () => {
    const r = evaluarLiveness({
      exigencia: 'parpadeo',
      cierres: Array(20).fill(abierto),
      yaws: [],
      movimientos: movimientoNormal,
    });
    expect(r).toEqual({ vivo: false, motivo: 'sin_parpadeo' });
  });

  it('corta la foto con los ojos cerrados', () => {
    const r = evaluarLiveness({
      exigencia: 'parpadeo',
      cierres: Array(20).fill(cerrado),
      yaws: [],
      movimientos: movimientoNormal,
    });
    expect(r.vivo).toBe(false);
  });

  it('corta el vídeo que gira siempre para el mismo lado', () => {
    // El lado se sortea en el momento. Un atacante con material de un
    // solo giro acierta la mitad de las veces y falla la otra mitad.
    const r = evaluarLiveness({
      exigencia: 'parpadeo_y_desafio',
      cierres: parpadeoCompleto,
      yaws: [0, -(YAW_DESAFIO + 0.1), 0],
      movimientos: movimientoNormal,
      lado: 'izquierda',
    });
    expect(r).toEqual({ vivo: false, motivo: 'desafio_no_cumplido' });
  });

  it('DOCUMENTADO: un vídeo de frente que parpadea SÍ pasa el nivel de parpadeo', () => {
    // Este test afirma una **limitación**, no una protección. El fichaje
    // (planta y celular) usa este nivel: una foto no pasa, un vídeo de
    // frente sí. El giro de cabeza (`parpadeo_y_desafio`) sigue en el
    // motor por si se vuelve a pedir, pero el producto no lo usa.
    const r = evaluarLiveness({
      exigencia: 'parpadeo',
      cierres: parpadeoCompleto,
      yaws: [],
      movimientos: movimientoNormal,
    });
    expect(r).toEqual({ vivo: true });
  });

  it('el nivel con giro sigue exigiendo el lado sorteado', () => {
    const r = evaluarLiveness({
      exigencia: 'parpadeo_y_desafio',
      cierres: parpadeoCompleto,
      yaws: [0, 0, 0],
      movimientos: movimientoNormal,
      lado: 'derecha',
    });
    expect(r.vivo).toBe(false);
  });

  it('detecta la cámara trabada antes que cualquier otra cosa', () => {
    // No es anti-spoofing: es salud del hardware. Un track congelado
    // entrega siempre el mismo cuadro y la puerta de calidad lo aprueba
    // con puntaje alto, porque efectivamente está perfectamente quieto.
    const r = evaluarLiveness({
      exigencia: 'parpadeo',
      cierres: parpadeoCompleto,
      yaws: [],
      movimientos: Array(12).fill(0),
    });
    expect(r).toEqual({ vivo: false, motivo: 'camara_trabada' });
  });
});

// ---------------------------------------------------------------------
// 5. Mezcla de versiones de plantilla
// ---------------------------------------------------------------------

/**
 * Comparar una plantilla del pipeline viejo contra una del nuevo puede
 * dar cualquier número. Uno de los dos desenlaces es un falso positivo, y
 * por eso este bloque vive en este archivo y no en el de enrolamiento.
 */
describe('plantillas de versiones distintas no se comparan', () => {
  it('una plantilla de la versión anterior no está vigente', () => {
    expect(
      plantillaVigente({
        tieneRostro: true,
        descriptorVersion: VERSION_PLANTILLA - 1,
      })
    ).toBe(false);
  });

  it('quien tiene plantilla vieja queda marcado para re-enrolar', () => {
    expect(necesitaReenrolar({ tieneRostro: true, descriptorVersion: 1 })).toBe(
      true
    );
  });

  it('la versión del cliente es un número, no una cadena libre', () => {
    // Viaja al RPC como `p_version smallint`. Si acá se colara un string
    // el filtro de versión del servidor no aplicaría como se espera.
    expect(typeof VERSION_PLANTILLA).toBe('number');
    expect(Number.isInteger(VERSION_PLANTILLA)).toBe(true);
  });
});

// ---------------------------------------------------------------------
// 6. Que el tipo de la fuente de cuadro siga siendo el esperado
// ---------------------------------------------------------------------

describe('contrato del alineamiento', () => {
  it('acepta sólo fuentes de las que se puede leer un cuadro', () => {
    // Chequeo de tipos, no de runtime: si alguien amplía `FuenteCuadro` a
    // algo que `drawImage` no acepta, esto deja de compilar.
    const tipos: FuenteCuadro[] = [];
    expect(tipos).toHaveLength(0);
  });
});
